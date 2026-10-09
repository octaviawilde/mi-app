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
const PISTAS = true;                 // NEW: true = show the small English hints · false = Spanish only
if (!PISTAS) document.body.classList.add("sin-pistas");

// 3. Variables: boxes that remember things while the app is open
let tarjetas = [];   // all your cards
let cola = [];       // today's queue (the cards waiting for you)
let actual = null;   // the card on the screen now
let modoLibre = false;   // NEW: free practice = review anything, your boxes don't change
let progreso = JSON.parse(localStorage.getItem("progreso")) || {};

// 4. A date as "2026-10-09". fecha() = today, fecha(3) = in 3 days
function fecha(diasMas = 0) {
  const d = new Date();
  d.setDate(d.getDate() + diasMas);
  return d.toLocaleDateString("sv");   // "sv" (Swedish) writes dates as YYYY-MM-DD
}

// NEW: write Spanish on the screen + a small English hint under it.
// The hint lives in data-pista, and the CSS shows it (style.css → "Pistas").
function escribir(elemento, es, en) {
  elemento.textContent = es;
  if (en) {
    elemento.dataset.pista = en;
  } else {
    delete elemento.dataset.pista;   // no hint for this text
  }
}

// NEW: read a JSON file from the app folder. If it isn't there, return null (no crash).
async function leerArchivo(nombre) {
  try {
    const archivo = await fetch(nombre);
    if (!archivo.ok) return null;   // e.g. 404 = file not found
    return await archivo.json();
  } catch (error) {
    return null;
  }
}

// NEW: read something saved on this device (or null)
function leerGuardado(clave) {
  return JSON.parse(localStorage.getItem(clave));
}

// 5. Load your cards and Profe's plan, then open the Today screen.
//    Where from? 1) files next to the app (on your Mac: cards.json, hoy.json)
//                2) a paquete you imported on this device (from iCloud Drive)
//                3) the example deck, for anyone trying the app for the first time
async function cargar() {
  tarjetas = (await leerArchivo("cards.json")) || leerGuardado("tarjetas") || (await leerArchivo("ejemplo.json")) || [];
  plan = (await leerArchivo("hoy.json")) || leerGuardado("plan");
  ponerNombre();
  prepararCola();
  siguiente();
  mostrar("hoy");
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

// NEW: how many cards are still waiting for you today (reviews due + new ones left)
function pendientesHoy() {
  const hoy = fecha();
  const repasos = tarjetas.filter(t => progreso[t.id] && (progreso[t.id].proxima || hoy) <= hoy).length;
  const nuevasHoy = Object.values(progreso).filter(p => p.primera === hoy).length;
  const sinVer = tarjetas.filter(t => !progreso[t.id]).length;
  return repasos + Math.min(sinVer, Math.max(0, NUEVAS_POR_DIA - nuevasHoy));
}

// 7. A card is "learned" when it reaches box 3 (right on 2 different days)
function aprendidas() {
  return Object.values(progreso).filter(p => (p.caja || 1) >= 3).length;
}

// 8. Show the next card in the queue (or "done!")
function siguiente() {
  if (cola.length === 0) modoLibre = false;   // the end of free practice = back to normal

  if (modoLibre) {
    escribir(estado, `práctica libre: ${cola.length} · tus cajas no cambian`, "free practice · your boxes don't change");
  } else {
    escribir(estado, `para hoy: ${cola.length} · aprendidas: ${aprendidas()}/${tarjetas.length}`, "for today · learned");
  }

  if (cola.length === 0) {
    escribir(pregunta, "✓ todo hecho por hoy", "all done for today");
    escribir(respuesta, "¿quieres más?_", "want more?");
    respuesta.classList.remove("oculta");
    botonGirar.classList.add("oculta");
    botonBien.classList.add("oculta");
    botonMal.classList.add("oculta");
    extra.classList.remove("oculta");   // NEW: show [ + 5 nuevas ] [ práctica libre ]
    return;   // stop here: nothing else to show
  }

  extra.classList.add("oculta");
  actual = cola[0];   // the first card in the queue
  escribir(pregunta, actual.es);   // no hint here: that would give away the answer!
  escribir(respuesta, actual.en + "\n" + actual.ejemplo);
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

  if (modoLibre) {
    // NEW: free practice only counts ✓ / ✗, it doesn't move the card between boxes
    if (laSe) {
      p.bien++;
    } else {
      p.mal++;
      cola.push(actual);
    }
  } else if (laSe) {
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

// NEW: when today's cards are done, two ways to keep going
const extra = document.querySelector("#extra");

// + 5 new cards (they join your boxes like normal new cards)
function masNuevas() {
  const nuevas = tarjetas.filter(t => !progreso[t.id]).slice(0, 5);
  if (nuevas.length === 0) {
    escribir(estado, "¡ya has visto todas tus tarjetas!", "you've already seen all your cards!");
    return;
  }
  modoLibre = false;
  cola = nuevas;
  siguiente();
}

// Free practice: 20 cards you've already seen, the hardest first
function practicaLibre() {
  const vistas = tarjetas.filter(t => progreso[t.id]);
  if (vistas.length === 0) {
    escribir(estado, "todavía no has visto ninguna tarjeta", "you haven't seen any cards yet");
    return;
  }
  const dificultad = t => progreso[t.id].mal - progreso[t.id].bien;   // more ✗ = harder
  vistas.sort(() => Math.random() - 0.5);                     // shuffle first...
  vistas.sort((x, y) => dificultad(y) - dificultad(x));       // ...then hardest first
  modoLibre = true;
  cola = vistas.slice(0, 20);
  siguiente();
}

// 11. When a button is tapped, run a function
botonGirar.addEventListener("click", girar);
botonBien.addEventListener("click", () => guardar(true));
botonMal.addEventListener("click", () => guardar(false));
document.querySelector("#mas-nuevas").addEventListener("click", masNuevas);
document.querySelector("#libre").addEventListener("click", practicaLibre);

// ---------- 12. Backup: export / import ----------
const botonExportar = document.querySelector("#exportar");
const archivoInput = document.querySelector("#archivo");

// Export: put all your progress in a file.
// On the phone: open the share menu (Save to Files, AirDrop...). Otherwise: download it.
async function exportar() {
  const copia = { app: "mi-app", version: 1, fecha: fecha(), progreso: progreso };
  const texto = JSON.stringify(copia, null, 2);
  const nombreArchivo = `mi-app-backup-${fecha()}.json`;
  const archivo = new File([texto], nombreArchivo, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
      escribir(estado, "✓ backup exportado", "backup saved");
    } catch (error) {
      escribir(estado, "backup cancelado", "backup cancelled");
    }
    return;
  }

  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = nombreArchivo;
  enlace.click();
  escribir(estado, "✓ backup exportado", "backup saved");
}

// Import: read a file and use what's inside.
//  - a paquete (from Victoria, in iCloud Drive/mi-app): your cards + today's plan
//  - a backup (from [ exportar ]): your progress, MERGED with this device
//    (for each card, the most recent answer wins: the latest "ultima")
async function importar() {
  const archivo = archivoInput.files[0];
  if (!archivo) return;
  try {
    const copia = JSON.parse(await archivo.text());
    const partes = [];   // what we found, for the message

    if (copia.tarjetas) {
      tarjetas = copia.tarjetas;
      localStorage.setItem("tarjetas", JSON.stringify(tarjetas));
      partes.push(`${tarjetas.length} tarjetas`);
    }
    if (copia.plan) {
      plan = copia.plan;
      localStorage.setItem("plan", JSON.stringify(plan));
      partes.push("plan de hoy");
    }
    if (copia.progreso) {
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
      partes.push(`progreso de ${cambios} tarjetas`);
    }
    if (partes.length === 0) throw new Error("not a mi-app file");

    ponerNombre();
    prepararCola();
    siguiente();
    mostrar("hoy");
    escribir(estado, `✓ importado: ${partes.join(" · ")}`, "imported");
  } catch (error) {
    escribir(estado, "✗ ese archivo no es de mi-app", "that file is not a mi-app file");
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

// NEW: English names of the themes (for the hints)
const TEMAS_EN = {
  saludos: "greetings", animales: "animals", adjetivos: "adjectives", verbos: "verbs",
  "en clase": "in class", "básicas": "basics", planes: "plans", fiesta: "party",
  "sobre mí": "about me", tiempo: "time", comida: "food", nuevas: "new words",
};

// Each card is "aprendida" (box 3+), "vista" (seen) or "nueva" (never seen)
function estadoDe(t) {
  const p = progreso[t.id];
  if (!p) return "nueva";
  if ((p.caja || 1) >= 3) return "aprendida";
  return "vista";
}

// NEW: create a piece of the page: crear("p", "titulo", "por tema", "by topic")
function crear(etiqueta, clase, es, en) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (es !== undefined) escribir(el, es, en);
  return el;
}

// A bar like ██▒▒▒░░░░░ made of 3 coloured pieces (█ learned · ▒ seen · ░ new)
function barra(lista, ancho = 10) {
  const total = lista.length;
  const a = lista.filter(t => estadoDe(t) === "aprendida").length;
  const v = lista.filter(t => estadoDe(t) === "vista").length;
  const llenos = Math.round((a / total) * ancho);
  const medios = Math.round(((a + v) / total) * ancho) - llenos;
  const b = crear("span", "barra");
  b.append(
    crear("span", "b-a", "█".repeat(llenos)),
    crear("span", "b-v", "▒".repeat(medios)),
    crear("span", "b-n", "░".repeat(ancho - llenos - medios)),
  );
  return b;
}

function dibujarProgreso() {
  informe.innerHTML = "";   // empty the screen, then build it again
  const aprendidasTotal = tarjetas.filter(t => estadoDe(t) === "aprendida").length;
  const vistasTotal = tarjetas.filter(t => estadoDe(t) !== "nueva").length;

  // 1. Three big numbers at the top
  const resumen = crear("div", "resumen");
  const datos = [
    [aprendidasTotal, "aprendidas", "learned"],
    [vistasTotal, "vistas", "seen"],
    [pendientesHoy(), "para hoy", "for today"],
  ];
  for (const [numero, es, en] of datos) {
    const dato = crear("div", "dato");
    dato.append(crear("div", "numero", String(numero)), crear("div", "etiqueta", es, en));
    resumen.append(dato);
  }
  informe.append(resumen);

  // 2. By topic: one row each (name | bar | count)
  informe.append(crear("h2", "titulo", "por tema", "by topic"));
  informe.append(crear("p", "leyenda", "█ aprendida · ▒ vista · ░ nueva", "learned · seen · new"));
  const temas = {};   // group the cards: { animales: [...], verbos: [...], ... }
  for (const t of tarjetas) {
    if (!temas[t.tema]) temas[t.tema] = [];
    temas[t.tema].push(t);
  }
  for (const tema in temas) {
    const lista = temas[tema];
    const a = lista.filter(t => estadoDe(t) === "aprendida").length;
    const fila = crear("div", "fila");
    fila.append(
      crear("span", "tema", tema, TEMAS_EN[tema]),
      barra(lista),
      crear("span", "cuenta", `${a}/${lista.length}`),
    );
    informe.append(fila);
  }

  // 3. Weak spots: cards you got wrong that aren't learned yet, most ✗ first
  informe.append(crear("h2", "titulo", "puntos débiles", "weak spots"));
  const debiles = tarjetas
    .filter(t => progreso[t.id] && progreso[t.id].mal > 0 && estadoDe(t) !== "aprendida")
    .sort((x, y) => progreso[y.id].mal - progreso[x.id].mal)
    .slice(0, 7);
  if (debiles.length === 0) {
    informe.append(crear("p", "vacio", "ninguno todavía", "none yet"));
  }
  const ul = crear("ul", "debiles");
  for (const t of debiles) {
    const li = crear("li");
    li.append(crear("span", "fallos", `✗${progreso[t.id].mal}`), crear("span", "palabra", t.es, t.en));
    ul.append(li);
  }
  informe.append(ul);
}

// ---------- 15. Today screen (the plan comes from Profe: hoy.json) ----------
const saludo = document.querySelector("#saludo");
const listaTareas = document.querySelector("#tareas");
const notaPlan = document.querySelector("#nota-plan");
const nombre = document.querySelector("#nombre");
let plan = null;
let hechas = JSON.parse(localStorage.getItem("hechas")) || {};   // e.g. { "2026-10-09": ["mision"] }

// NEW: "> hola, Octavia_" with the name from the plan (or just "> hola_")
function ponerNombre() {
  nombre.textContent = plan && plan.nombre ? `, ${plan.nombre}` : "";
}

function dibujarHoy() {
  listaTareas.innerHTML = "";   // empty the list, then fill it again
  if (!plan) {
    escribir(saludo, "sin plan de Profe todavía_", "no plan from Profe yet");
    notaPlan.textContent = "";
    return;
  }
  const hoy = fecha();
  const marcadas = hechas[hoy] || [];
  escribir(saludo, plan.saludo, plan.saludo_en);

  for (const tarea of plan.tareas) {
    let hecha = marcadas.includes(tarea.tipo);
    let texto = tarea.texto;
    if (tarea.tipo === "tarjetas") {   // the app knows this one by itself
      hecha = pendientesHoy() === 0;
      texto = `${tarea.texto} (${pendientesHoy()} para hoy)`;
    }
    const li = document.createElement("li");   // create a new list item
    escribir(li, `${hecha ? "[x]" : "[ ]"} ${texto}`, tarea.en);
    if (hecha) li.classList.add("hecha");
    li.addEventListener("click", () => marcar(tarea.tipo));
    listaTareas.appendChild(li);               // put it on the page
  }
  if (plan.fecha === hoy) {
    escribir(notaPlan, `plan de ${plan.de} · hoy`, `plan from ${plan.de} · today`);
  } else {
    escribir(notaPlan, `plan de ${plan.de} · del ${plan.fecha}`, `plan from ${plan.de} · from ${plan.fecha}`);
  }
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

// ---------- 16. Works offline: register the service worker (sw.js) ----------
if ("serviceWorker" in navigator) {
  // updateViaCache "none" = always check the real sw.js, never an old saved copy
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
}

// ---------- 17. Version + updates ----------
// Change VERSION every time you publish, so you can see on the phone which version you have.
const VERSION = "1.0";
document.querySelector("#version").textContent = `mi-app v${VERSION}`;

// [ ↻ actualizar ]: get the newest files and restart the app
async function actualizar() {
  escribir(estado, "actualizando...", "updating...");
  if ("serviceWorker" in navigator) {
    const registro = await navigator.serviceWorker.getRegistration();
    if (registro) await registro.update().catch(() => {});   // is there a new sw.js?
  }
  location.reload();
}
document.querySelector("#actualizar").addEventListener("click", actualizar);

// iPhone home-screen apps don't really close: they sleep in the background.
// If the app wakes up after 30+ minutes, restart it so it's fresh
// (new version, new day, new plan). Your progress is saved, nothing is lost.
let dormidaDesde = null;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    dormidaDesde = Date.now();
  } else if (dormidaDesde && Date.now() - dormidaDesde > 30 * 60 * 1000) {
    location.reload();
  }
});

// ---------- 18. Start the app ----------
// At the very end, so everything above already exists when it runs.
cargar();
