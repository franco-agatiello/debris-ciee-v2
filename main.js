let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let orbitaMap = null;
let orbitaLayer = null;

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

      // Ajustar el popup cuando la imagen termine de cargar
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

// Manejo del botón "Ver última órbita"
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('ver-orbita')) {
    const nombre = decodeURIComponent(e.target.getAttribute('data-nombre'));
    const sat = debris.find(x => x.nombre === nombre);
    if (sat && sat.tle && sat.tle.length === 2) {
      mostrarOrbitaEnModal(sat.tle, sat.nombre);
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

function initMapa() {
  mapa = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
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

function mostrarOrbitaEnModal(tle, nombre) {
  // Busca el debris para obtener la posición de caída
  const debrisObj = debris.find(d => d.nombre === nombre);
  const lugarCaida = debrisObj ? debrisObj.lugar_caida : null;

  // Inicializa el modal
  const modal = new bootstrap.Modal(document.getElementById('orbitaModal'));
  document.getElementById('orbitaModalLabel').textContent = `Órbita de ${nombre}`;
  setTimeout(() => {
    if (!orbitaMap) {
      orbitaMap = L.map('orbita-map').setView([0,0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(orbitaMap);
    }
    // Elimina capas anteriores
    if (orbitaLayer) {
      orbitaMap.removeLayer(orbitaLayer);
      orbitaLayer = null;
    }
    // Elimina marcador anterior
    if (orbitaMap._markerCaida) {
      orbitaMap.removeLayer(orbitaMap._markerCaida);
      orbitaMap._markerCaida = null;
    }
    // Dibuja órbita
    calcularYMostrarOrbita(tle, orbitaMap);

    // Dibuja marcador de caída si corresponde
    if (lugarCaida) {
      orbitaMap._markerCaida = L.marker([lugarCaida.lat, lugarCaida.lon], {
        icon: L.icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34]
        })
      }).addTo(orbitaMap).bindPopup('Posición de caída').openPopup();
    }
    orbitaMap.invalidateSize();
    // Ajusta vista para que se vea la órbita y el lugar de caída
    setTimeout(() => {
      if (orbitaLayer && lugarCaida) {
        let bounds = orbitaLayer.getBounds();
        bounds.extend([lugarCaida.lat, lugarCaida.lon]);
        orbitaMap.fitBounds(bounds, {padding: [30,30]});
      } else if (orbitaLayer) {
        orbitaMap.fitBounds(orbitaLayer.getBounds(), {padding: [30,30]});
      }
    }, 200);
  }, 400);
  modal.show();
}

function calcularYMostrarOrbita(tle, leafletMap) {
  const satrec = satellite.twoline2satrec(tle[0], tle[1]);
  const now = new Date();
  const points = [];
  for (let i = 0; i <= 90; i += 1) {
    const time = new Date(now.getTime() + i * 60 * 1000);
    const posVel = satellite.propagate(satrec, time);
    const positionEci = posVel.position;
    if (!positionEci) continue;
    const gmst = satellite.gstime(time);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    const lat = satellite.degreesLat(positionGd.latitude);
    const lon = satellite.degreesLong(positionGd.longitude);
    if (isFinite(lat) && isFinite(lon)) points.push([lat, lon]);
  }
  if (orbitaLayer) {
    leafletMap.removeLayer(orbitaLayer);
    orbitaLayer = null;
  }
  if (points.length > 1) {
    orbitaLayer = L.polyline(points, {color: 'orange', weight: 3}).addTo(leafletMap);
    if (typeof orbitaLayer.getBounds === "function") {
      leafletMap.fitBounds(orbitaLayer.getBounds(), {padding: [30,30]});
    }
  } else if (points.length === 1) {
    orbitaLayer = L.marker(points[0], {color: 'orange'}).addTo(leafletMap);
    leafletMap.setView(points[0], 4);
  } else {
    orbitaLayer = null;
    alert("No se pudo calcular la órbita para este TLE.");
  }
}
    // Corrige salto de antimeridiano (si la distancia de longitud > 180, empieza nuevo segmento)
    if (lastLon !== null && Math.abs(lon - lastLon) > 180) {
      segments.push([]);
    }
    segments[segments.length-1].push([lat, lon]);
    lastLon = lon;
  }
  // Dibuja todos los segmentos como polylines
  segments = segments.filter(seg => seg.length > 1);
  if (segments.length > 0) {
    orbitaLayer = L.layerGroup();
    segments.forEach(seg => {
      L.polyline(seg, {color: 'orange', weight: 3}).addTo(orbitaLayer);
    });
    orbitaLayer.addTo(leafletMap);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  initMapa();
  cargarDatos();
  listeners();
});
