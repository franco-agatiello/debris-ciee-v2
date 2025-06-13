let mapa, marker, orbitLine, satData;

fetch("data/debris.json")
  .then(res => res.json())
  .then(satellites => {
    satData = satellites[0];
    document.getElementById("sat-nombre").textContent = satData.nombre || "Desconocido";
    document.getElementById("sat-tle").textContent = satData.tle.join("\n");
    initMapa(satData);
  });

function initMapa(sat) {
  // Ajusta la longitud final si es >180° (Leaflet usa -180 a 180)
  let lon_final = sat.lon_final > 180 ? sat.lon_final - 360 : sat.lon_final;
  mapa = L.map("map").setView([sat.lat_final, lon_final], 3);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);

  marker = L.marker([sat.lat_final, lon_final])
    .addTo(mapa)
    .bindPopup(() => {
      let html = `
        <strong>${sat.nombre}</strong><br>
        NORAD: ${sat.NORAD_CAT_ID || "-"}<br>
        Caída: ${sat.DECAY_EPOCH || "-"}<br>
        Lat/Lon: ${sat.lat_final.toFixed(2)}, ${lon_final.toFixed(2)}<br>
        <button id="btn-orbita" class="btn btn-sm btn-outline-warning mt-2">Ver última órbita</button>
      `;
      return html;
    });

  marker.on("popupopen", function(e) {
    document.getElementById("btn-orbita").onclick = () => {
      calcularYGraficarOrbita(sat, lon_final);
    };
  });
  marker.on("popupclose", function() {
    if (orbitLine) {
      mapa.removeLayer(orbitLine);
      orbitLine = null;
    }
  });
}

function calcularYGraficarOrbita(sat, lon_final) {
  if (orbitLine) {
    mapa.removeLayer(orbitLine);
    orbitLine = null;
  }

  // 1. Parsear TLE
  const tle = sat.tle;
  const satrec = satellite.twoline2satrec(tle[0], tle[1]);

  // 2. Definir época de reentrada (último punto)
  const targetDate = new Date(sat.DECAY_EPOCH.replace(" ", "T") + "Z");
  const periodMins = 1440 / satrec.no; // minutos por órbita
  const pasos = 80; // Más pasos = más suave
  const points = [];

  // 3. Calcular desde una órbita antes de la caída hasta la caída
  for (let i = -periodMins; i <= 0; i += periodMins / pasos) {
    const d = new Date(targetDate.getTime() + i * 60000);
    const gmst = satellite.gstime(d);
    const eci = satellite.propagate(satrec, d);
    if (!eci.position) continue;
    const geodetic = satellite.eciToGeodetic(eci.position, gmst);
    let lat = satellite.degreesLat(geodetic.latitude);
    let lon = satellite.degreesLong(geodetic.longitude);
    // Asegura que la lon final sea exactamente la del punto de caída
    if (i === 0) {
      lat = sat.lat_final;
      lon = lon_final;
    }
    points.push([lat, lon]);
  }

  orbitLine = L.polyline(points, {color: "orange", weight: 3, opacity: 0.85}).addTo(mapa);
  mapa.fitBounds(orbitLine.getBounds(), {maxZoom: 5});
}
