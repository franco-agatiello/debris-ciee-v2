let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let lastOrbitPolyline = null;

const iconoAmarillo = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  iconSize: [18, 29],
  iconAnchor: [9, 29],
  popupAnchor: [1, -30]
});
const iconoVerde = L.L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  iconSize: [18, 29],
  iconAnchor: [9, 29],
  popupAnchor: [1, -30]
});
const iconoRojo = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconSize: [18, 29],
  iconAnchor: [9, 29],
  popupAnchor: [1, -30]
});

async function cargarDatos() {
  const resp = await fetch('data/debris.json');
  debris = await resp.json();
  poblarFiltros();
  actualizarMapa();
}

function poblarFiltros() {
  const paises = Array.from(new Set(debris.map(d => d.pais)));
  const paisSelect = document.getElementById("pais");
  paisSelect.innerHTML = '<option value="">Todos</option>' + paises.map(p => `<option value="${p}">${p}</option>`).join('');
  const materiales = Array.from(new Set(debris.map(d => d.material_principal)));
  const materialSelect = document.getElementById("material");
  materialSelect.innerHTML = '<option value="">Todos</option>' + materiales.map(m => `<option value="${m}">${m}</option>`).join('');
}

function obtenerFiltros() {
  return {
    pais: document.getElementById("pais").value,
    material: document.getElementById("material").value,
    masa: document.getElementById("masa").value,
    fechaDesde: document.getElementById("fecha-desde").value,
    fechaHasta: document.getElementById("fecha-hasta").value,
    inclinacionMin: document.getElementById("inclinacion-min").value,
    inclinacionMax: document.getElementById("inclinacion-max").value
  };
}

function filtrarDatos() {
  const filtros = obtenerFiltros();
  return debris.filter(d => {
    if (filtros.pais && d.pais !== filtros.pais) return false;
    if (filtros.material && d.material_principal !== filtros.material) return false;
    if (filtros.masa) {
      if (filtros.masa === "0-10" && !(d.tamano_caida_kg >= 0 && d.tamano_caida_kg <= 10)) return false;
      if (filtros.masa === "10-50" && !(d.tamano_caida_kg > 10 && d.tamano_caida_kg <= 50)) return false;
      if (filtros.masa === "50+" && !(d.tamano_caida_kg > 50)) return false;
    }
    if (filtros.fechaDesde && d.fecha < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && d.fecha > filtros.fechaHasta) return false;
    if (filtros.inclinacionMin && Number(d.inclinacion_orbita) < Number(filtros.inclinacionMin)) return false;
    if (filtros.inclinacionMax && Number(d.inclinacion_orbita) > Number(filtros.inclinacionMax)) return false;
    return true;
  });
}

function marcadorPorFecha(fecha) {
  const año = parseInt(fecha.slice(0,4), 10);
  if (año < 2000) return iconoAmarillo;
  if (año <= 2018) return iconoVerde;
  return iconoRojo;
}

function actualizarBotonesModo() {
  document.getElementById("modo-puntos").classList.toggle("active", modo === "puntos");
  document.getElementById("modo-calor").classList.toggle("active", modo === "calor");
}

function actualizarMapa() {
  const datosFiltrados = filtrarDatos();
  if (capaPuntos) {
    capaPuntos.clearLayers();
    try { mapa.removeLayer(capaPuntos); } catch (e) {}
    capaPuntos = null;
  }
  if (capaCalor && mapa.hasLayer(capaCalor)) {
    mapa.removeLayer(capaCalor);
    capaCalor = null;
  }
  if (leyendaPuntos) leyendaPuntos.remove();
  if (leyendaCalor) leyendaCalor.remove();
  if (modo === "puntos") {
    capaPuntos = L.layerGroup();
    datosFiltrados.forEach(d => {
      const popupContenido = `
        <strong>${d.nombre}</strong><br>
        País: ${d.pais}<br>
        Masa caída: ${d.tamano_caida_kg ?? "?"} kg<br>
        Material: ${d.material_principal ?? "?"}<br>
        Inclinación órbita: ${d.inclinacion_orbita ?? "?"}°<br>
        Fecha: ${d.fecha}<br>
        ${d.imagen ? `<img src="${d.imagen}" alt="${d.nombre}">` : ''}
        <br>
        ${d.tle && d.tle.line1 && d.tle.line2 ? `
          <button class="btn btn-sm btn-outline-primary mt-2" onclick='mostrarOrbita(${JSON.stringify(d.tle)}, ${JSON.stringify(d.reentry?.epoch ?? d.fecha)})'>
            Ver última órbita
          </button>
        ` : ''}
      `;
      const marcador = L.marker([d.lugar_caida.lat, d.lugar_caida.lon], {icon: marcadorPorFecha(d.fecha)})
        .bindPopup(popupContenido, {autoPan: true});
      marcador.on('popupopen', function(e) {
        const imgs = e.popup._contentNode.querySelectorAll('img');
        imgs.forEach(function(img) {
          img.addEventListener('load', function() { e.popup.update(); });
        });
      });
      capaPuntos.addLayer(marcador);
    });
    capaPuntos.addTo(mapa);
    mostrarLeyendaPuntos();
  } else {
    const heatData = datosFiltrados.map(d => [d.lugar_caida.lat, d.lugar_caida.lon]);
    if (heatData.length) {
      capaCalor = L.heatLayer(heatData, { 
        radius: 30, blur: 25, minOpacity: 0.4, max: 30, 
        gradient: { 0.1: 'blue', 0.3: 'lime', 0.6: 'yellow', 1.0: 'red' } 
      }).addTo(mapa);
    }
    mostrarLeyendaCalor();
  }
  actualizarBotonesModo();
}

// --------- INTERPOLACIÓN EN EL ANTIMERIDIANO ---------
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function normalizeLongitude(lon) {
  let l = lon;
  while (l < -180) l += 360;
  while (l > 180) l -= 360;
  return l;
}

function interpolateDatelineCrossing(p1, p2) {
  let lon1 = normalizeLongitude(p1[1]);
  let lon2 = normalizeLongitude(p2[1]);
  let lat1 = p1[0], lat2 = p2[0];
  let lonTarget = lon1 > 0 ? 180 : -180;
  let deltaLon = lon2 - lon1;
  if (Math.abs(deltaLon) < 1e-3) return null;
  let t = (lonTarget - lon1) / deltaLon;
  let latTarget = lat1 + (lat2 - lat1) * t;
  return [latTarget, lonTarget];
}

function splitAndInterpolateOnJump(points) {
  if (points.length < 2) return [points];
  let segments = [];
  let currentSegment = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const prevLon = normalizeLongitude(prev[1]);
    const currLon = normalizeLongitude(curr[1]);
    const lonDiff = Math.abs(currLon - prevLon);
    const dist = haversineDistance(prev[0], prevLon, curr[0], currLon);
    if (lonDiff > 180 || dist > 2000) {
      const interp = interpolateDatelineCrossing(prev, curr);
      if (interp) {
        currentSegment.push(interp);
        segments.push(currentSegment);
        currentSegment = [ [interp[0], interp[1] > 0 ? -180 : 180], curr ];
      } else {
        segments.push(currentSegment);
        currentSegment = [curr];
      }
    } else {
      currentSegment.push(curr);
    }
  }
  if (currentSegment.length > 1) segments.push(currentSegment);
  return segments;
}

function mostrarOrbita(tle, epoch) {
  if (lastOrbitPolyline) {
    mapa.removeLayer(lastOrbitPolyline);
    lastOrbitPolyline = null;
  }
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const fechaReentrada = epoch ? new Date(epoch) : new Date();
  const minutosPorRev = 1440 / satrec.no;
  const tiempoTotal = Math.min(minutosPorRev, 90);
  const paso = 0.2; // 12 segundos
  const points = [];
  for (let t = -tiempoTotal; t <= 0; t += paso) {
    const fecha = new Date(fechaReentrada.getTime() + t * 60 * 1000);
    const posVel = satellite.propagate(satrec, fecha);
    if (posVel.position) {
      const gmst = satellite.gstime(fecha);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      let lon = satellite.degreesLong(geo.longitude);
      lon = normalizeLongitude(lon);
      if (isFinite(lat) && isFinite(lon)) {
        points.push([lat, lon]);
      }
    }
  }
  const segments = splitAndInterpolateOnJump(points);
  lastOrbitPolyline = L.layerGroup();
  segments.forEach(segment => {
    if (segment.length > 1) {
      L.polyline(segment, { color: 'blue', weight: 2, opacity: 0.7 }).addTo(lastOrbitPolyline);
    }
  });
  lastOrbitPolyline.addTo(mapa);
  if (points.length > 0) mapa.fitBounds(L.latLngBounds(points));
}
// --------- FIN INTERPOLACIÓN ---------

function initMapa() {
  mapa = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
  mapa.on('popupclose', function () {
    if (lastOrbitPolyline) {
      mapa.removeLayer(lastOrbitPolyline);
      lastOrbitPolyline = null;
    }
  });
}

function mostrarLeyendaPuntos() {
  leyendaPuntos = L.control({position: 'bottomright'});
  leyendaPuntos.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML += `<strong>Color del marcador según año de caída</strong><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">Antes de 2000</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2000 a 2018</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2019 a Actualidad</span><br>`;
    return div;
  };
  leyendaPuntos.addTo(mapa);
}

function mostrarLeyendaCalor() {
  leyendaCalor = L.control({position: 'bottomright'});
  leyendaCalor.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = ['Bajo', 'Medio', 'Alto', 'Muy alto'];
    const colors = ['blue', 'lime', 'yellow', 'red'];
    div.innerHTML += '<strong>Densidad de caídas</strong><br>';
    for (let i = 0; i < grades.length; i++) {
      div.innerHTML += `<i style="background:${colors[i]};width:14px;height:14px;display:inline-block;margin-right:5px;border-radius:2px;"></i> ${grades[i]}<br>`;
    }
    return div;
  };
  leyendaCalor.addTo(mapa);
}

function listeners() {
  ["pais", "material", "masa", "fecha-desde", "fecha-hasta", "inclinacion-min", "inclinacion-max"].forEach(id => {
    document.getElementById(id).addEventListener("change", actualizarMapa);
  });
  document.getElementById("modo-puntos").addEventListener("click", () => {
    modo = "puntos"; actualizarMapa();
  });
  document.getElementById("modo-calor").addEventListener("click", () => {
    modo = "calor"; actualizarMapa();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMapa();
  cargarDatos();
  listeners();
});
