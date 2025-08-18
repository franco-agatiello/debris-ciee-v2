// --- IMPORTS THREE.JS MODERNOS ---
import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.155.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.155.0/examples/jsm/loaders/GLTFLoader.js';

// --- VARIABLES Y CONSTANTES ORIGINALES ---
let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let mapaTrayectoria = null;

const radioTierra = 6371; // km

const iconoAzul = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoVerde = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoRojo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoAmarillo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});

// --- FUNCIONES ORIGINALES ---
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
    contenido += `<button class="btn btn-sm btn-info mt-2" onclick="mostrarTrayectoria(${index})">Ver trayectoria</button>`;
    contenido += `<button class="btn btn-sm btn-warning mt-2 ms-1" onclick="mostrarOrbitaPlanta(${index})">Ver órbita</button>`;
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

// --- FUNCIONES DE VISUALIZACIÓN DE TRAYECTORIA IGUAL QUE ANTES ---
window.mostrarTrayectoria = function(index) {
  // ... igual que tu función original ...
  // (no se modifica aquí para respetar tu estructura)
};

// --- MODIFICACIÓN CLAVE: VISUALIZACIÓN 3D DE ÓRBITA CON THREE.JS MODERNO ---
window.mostrarOrbitaPlanta = function(index) {
  const d = filtrarDatos()[index];
  if (!d.tle1 || !d.tle2) return alert("No hay TLE para este debris.");

  // Modal Bootstrap
  const modal = new bootstrap.Modal(document.getElementById('modalOrbitaPlanta3D'));
  modal.show();

  // Limpia cualquier render 3D previo
  const container = document.getElementById('orbita3d');
  container.innerHTML = '';
  document.getElementById('orbita3d-label').innerText = d.nombre || 'Órbita';

  // Tamaño
  const width = container.offsetWidth || 700;
  const height = container.offsetHeight || 400;

  // THREE.js scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  // Luz
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  let dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(3, 3, 3);
  scene.add(dir);

  // Camera
  const camera = new THREE.PerspectiveCamera(45, width/height, 0.1, 100);
  camera.position.set(0, 0, 3.5);

  // Renderer
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setSize(width, height);
  renderer.setClearColor(0x111122, 1);
  container.appendChild(renderer.domElement);

  // Controls (ES Module)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enablePan = false;
  controls.maxDistance = 8;
  controls.minDistance = 1.5;

  // Modelo Tierra low poly NASA
  const EARTH_MODEL = "https://raw.githubusercontent.com/CMYK-Chaco/assets-public/main/earth-lowpoly.glb";
  const loader = new GLTFLoader();
  loader.load(EARTH_MODEL, function(gltf) {
    const earth = gltf.scene;
    earth.scale.set(1,1,1);
    scene.add(earth);
  });

  // Calcular y graficar órbita con satellite.js
  try {
    const satrec = satellite.twoline2satrec(d.tle1, d.tle2);
    let meanMotion = satrec.no;
    if (!meanMotion || meanMotion < 1e-5) meanMotion = 0.07;
    const periodoMin = (2 * Math.PI) / meanMotion;

    let points = [];
    for (let t = 0; t <= periodoMin; t += periodoMin/300) {
      const now = new Date();
      const time = new Date(now.getTime() + t * 60 * 1000);
      const pos = satellite.propagate(satrec, time);
      if (!pos.position) continue;
      const gmst = satellite.gstime(time);
      const ecf = satellite.eciToEcf(pos.position, gmst);
      points.push(new THREE.Vector3(ecf.x/6371, ecf.y/6371, ecf.z/6371));
    }

    if (points.length > 2) {
      const curve = new THREE.CatmullRomCurve3(points, true);
      const geometry = new THREE.TubeGeometry(curve, 300, 0.008, 8, true);
      const material = new THREE.MeshBasicMaterial({ color: 0xffa500 });
      const orbit = new THREE.Mesh(geometry, material);
      scene.add(orbit);

      // Perigeo y apogeo
      let minDist = Infinity, maxDist = 0, idxMin = 0, idxMax = 0;
      points.forEach((v, idx) => {
        const d = v.length();
        if (d < minDist) { minDist = d; idxMin = idx; }
        if (d > maxDist) { maxDist = d; idxMax = idx; }
      });
      // Perigeo
      const perigeoGeo = new THREE.SphereGeometry(0.025, 16, 16);
      const perigeoMat = new THREE.MeshBasicMaterial({color: 0x00ff00});
      const perigeo = new THREE.Mesh(perigeoGeo, perigeoMat);
      perigeo.position.copy(points[idxMin]);
      scene.add(perigeo);
      // Apogeo
      const apogeoGeo = new THREE.SphereGeometry(0.025, 16, 16);
      const apogeoMat = new THREE.MeshBasicMaterial({color: 0xff2222});
      const apogeo = new THREE.Mesh(apogeoGeo, apogeoMat);
      apogeo.position.copy(points[idxMax]);
      scene.add(apogeo);
    }
  } catch (e) {
    alert("No se pudo calcular la órbita: " + e.message);
  }

  // Redimensiona canvas 3D si el modal cambia tamaño
  function onResize() {
    const w = container.offsetWidth || 700;
    const h = container.offsetHeight || 400;
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // Animación
  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  // Limpia el canvas al cerrar el modal
  document.getElementById('modalOrbitaPlanta3D').addEventListener('hidden.bs.modal', function() {
    renderer.dispose();
    container.innerHTML = "";
    window.removeEventListener('resize', onResize);
  }, { once: true });
};

// --- INICIO Y EVENTOS ---
document.addEventListener("DOMContentLoaded", ()=>{
  initMapa();
  listeners();
  cargarDatos();
});
