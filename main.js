let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let mapaOrbita = null;

// Iconos personalizados por rango de año
const iconoAzul = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoVerde = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoRojo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoAmarillo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});

async function cargarDatos() {
  const resp = await fetch('data/debris.json');
  debris = await resp.json();
  poblarFiltros();
  actualizarMapa();
}

function poblarFiltros() {
  const paises = Array.from(new Set(debris.map(d => d.pais).filter(p => p && p !== null)));
  paises.sort((a,b) => a.localeCompare(b,'es'));
  const menu = document.getElementById("dropdownPaisMenu");
  menu.innerHTML = `<li><a class="dropdown-item" href="#" data-value="">Todos</a></li>` +
    paises.map(p => `<li><a class="dropdown-item" href="#" data-value="${p}">${p}</a></li>`).join('');
  menu.querySelectorAll('.dropdown-item').forEach(item=>{
    item.addEventListener('click', function(e){
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
  return debris.filter(d=>{
    if (filtros.pais && d.pais !== filtros.pais) return false;
    if (filtros.fechaDesde && d.fecha < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && d.fecha > filtros.fechaHasta) return false;
    if (filtros.inclinacionMin && Number(d.inclinacion_orbita) < Number(filtros.inclinacionMin)) return false;
    if (filtros.inclinacionMax && Number(d.inclinacion_orbita) > Number(filtros.inclinacionMax)) return false;
    return true;
  });
}

function marcadorPorFecha(fecha) {
  const year = parseInt(fecha.slice(0,4),10);
  if (year >= 2004 && year <= 2010) return iconoAzul;
  if (year >= 2011 && year <= 2017) return iconoVerde;
  if (year >= 2018 && year <= 2025) return iconoRojo;
  return iconoAmarillo;
}

function actualizarBotonesModo() {
  document.getElementById("modo-puntos").classList.toggle("active",modo==="puntos");
  document.getElementById("modo-calor").classList.toggle("active",modo==="calor");
}

function popupContenidoDebris(d,index){
  let contenido = `<strong>${d.nombre ?? ''}</strong><br>`;
  if(d.pais) contenido += `País: ${d.pais}<br>`;
  if(d.tamano_caida_kg !== null && d.tamano_caida_kg !== undefined) contenido += `Masa caída: ${d.tamano_caida_kg} kg<br>`;
  if(d.material_principal) contenido += `Material: ${d.material_principal}<br>`;
  if(d.inclinacion_orbita !== null && d.inclinacion_orbita !== undefined) contenido += `Inclinación órbita: ${d.inclinacion_orbita}°<br>`;
  if(d.fecha) contenido += `Fecha: ${d.fecha}<br>`;
  if(d.imagen) contenido += `<img src="${d.imagen}" alt="${d.nombre}"><br>`;
  if(d.tle1 && d.tle2) {
    contenido += `<button class="btn btn-sm btn-info mt-2" onclick="mostrarOrbita(${index})">Ver órbita</button>`;
    contenido += `<button class="btn btn-sm btn-warning mt-2 ms-1" onclick="mostrarOrbitaPlanta(${index})">Vista en planta</button>`;
  }
  return contenido;
}

function actualizarMapa(){
  const datosFiltrados = filtrarDatos();

  if(capaPuntos){capaPuntos.clearLayers(); try{mapa.removeLayer(capaPuntos);}catch(e){} capaPuntos=null;}
  if(capaCalor && mapa.hasLayer(capaCalor)){mapa.removeLayer(capaCalor); capaCalor=null;}
  if(leyendaPuntos) leyendaPuntos.remove();
  if(leyendaCalor) leyendaCalor.remove();

  if(modo==="puntos"){
    capaPuntos=L.layerGroup();
    datosFiltrados.forEach((d,i)=>{
      const marker=L.marker([d.lugar_caida.lat,d.lugar_caida.lon],{icon:marcadorPorFecha(d.fecha)})
        .bindPopup(popupContenidoDebris(d,i),{autoPan:true});
      marker.on('popupopen',function(e){
        const imgs=e.popup._contentNode.querySelectorAll('img');
        imgs.forEach(img=>img.addEventListener('load',()=>{e.popup.update();}));
      });
      capaPuntos.addLayer(marker);
    });
    capaPuntos.addTo(mapa);
    mostrarLeyendaPuntos();
  } else {
    const heatData = datosFiltrados.map(d=>[d.lugar_caida.lat,d.lugar_caida.lon]);
    if(heatData.length){
      capaCalor=L.heatLayer(heatData,{
        radius:30, blur:25, minOpacity:0.4, max:30,
        gradient:{0.1:'blue',0.3:'lime',0.6:'yellow',1.0:'red'}
      }).addTo(mapa);
    }
    mostrarLeyendaCalor();
  }
  actualizarBotonesModo();
}

function mostrarLeyendaPuntos(){
  leyendaPuntos=L.control({position:'bottomright'});
  leyendaPuntos.onAdd=function(map){
    const div=L.DomUtil.create('div','info legend');
    div.innerHTML+=`<strong>Color del marcador según año de caída</strong><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2004 a 2010</span><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2011 a 2017</span><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2018 a 2025</span><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">Antes de 2004</span><br>`;
    return div;
  };
  leyendaPuntos.addTo(mapa);
}

function mostrarLeyendaCalor(){
  leyendaCalor=L.control({position:'bottomright'});
  leyendaCalor.onAdd=function(map){
    const div=L.DomUtil.create('div','info legend');
    const grades=['Bajo','Medio','Alto','Muy alto'];
    const colors=['blue','lime','yellow','red'];
    div.innerHTML+='<strong>Densidad de caídas</strong><br>';
    for(let i=0;i<grades.length;i++){
      div.innerHTML+=`<i style="background:${colors[i]};width:14px;height:14px;display:inline-block;margin-right:5px;border-radius:2px;"></i> ${grades[i]}<br>`;
    }
    return div;
  };
  leyendaCalor.addTo(mapa);
}

function initMapa(){
  mapa=L.map('map').setView([0,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
}

function listeners(){
  ["fecha-desde","fecha-hasta","inclinacion-min","inclinacion-max"].forEach(id=>{
    document.getElementById(id).addEventListener("change",actualizarMapa);
  });
  document.getElementById("modo-puntos").addEventListener("click",()=>{modo="puntos"; actualizarMapa();});
  document.getElementById("modo-calor").addEventListener("click",()=>{modo="calor"; actualizarMapa();});
}

window.mostrarOrbita = function(index) {
  const d = filtrarDatos()[index];
  if (!d.tle1 || !d.tle2) return alert("No hay TLE para este debris.");

  setTimeout(() => {
    if (mapaOrbita) { mapaOrbita.remove(); mapaOrbita = null; }
    mapaOrbita = L.map('mapOrbita').setView([d.lugar_caida.lat, d.lugar_caida.lon], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaOrbita);

    const satrec = satellite.twoline2satrec(d.tle1, d.tle2);

    // Calcula el periodo orbital en minutos usando el mean motion
    const meanMotion = satrec.no * 1440 / (2 * Math.PI); // satrec.no en rad/min
    const periodoMin = 1440 / meanMotion;

    // Cuántas vueltas querés mostrar (3 o 4)
    const vueltas = 4;
    const minutosATrazar = periodoMin * vueltas;

    // Epoch date
    const jday = satrec.epochdays;
    const year = satrec.epochyr < 57 ? satrec.epochyr + 2000 : satrec.epochyr + 1900;
    const epochDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0) + (jday - 1) * 24 * 60 * 60 * 1000);

    // Opcional: ¿Querés que las vueltas sean "alrededor del punto de caída"? Si sí, buscá el tiempo más cercano a ese punto.
    // Por ahora, se traza desde el epoch del TLE.

    let segments = [], segment = [], prevLon = null;

    // Simula las vueltas, paso de 1 minuto
    for (let min = 0; min <= minutosATrazar; min += 1) {
      const time = new Date(epochDate.getTime() + min * 60000);
      const gmst = satellite.gstime(time);
      const pos = satellite.propagate(satrec, time);

      if (!pos || !pos.position) continue;

      const geo = satellite.eciToGeodetic(pos.position, gmst);
      let lat = satellite.degreesLat(geo.latitude);
      let lon = satellite.degreesLong(geo.longitude);

      if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90) continue;

      // Normaliza la longitud
      lon = ((lon + 180) % 360 + 360) % 360 - 180;

      if (prevLon !== null) {
        let delta = Math.abs(lon - prevLon);
        // Si el salto de longitud es grande (cruce de ±180°), corta el segmento
        if (delta > 30) { // Si ves cortes feos, podés bajar a 20
          if (segment.length > 1) segments.push(segment);
          segment = [];
        }
      }

      segment.push([lat, lon]);
      prevLon = lon;
    }
    if (segment.length > 1) segments.push(segment);

    // Dibuja la órbita (3-4 vueltas)
    segments.forEach(seg => {
      L.polyline(seg, { color: "#3f51b5", weight: 2 }).addTo(mapaOrbita);
    });

    // Punto de caída
    L.marker([d.lugar_caida.lat, d.lugar_caida.lon])
      .addTo(mapaOrbita)
      .bindPopup("Punto de caída")
      .openPopup();

    // Ajusta vista a la órbita
    if (segments.length && segments[0].length > 1) {
      let bounds = segments.flat();
      mapaOrbita.fitBounds(bounds, {padding: [20, 20]});
    } else {
      mapaOrbita.setView([d.lugar_caida.lat, d.lugar_caida.lon], 3);
    }
  }, 300);

  const modal = new bootstrap.Modal(document.getElementById('modalOrbita'));
  modal.show();
};

// --- NUEVA FUNCIÓN: VISTA EN PLANTA DE LA ÓRBITA ---
window.mostrarOrbitaPlanta = function(index) {
  const d = filtrarDatos()[index];
  if (!d.tle1 || !d.tle2) return alert("No hay TLE para este debris.");

  // Parámetros orbitales
  const a = d.a ?? null; // semi eje mayor [km]
  const apogeo = d.apogeo ?? null; // [km]
  const perigeo = d.perigeo ?? null; // [km]
  let excentricidad = null;

  // Si no viene excentricidad, la calculamos:
  if (a && apogeo !== null && perigeo !== null) {
    // apogeo = a*(1+e) - RT , perigeo = a*(1-e) - RT , RT = radio tierra
    // e = (apogeo - perigeo)/(apogeo + perigeo + 2*RT)
    excentricidad = (apogeo - perigeo) / (apogeo + perigeo + 2*6371);
  } else {
    excentricidad = null;
  }

  // Muestra los datos
  let infoHTML = `<strong>Parámetros orbitales:</strong><br>`;
  if (a) infoHTML += `Semi eje mayor (a): <b>${a.toFixed(2)}</b> km<br>`;
  if (apogeo) infoHTML += `Apogeo: <b>${apogeo.toFixed(2)}</b> km<br>`;
  if (perigeo) infoHTML += `Perigeo: <b>${perigeo.toFixed(2)}</b> km<br>`;
  if (excentricidad !== null) infoHTML += `Excentricidad: <b>${excentricidad.toFixed(4)}</b><br>`;
  document.getElementById('orbitaPlantaInfo').innerHTML = infoHTML;

  // Dibuja la órbita en planta (canvas)
  const canvas = document.getElementById('canvasPlanta');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dibujar la Tierra
  const xc = canvas.width/2, yc = canvas.height/2;
  const radioTierra = 6371; // km
  let escala = 1;
  if (a) escala = 120 / a; // escalamos para que se vea bien

  // Tierra
  ctx.beginPath();
  ctx.arc(xc, yc, radioTierra * escala, 0, 2*Math.PI, false);
  ctx.fillStyle = "#0099cc";
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#0099cc";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Órbita (elipse)
  if (a && excentricidad !== null) {
    const b = a * Math.sqrt(1 - excentricidad*excentricidad); // semi eje menor
    ctx.beginPath();
    ctx.ellipse(
      xc,
      yc,
      a * escala,
      b * escala,
      0,
      0,
      2*Math.PI
    );
    ctx.strokeStyle = "#ff9900";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Marca apogeo y perigeo
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    ctx.arc(xc + (a - (a*excentricidad)) * escala, yc, 5, 0, 2*Math.PI);
    ctx.fill(); // perigeo
    ctx.beginPath();
    ctx.arc(xc - (a - (a*excentricidad)) * escala, yc, 5, 0, 2*Math.PI);
    ctx.fill(); // apogeo
  }

  // Abre el modal
  const modal = new bootstrap.Modal(document.getElementById('modalOrbitaPlanta'));
  modal.show();
};


// Inicialización
document.addEventListener("DOMContentLoaded", ()=>{
  initMapa();
  listeners();
  cargarDatos();
});
