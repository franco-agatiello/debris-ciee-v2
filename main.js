let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;

// Colores personalizados por rango de año
const iconoAzul = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});
const iconoVerde = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});
const iconoRojo = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});
const iconoAmarillo = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});

async function cargarDatos() {
  const resp = await fetch('data/debris.json');
  debris = await resp.json();
  poblarFiltros();
  actualizarMapa();
}

function poblarFiltros() {
  const paises = Array.from(new Set(debris.map(d => d.pais).filter(p => p && p !== null)));
  paises.sort((a, b) => a.localeCompare(b, 'es'));
  const menu = document.getElementById("dropdownPaisMenu");
  menu.innerHTML = `<li><a class="dropdown-item" href="#" data-value="">Todos</a></li>` +
    paises.map(p => `<li><a class="dropdown-item" href="#" data-value="${p}">${p}</a></li>`).join('');
  menu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('dropdownPaisBtn').textContent = this.textContent;
      document.getElementById('dropdownPaisBtn').dataset.value = this.dataset.value;
      actualizarMapa();
    });
  });
}

function obtenerFiltros() {
  return {
    pais: document.getElementById("dropdownPaisBtn").dataset.value ?? "",
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
    if (filtros.fechaDesde && d.fecha < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && d.fecha > filtros.fechaHasta) return false;
    if (filtros.inclinacionMin && Number(d.inclinacion_orbita) < Number(filtros.inclinacionMin)) return false;
    if (filtros.inclinacionMax && Number(d.inclinacion_orbita) > Number(filtros.inclinacionMax)) return false;
    return true;
  });
}

function marcadorPorFecha(fecha) {
  const year = parseInt(fecha.slice(0,4), 10);
  if (year >= 2004 && year <= 2010) return iconoAzul;
  if (year >= 2011 && year <= 2017) return iconoVerde;
  if (year >= 2018 && year <= 2025) return iconoRojo;
  return iconoAmarillo;
}

function actualizarBotonesModo() {
  document.getElementById("modo-puntos").classList.toggle("active", modo === "puntos");
  document.getElementById("modo-calor").classList.toggle("active", modo === "calor");
}

function popupContenidoDebris(d) {
  let contenido = `<strong>${d.nombre ?? ''}</strong><br>`;
  if (d.pais) contenido += `País: ${d.pais}<br>`;
  if (d.tamano_caida_kg !== null && d.tamano_caida_kg !== undefined) contenido += `Masa caída: ${d.tamano_caida_kg} kg<br>`;
  if (d.material_principal) contenido += `Material: ${d.material_principal}<br>`;
  if (d.inclinacion_orbita !== null && d.inclinacion_orbita !== undefined) contenido += `Inclinación órbita: ${d.inclinacion_orbita}°<br>`;
  if (d.fecha) contenido += `Fecha: ${d.fecha}<br>`;
  if (d.imagen) contenido += `<img src="${d.imagen}" alt="${d.nombre}">`;
  // Botón para ver órbita si hay TLE
  if (d.tle) {
    contenido += `<br><button class="btn btn-sm btn-info ver-orbita-btn" data-nombre="${d.nombre}">Ver órbita</button>`;
  }
  return contenido;
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
      const marker = L.marker([d.lugar_caida.lat, d.lugar_caida.lon], {icon: marcadorPorFecha(d.fecha)})
        .bindPopup(popupContenidoDebris(d), {autoPan: true});
      marker.on('popupopen', function(e) {
        const imgs = e.popup._contentNode.querySelectorAll('img');
        imgs.forEach(function(img) {
          img.addEventListener('load', function() {
            e.popup.update();
          });
        });
        // Listener para el botón de órbita
        const btn = e.popup._contentNode.querySelector('.ver-orbita-btn');
        if (btn) {
          btn.addEventListener('click', function() {
            mostrarOrbitaParaDebris(d);
          });
        }
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

function mostrarLeyendaPuntos() {
  leyendaPuntos = L.control({position: 'bottomright'});
  leyendaPuntos.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML += `<strong>Color del marcador según año de caída</strong><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2004 a 2010</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2011 a 2017</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2018 a 2025</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">Antes de 2004</span><br>`;
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

function initMapa() {
  mapa = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
}

function listeners() {
  ["fecha-desde", "fecha-hasta", "inclinacion-min", "inclinacion-max"].forEach(id => {
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

// Segmenta la órbita en tramos para evitar líneas rectas por el antimeridiano
function segmentarOrbitaPorAntimeridiano(positions) {
  let segmentos = [];
  let segmentoActual = [];
  for (let i = 0; i < positions.length; i++) {
    if (i > 0) {
      const lon1 = positions[i-1][1];
      const lon2 = positions[i][1];
      if (Math.abs(lon2 - lon1) > 180) {
        // Corte por antimeridiano, termina el segmento actual y empieza uno nuevo
        segmentos.push(segmentoActual);
        segmentoActual = [];
      }
    }
    segmentoActual.push(positions[i]);
  }
  if (segmentoActual.length > 0) segmentos.push(segmentoActual);
  return segmentos;
}

// Ventana modal con mapa para la órbita y marcador de caída, optimizada
function mostrarOrbitaParaDebris(debris) {
  // Abre el modal
  const modal = new bootstrap.Modal(document.getElementById('orbitaModal'));
  document.getElementById('orbitaModalLabel').textContent = `Órbita de ${debris.nombre || ''}`;
  modal.show();

  // Limpia el mapa anterior si existe
  if (window.orbitaLeafletMap) {
    window.orbitaLeafletMap.remove();
    window.orbitaLeafletMap = null;
  }
  // Espera a que el modal se muestre completamente antes de crear el mapa
  setTimeout(() => {
    // Inicializa el mapa en el modal
    window.orbitaLeafletMap = L.map('orbita-map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.orbitaLeafletMap);

    let bounds = [];
    // Calcula los puntos de la órbita usando satellite.js
    if (debris.tle) {
      const tleLines = debris.tle.split('\n');
      if (tleLines.length >= 2) {
        const satrec = satellite.twoline2satrec(tleLines[0], tleLines[1]);
        const now = new Date();
        const positions = [];
        // Solo 100 puntos para eficiencia
        for (let i = 0; i <= 100; i++) {
          const time = new Date(now.getTime() - (100 - i) * 60 * 1000);
          const gmst = satellite.gstime(time);
          const posVel = satellite.propagate(satrec, time);
          if (posVel.position) {
            const geo = satellite.eciToGeodetic(posVel.position, gmst);
            const lat = satellite.degreesLat(geo.latitude);
            let lon = satellite.degreesLong(geo.longitude);
            // Normaliza -180/180 para mayor robustez
            if (lon > 180) lon -= 360;
            if (lon < -180) lon += 360;
            positions.push([lat, lon]);
          }
        }
        // Segmenta la órbita para evitar líneas rectas cruzando el mapa
        const segmentos = segmentarOrbitaPorAntimeridiano(positions);
        segmentos.forEach(seg => {
          if (seg.length > 1) {
            L.polyline(seg, {color: 'orange', weight: 2}).addTo(window.orbitaLeafletMap);
            bounds = bounds.concat(seg);
          }
        });
      }
    }

    // Agrega el marcador de la posición de caída
    if (debris.lugar_caida && typeof debris.lugar_caida.lat === 'number' && typeof debris.lugar_caida.lon === 'number') {
      L.marker([debris.lugar_caida.lat, debris.lugar_caida.lon])
        .addTo(window.orbitaLeafletMap)
        .bindPopup(`Posición de caída de<br><strong>${debris.nombre}</strong>`)
        .openPopup();
      bounds.push([debris.lugar_caida.lat, debris.lugar_caida.lon]);
    }

    // Ajusta los límites del mapa si hay algo para mostrar
    if (bounds.length > 0) {
      window.orbitaLeafletMap.fitBounds(bounds, {padding: [30, 30]});
    }
  }, 300);
}

document.addEventListener("DOMContentLoaded", () => {
  initMapa();
  cargarDatos();
  listeners();
});
