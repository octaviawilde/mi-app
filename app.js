// 1. Find the pieces of the page we want to control
const estado = document.querySelector("#estado");
const pregunta = document.querySelector("#pregunta");
const respuesta = document.querySelector("#respuesta");
const botonGirar = document.querySelector("#girar");
const botonBien = document.querySelector("#bien");
const botonMal = document.querySelector("#mal");

// 2. Settings (change these numbers whenever you like)
const NUEVAS_POR_DIA = 15;           // how many new cards per day
const DIAS = [0, 0, 1, 3, 7, 14];    // days to wait before a card comes back, by box (caja 1–5)

// 3. Variables: boxes that remember things while the app is open
let tarjetas = [];   // all your cards
let cola = [];       // today's queue (the cards waiting for you)
let actual = null;   // the card on the screen now
let progreso = JSON.parse(localStorage.getItem("progreso")) || {};

// 4. A date as "2026-10-09". fecha() = today, fecha(3) = in 3 days
function fecha(diasMas = 0) {
  const d = new Date();
  d.setDate(d.getDate() + diasMas);
  return d.toLocaleDateString("sv");   // "sv" (Swedish) writes dates as YYYY-MM-DD
}

// 5. Load your cards, prepare today's queue, show the first card
async function cargar() {
  const archivo = await fetch("cards.json");
  tarjetas = await archivo.json();
  prepararCola();
  siguiente();
  await cargarHoy();   // NEW: Profe's plan for today
  mostrar("hoy");      // NEW: open on the Today screen
}

// 6. Today's queue = cards due for review + a few new ones
function prepararCola() {
  const hoy = fecha();
  const repasos = tarjetas.filter(t => progreso[t.id] && (progreso[t.id].proxima || hoy) <= hoy);
  const nuevasHoy = Object.values(progreso).filter(p => p.primera === hoy).length;
  const cuantasNuevas = Math.max(0, NUEVAS_POR_DIA - nuevasHoy);
  const nuevas = tarjetas.filter(t => !progreso[t.id]).slice(0, cuantasNuevas);
  cola = [...repasos, ...nuevas];
}

// 7. A card is "learned" when it reaches box 3 (right on 2 different days)
function aprendidas() {
  return Object.values(progreso).filter(p => (p.caja || 1) >= 3).length;
}

// 8. Show the next card in the queue (or "done!")
function siguiente() {
  estado.textContent = `para hoy: ${cola.length} · aprendidas: ${aprendidas()}/${tarjetas.length}`;

  if (cola.length === 0) {
    pregunta.textContent = "✓ todo hecho por hoy";
    respuesta.textContent = "vuelve mañana_";
    respuesta.classList.remove("oculta");
    botonGirar.classList.add("oculta");
    botonBien.classList.add("oculta");
    botonMal.classList.add("oculta");
    return;   // stop here: nothing else to show
  }

  actual = cola[0];   // the first card in the queue
  pregunta.textContent = actual.es;
  respuesta.textContent = actual.en + "\n" + actual.ejemplo;
  respuesta.classList.add("oculta");
  botonGirar.classList.remove("oculta");
  botonBien.classList.add("oculta");
  botonMal.classList.add("oculta");
}

// 9. Flip: show the answer and the ✓ / ✗ buttons
function girar() {
  respuesta.classList.remove("oculta");
  botonGirar.classList.add("oculta");
  botonBien.classList.remove("oculta");
  botonMal.classList.remove("oculta");
}

// 10. Move the card between boxes, then save
//     ✓ → next box, comes back later  ·  ✗ → back to box 1, comes back today
function guardar(laSe) {
  const hoy = fecha();
  const p = progreso[actual.id] || { bien: 0, mal: 0, caja: 1, primera: hoy };
  p.caja = p.caja || 1;
  cola.shift();   // take this card off the front of the queue

  if (laSe) {
    p.bien++;
    p.caja = Math.min(p.caja + 1, 5);
    p.proxima = fecha(DIAS[p.caja]);
  } else {
    p.mal++;
    p.caja = 1;
    p.proxima = hoy;
    cola.push(actual);   // "otra vez": it goes to the back of today's queue
  }

  p.ultima = new Date().toISOString();
  progreso[actual.id] = p;
  localStorage.setItem("progreso", JSON.stringify(progreso));
  siguiente();
}

// 11. When a button is tapped, run a function
botonGirar.addEventListener("click", girar);
botonBien.addEventListener("click", () => guardar(true));
botonMal.addEventListener("click", () => guardar(false));

cargar();

// ---------- 12. Backup: export / import ----------
const botonExportar = document.querySelector("#exportar");
const archivoInput = document.querySelector("#archivo");

// Export: put all your progress in a file and download it
function exportar() {
  const copia = { app: "mi-app", version: 1, fecha: fecha(), progreso: progreso };
  const texto = JSON.stringify(copia, null, 2);
  const blob = new Blob([texto], { type: "application/json" });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `mi-app-backup-${fecha()}.json`;
  enlace.click();
  estado.textContent = "✓ backup exportado";
}

// Import: read a backup file and MERGE it with what's on this device.
// For each card, keep the most recent answer (the one with the latest "ultima").
async function importar() {
  const archivo = archivoInput.files[0];
  if (!archivo) return;
  try {
    const copia = JSON.parse(await archivo.text());
    if (!copia.progreso) throw new Error("not a backup");
    let cambios = 0;
    for (const id in copia.progreso) {
      const suyo = copia.progreso[id];   // the card in the file
      const mio = progreso[id];          // the same card on this device
      if (!mio || (suyo.ultima || "") > (mio.ultima || "")) {
        progreso[id] = suyo;
        cambios++;
      }
    }
    localStorage.setItem("progreso", JSON.stringify(progreso));
    prepararCola();
    siguiente();
    estado.textContent = `✓ importado: ${cambios} tarjetas actualizadas`;
  } catch (error) {
    estado.textContent = "✗ ese archivo no es un backup de mi-app";
  }
  archivoInput.value = "";   // so the same file can be imported again
}

botonExportar.addEventListener("click", exportar);
archivoInput.addEventListener("change", importar);

// ---------- 13. Screens: hoy · repasar · progreso ----------
const pantallas = {
  hoy: document.querySelector("#pantalla-hoy"),
  repaso: document.querySelector("#pantalla-repaso"),
  progreso: document.querySelector("#pantalla-progreso"),
};
const botonesMenu = {
  hoy: document.querySelector("#ver-hoy"),
  repaso: document.querySelector("#ver-repaso"),
  progreso: document.querySelector("#ver-progreso"),
};

// Show ONE screen and hide the others. toggle(label, yes/no) adds or removes a label.
function mostrar(nombre) {
  for (const n in pantallas) {
    pantallas[n].classList.toggle("oculta", n !== nombre);
    botonesMenu[n].classList.toggle("activo", n === nombre);
  }
  if (nombre === "progreso") dibujarProgreso();
  if (nombre === "hoy") dibujarHoy();
}

botonesMenu.hoy.addEventListener("click", () => mostrar("hoy"));
botonesMenu.repaso.addEventListener("click", () => mostrar("repaso"));
botonesMenu.progreso.addEventListener("click", () => mostrar("progreso"));

// ---------- 14. Progress screen ----------
const informe = document.querySelector("#informe");

// Each card is "aprendida" (box 3+), "vista" (seen) or "nueva" (never seen)
function estadoDe(t) {
  const p = progreso[t.id];
  if (!p) return "nueva";
  if ((p.caja || 1) >= 3) return "aprendida";
  return "vista";
}

// A text bar like ██▒▒▒░░░░░  (█ learned · ▒ seen · ░ new)
function barra(lista, ancho = 10) {
  const total = lista.length;
  const a = lista.filter(t => estadoDe(t) === "aprendida").length;
  const v = lista.filter(t => estadoDe(t) === "vista").length;
  const llenos = Math.round((a / total) * ancho);
  const medios = Math.round(((a + v) / total) * ancho) - llenos;
  return "█".repeat(llenos) + "▒".repeat(medios) + "░".repeat(ancho - llenos - medios);
}

function dibujarProgreso() {
  const aprendidasTotal = tarjetas.filter(t => estadoDe(t) === "aprendida").length;
  const vistasTotal = tarjetas.filter(t => estadoDe(t) !== "nueva").length;
  const lineas = [
    `aprendidas  ${aprendidasTotal}/${tarjetas.length}`,
    `vistas      ${vistasTotal}/${tarjetas.length}`,
    `para hoy    ${cola.length}`,
    "",
    "por tema",
    "█ aprendida  ▒ vista  ░ nueva",
  ];

  // Group the cards by theme: { animales: [...], verbos: [...], ... }
  const temas = {};
  for (const t of tarjetas) {
    if (!temas[t.tema]) temas[t.tema] = [];
    temas[t.tema].push(t);
  }
  for (const tema in temas) {
    const lista = temas[tema];
    const a = lista.filter(t => estadoDe(t) === "aprendida").length;
    lineas.push(`${tema.padEnd(10)} ${barra(lista)} ${a}/${lista.length}`);
  }

  // Weak spots: cards you got wrong that aren't learned yet, most ✗ first
  lineas.push("", "puntos débiles");
  const debiles = tarjetas
    .filter(t => progreso[t.id] && progreso[t.id].mal > 0 && estadoDe(t) !== "aprendida")
    .sort((x, y) => progreso[y.id].mal - progreso[x.id].mal)
    .slice(0, 7);
  if (debiles.length === 0) lineas.push("(ninguno todavía)");
  for (const t of debiles) {
    lineas.push(`✗${progreso[t.id].mal}  ${t.es} → ${t.en}`);
  }

  informe.textContent = lineas.join("\n");
}

// ---------- 15. Today screen (the plan comes from Profe: hoy.json) ----------
const saludo = document.querySelector("#saludo");
const listaTareas = document.querySelector("#tareas");
const notaPlan = document.querySelector("#nota-plan");
let plan = null;
let hechas = JSON.parse(localStorage.getItem("hechas")) || {};   // e.g. { "2026-10-09": ["mision"] }

async function cargarHoy() {
  try {
    const archivo = await fetch("hoy.json");
    plan = await archivo.json();
  } catch (error) {
    plan = null;   // no plan file yet
  }
}

function dibujarHoy() {
  listaTareas.innerHTML = "";   // empty the list, then fill it again
  if (!plan) {
    saludo.textContent = "sin plan de Profe todavía_";
    notaPlan.textContent = "";
    return;
  }
  const hoy = fecha();
  const marcadas = hechas[hoy] || [];
  saludo.textContent = plan.saludo;

  for (const tarea of plan.tareas) {
    let hecha = marcadas.includes(tarea.tipo);
    let texto = tarea.texto;
    if (tarea.tipo === "tarjetas") {   // the app knows this one by itself
      hecha = cola.length === 0;
      texto = `${tarea.texto} (${cola.length} para hoy)`;
    }
    const li = document.createElement("li");   // create a new list item
    li.textContent = `${hecha ? "[x]" : "[ ]"} ${texto}`;
    if (hecha) li.classList.add("hecha");
    li.addEventListener("click", () => marcar(tarea.tipo));
    listaTareas.appendChild(li);               // put it on the page
  }
  notaPlan.textContent = plan.fecha === hoy ? `plan de ${plan.de} · hoy` : `plan de ${plan.de} · del ${plan.fecha}`;
}

// Tap a task: the cards one opens the review; the others tick on / off
function marcar(tipo) {
  if (tipo === "tarjetas") {
    mostrar("repaso");
    return;
  }
  const hoy = fecha();
  const marcadas = hechas[hoy] || [];
  if (marcadas.includes(tipo)) {
    hechas[hoy] = marcadas.filter(t => t !== tipo);
  } else {
    hechas[hoy] = [...marcadas, tipo];
  }
  localStorage.setItem("hechas", JSON.stringify(hechas));
  dibujarHoy();
}