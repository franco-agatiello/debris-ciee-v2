let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let currentOrbitLine = null;

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
  const paises = Array.from(new Set(debris.map(d => d.pais))).filter(Boolean);
  const paisSelect = document.getElementById("pais");
  paisSelect.innerHTML = '<option value="">Todos</option>' + paises.map(p => `<option value="${p}">${p}</option>`).join('');

  const materiales = Array.from(new Set(debris.map(d => d.material_principal))).filter(Boolean);
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
    if (filtros.masa) return false; // todos los valores son null
    if (filtros.fechaDesde && d.fecha < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && d.fecha > filtros.fechaHasta) return false;
    if (filtros.inclinacionMin && Number(d.inclinacion_orbita) < Number(filtros.inclinacionMin)) return false;
    if (filtros.inclinacionMax && Number(d.inclinacion_orbita) > Number(filtros.inclinacionMax)) return false;
    return true;
  });
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
    datosFiltrados.forEach((d, idx) => {
      let popupContenido = `
        <strong>${d.nombre ? d.nombre : 'Objeto'}</strong><br>
        NORAD: ${d.norad_cat_id ?? ''}<br>
        País: ${d.pais ?? 'null'}<br>
        Masa caída: ${d.tamano_caida_kg ?? 'null'} kg<br>
        Material: ${d.material_principal ?? 'null'}<br>
        Inclinación órbita: ${d.inclinacion_orbita ?? "?"}°<br>
        Fecha: ${d.fecha}<br>
      `;
      if (d.tle && d.tle.length === 2) {
        popupContenido += `<button class="btn btn-sm btn-outline-warning mt-2" onclick="mostrarOrbitasTLE(${idx})">Ver última órbita (TLE)</button>`;
      }
      const marker = L.marker([d.lugar_caida.lat, d.lugar_caida.lon], {icon: iconoRojo})
        .bindPopup(popupContenido, {autoPan: true});

      marker.on('popupclose', function(e) {
        if (currentOrbitLine) {
          if (Array.isArray(currentOrbitLine)) {
            currentOrbitLine.forEach(l => mapa.removeLayer(l));
          } else {
            mapa.removeLayer(currentOrbitLine);
          }
          currentOrbitLine = null;
        }
      });

      capaPuntos.addLayer(marker);
    });
    capaPuntos.addTo(mapa);
  }
  actualizarBotonesModo();
}

// --- Antimeridiano fix ---
function segmentarPolilineaAntimeridiano(points) {
  if (points.length < 2) return [points];
  const segmentos = [];
  let segmentoActual = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (Math.abs(curr[1] - prev[1]) > 180) {
      segmentos.push(segmentoActual);
      segmentoActual = [curr];
    } else {
      segmentoActual.push(curr);
    }
  }
  if (segmentoActual.length > 1) segmentos.push(segmentoActual);
  return segmentos;
}

window.mostrarOrbitasTLE = function(idx) {
  if (currentOrbitLine) {
    if (Array.isArray(currentOrbitLine)) {
      currentOrbitLine.forEach(l => mapa.removeLayer(l));
    } else {
      mapa.removeLayer(currentOrbitLine);
    }
    currentOrbitLine = null;
  }
  const d = filtrarDatos()[idx];
  if (d.tle && d.tle.length === 2) {
    const points = calcularTrayectoriaDesdeTLE(d.tle, d.fecha, d.lugar_caida);
    const segments = segmentarPolilineaAntimeridiano(points);
    currentOrbitLine = segments.map(seg =>
      L.polyline(seg, {color: 'orange', weight: 3, opacity: 0.8}).addTo(mapa)
    );
    // Ajusta el mapa al primer segmento importante
    if (segments.length && segments[0].length > 1) {
      mapa.fitBounds(L.polyline(segments[0]).getBounds(), {maxZoom: 4});
    }
  }
};

function calcularTrayectoriaDesdeTLE(tleArr, fechaReentrada, lugarCaida) {
  const satrec = satellite.twoline2satrec(tleArr[0], tleArr[1]);
  const epoch = new Date(fechaReentrada + 'T00:00:00Z');
  const minutosOrbita = 90;
  const pasos = 60;
  let points = [];
  for (let i = minutosOrbita; i > 0; i -= minutosOrbita/pasos) {
    const t = new Date(epoch.getTime() - i*60*1000);
    const gmst = satellite.gstime(t);
    const pos = satellite.propagate(satrec, t);
    if (pos.position) {
      const geo = satellite.eciToGeodetic(pos.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      let lon = satellite.degreesLong(geo.longitude);
      // Normaliza a [-180, 180]
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      points.push([lat, lon]);
    }
  }
  points.push([lugarCaida.lat, lugarCaida.lon]);
  return points;
}

function initMapa() {
  mapa = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
}

function listeners() {
  ["pais", "material", "masa", "fecha-desde", "fecha-hasta", "inclinacion-min", "inclinacion-max"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", actualizarMapa);
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

document.addEventListener("DOMContentLoaded", () => {
  initMapa();
  cargarDatos();
  listeners();
});
