let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let orbitaMap = null;
let orbitaLayer = null;
let reentryMarker = null; // Para marcar la posición de reentrada en el mapa de órbita

const iconoAmarillo = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  iconSize: [18, 29],
  iconAnchor: [9, 29],
  popupAnchor: [1, -30]
});
const iconoVerde = L.icon({
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
  const year = parseInt(fecha.slice(0,4), 10);
  if (year < 2000) return iconoAmarillo;
  if (year <= 2018) return iconoVerde;
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
        Masa caída: ${d.tamano_caida_kg} kg<br>
        Material: ${d.material_principal}<br>
        Inclinación órbita: ${d.inclinacion_orbita ?? "?"}°<br>
        Fecha: ${d.fecha}<br>
        ${d.imagen ? `<img src="${d.imagen}" alt="${d.nombre}"><br>` : ''}
        ${d.tle && d.tle.length === 2 ? `<button class="btn btn-sm btn-info mt-2 ver-orbita" data-nombre="${encodeURIComponent(d.nombre)}">Ver última órbita</button>` : ''}
      `;
      const marker = L.marker([d.lugar_caida.lat, d.lugar_caida.lon], {icon: marcadorPorFecha(d.fecha)})
        .bindPopup(popupContenido, {autoPan: true});

      marker.on('popupopen', function(e) {
        const imgs = e.popup._contentNode.querySelectorAll('img');
        imgs.forEach(function(img) {
          img.addEventListener('load', function() {
            e.popup.update();
          });
        });
      });

      capaPuntos.addLayer(marker);
    });
    capaPuntos.addTo(mapa);
    mostrarLeyendaPuntos();
  } else {
    const heatData = datosFiltrados.map(d => [d.lugar_caida.lat, d.lugar_caida.lon]);
    if (heatData.length) {
      capaCalor = L.heatLayer(heatData, {
        radius: 30,
        blur: 25,
        minOpacity: 0.4,
        max: 30,
        gradient: {
          0.1: 'blue',
          0.3: 'lime',
          0.6: 'yellow',
          1.0: 'red'
        }
      }).addTo(mapa);
    }
    mostrarLeyendaCalor();
  }
  actualizarBotonesModo();
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('ver-orbita')) {
    const nombre = decodeURIComponent(e.target.getAttribute('data-nombre'));
    const sat = debris.find(x => x.nombre === nombre);
    if (sat && sat.tle && sat.tle.length === 2) {
      mostrarOrbitaEnModal(sat.tle, sat.nombre, sat.lugar_caida);
    }
  }
});

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
      div.innerHTML +=
        `<i style="background:${colors[i]};width:14px;height:14px;display:inline-block;margin-right:5px;border-radius:2px;"></i> ${grades[i]}<br>`;
    }
    return div;
  };
  leyendaCalor.addTo(mapa);
}

// Cambiado: MAPTILER VECTOR TILE (tu propio estilo)
function initMapa() {
  mapa = L.map('map', { maxZoom: 19 }).setView([0, 0], 2);
  L.tileLayer('https://api.maptiler.com/tiles/019842c3-c233-72bc-87bb-6a932bad4058/{z}/{x}/{y}.png?key=Qz3BoFqkGmS3yT8lCQhS', {
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
    maxZoom: 19,
    tileSize: 512,
    zoomOffset: -1
  }).addTo(mapa);
}

function listeners() {
  ["pais", "material", "masa", "fecha-desde", "fecha-hasta", "inclinacion-min", "inclinacion-max"].forEach(id => {
    document.getElementById(id).addEventListener("change", actualizarMapa);
  });
  document.getElementById("modo-puntos").addEventListener("click", () => {
    modo = "puntos";
    actualizarMapa();
  });
  document.getElementById("modo-calor").addEventListener("click", () => {
    modo = "calor";
    actualizarMapa();
  });
}

// Modal y Leaflet para órbita con MapTiler (tu propio estilo)
function mostrarOrbitaEnModal(tle, nombre, lugar_caida = null) {
  const modal = new bootstrap.Modal(document.getElementById('orbitaModal'));
  document.getElementById('orbitaModalLabel').textContent = `Órbita de ${nombre}`;
  setTimeout(() => {
    if (!orbitaMap) {
      orbitaMap = L.map('orbita-map', { zoomControl: true, maxZoom: 19 }).setView([0,0], 2);
      L.tileLayer('https://api.maptiler.com/tiles/019842c3-c233-72bc-87bb-6a932bad4058/{z}/{x}/{y}.png?key=Qz3BoFqkGmS3yT8lCQhS', {
        attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
        maxZoom: 19,
        tileSize: 512,
        zoomOffset: -1
      }).addTo(orbitaMap);
    }
    if (orbitaLayer) {
      orbitaMap.removeLayer(orbitaLayer);
      orbitaLayer = null;
    }
    if (reentryMarker) {
      orbitaMap.removeLayer(reentryMarker);
      reentryMarker = null;
    }
    calcularYMostrarOrbita(tle, orbitaMap, lugar_caida);
    orbitaMap.invalidateSize();
  }, 400);
  modal.show();
}

function unwrapLongitudesAndClip(points) {
  if (points.length === 0) return [];
  let prevLon = points[0][1];
  const result = [];
  let offset = 0;
  let currentSegment = [[points[0][0], prevLon]];
  for (let i = 1; i < points.length; i++) {
    let lon = points[i][1];
    let diff = lon + offset - prevLon;
    if (diff > 180) offset -= 360;
    else if (diff < -180) offset += 360;
    lon += offset;
    if (lon < -180 || lon > 180) {
      if (currentSegment.length > 1) result.push(currentSegment);
      if (lon >= -180 && lon <= 180)
        currentSegment = [[points[i][0], lon]];
      else
        currentSegment = [];
    } else {
      currentSegment.push([points[i][0], lon]);
    }
    prevLon = lon;
  }
  if (currentSegment.length > 1) result.push(currentSegment);
  return result;
}

function calcularYMostrarOrbita(tle, leafletMap, lugar_caida = null) {
  const satrec = satellite.twoline2satrec(tle[0], tle[1]);
  const now = new Date();
  const period_mins = 90 * 3;
  const points = [];
  for (let i = 0; i <= period_mins; i += 1) {
    const time = new Date(now.getTime() + i * 60 * 1000);
    const posVel = satellite.propagate(satrec, time);
    if (!posVel || !posVel.position) continue;
    const gmst = satellite.gstime(time);
    const positionGd = satellite.eciToGeodetic(posVel.position, gmst);
    const lat = satellite.degreesLat(positionGd.latitude);
    let lon = satellite.degreesLong(positionGd.longitude);
    if (isFinite(lat) && isFinite(lon)) points.push([lat, lon]);
  }
  const clippedSegments = unwrapLongitudesAndClip(points);
  if (orbitaLayer) {
    leafletMap.removeLayer(orbitaLayer);
    orbitaLayer = null;
  }
  if (clippedSegments.length > 0) {
    orbitaLayer = L.layerGroup();
    clippedSegments.forEach(seg => {
      L.polyline(seg, {color: 'orange', weight: 3}).addTo(orbitaLayer);
    });
    orbitaLayer.addTo(leafletMap);
    leafletMap.fitBounds(clippedSegments[0], {padding: [30,30]});
  }
  if (lugar_caida && isFinite(lugar_caida.lat) && isFinite(lugar_caida.lon)) {
    reentryMarker = L.marker([lugar_caida.lat, lugar_caida.lon], {
      icon: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      })
    }).addTo(leafletMap);
    reentryMarker.bindPopup('Posición de reentrada').openPopup();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMapa();
  cargarDatos();
  listeners();
});
