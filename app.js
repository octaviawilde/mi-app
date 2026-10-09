// 1. Find the pieces of the page we want to control
const estado = document.querySelector("#estado");
const pregunta = document.querySelector("#pregunta");
const respuesta = document.querySelector("#respuesta");
const tarjetaCaja = document.querySelector("#tarjeta");   // NEW: tap the card to flip it
const toca = document.querySelector("#toca");
const respuestas = document.querySelector("#respuestas");   // NEW: the 4 answer buttons
const cajaTexto = document.querySelector("#caja");          // NEW: "caja 2 ▮▮▯▯▯" on the card

// 2. Settings (change these numbers whenever you like)
const NUEVAS_POR_DIA = 15;           // how many new cards per day
const DIAS = [0, 0, 1, 3, 7, 14];    // days to wait before a card comes back, by box (caja 1–5)
const PISTAS = true;                 // NEW: true = show the small English hints · false = Spanish only
if (!PISTAS) document.body.classList.add("sin-pistas");

// 3. Variables: boxes that remember things while the app is open
let tarjetas = [];   // all your cards
let cola = [];       // today's queue (the cards waiting for you)
let actual = null;   // the card on the screen now
let colaEscribir = [];   // NEW: today's writing queue
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
  colaEscribir = escrituraDeHoy();   // NEW
}

// NEW: how many cards are still waiting for you today (reviews due + new ones left)
function pendientesHoy() {
  const hoy = fecha();
  const repasos = tarjetas.filter(t => progreso[t.id] && (progreso[t.id].proxima || hoy) <= hoy).length;
  const nuevasHoy = Object.values(progreso).filter(p => p.primera === hoy).length;
  const sinVer = tarjetas.filter(t => !progreso[t.id]).length;
  return repasos + Math.min(sinVer, Math.max(0, NUEVAS_POR_DIA - nuevasHoy)) + escrituraDeHoy().length;
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

  // NEW: recognition done → writing practice (if there's any today)
  ocultarEscribir();
  if (cola.length === 0 && colaEscribir.length > 0 && !modoLibre) {
    mostrarEscribir();
    return;
  }

  if (cola.length === 0) {
    escribir(pregunta, "✓ todo hecho por hoy", "all done for today");
    escribir(respuesta, "¿quieres más?_", "want more?");
    respuesta.classList.remove("oculta");
    toca.classList.add("oculta");
    respuestas.classList.add("oculta");
    cajaTexto.textContent = "";
    extra.classList.remove("oculta");   // NEW: show [ + 5 nuevas ] [ práctica libre ]
    return;   // stop here: nothing else to show
  }

  extra.classList.add("oculta");
  actual = cola[0];   // the first card in the queue
  escribir(pregunta, actual.es);   // no hint here: that would give away the answer!
  escribir(respuesta, actual.en + "\n" + actual.ejemplo);
  respuesta.classList.add("oculta");
  toca.classList.remove("oculta");
  respuestas.classList.add("oculta");
  mostrarCaja();
}

// NEW: show where this word is: "nueva" or "caja 2 ▮▮▯▯▯"
function mostrarCaja() {
  const p = progreso[actual.id];
  if (!p) {
    escribir(cajaTexto, "nueva", "new word");
    return;
  }
  const caja = p.caja || 1;
  escribir(cajaTexto, `caja ${caja} ${"▮".repeat(caja)}${"▯".repeat(5 - caja)}`, `box ${caja} of 5`);
}

// 9. Flip: show the answer and the 4 answer buttons
function girar() {
  if (cola.length === 0) return;                            // "all done" screen: nothing to flip
  if (!respuesta.classList.contains("oculta")) return;      // already flipped
  respuesta.classList.remove("oculta");
  toca.classList.add("oculta");
  respuestas.classList.remove("oculta");
}

// 10. NEW: your answer moves the card between boxes, then we save
//   nivel 0 "no la sé"  → back to box 1, comes back TODAY
//   nivel 1 "me suena"  → stays in its box, comes back TOMORROW
//   nivel 2 "la sé"     → next box (+1), waits longer
//   nivel 3 "¡fácil!"   → jumps 2 boxes (+2), waits much longer
function responder(nivel) {
  const hoy = fecha();
  const p = progreso[actual.id] || { bien: 0, mal: 0, caja: 1, primera: hoy };
  p.caja = p.caja || 1;
  p.suena = p.suena || 0;
  cola.shift();   // take this card off the front of the queue

  // count the answer (the progress screen and Profe use these numbers)
  if (nivel === 0) p.mal++;
  if (nivel === 1) p.suena++;
  if (nivel >= 2) p.bien++;

  if (nivel === 0) {
    cola.push(actual);   // "no la sé": it goes to the back of today's queue
  }

  if (!modoLibre) {      // free practice never moves cards between boxes
    if (nivel === 0) {
      p.caja = 1;
      p.proxima = hoy;
    } else if (nivel === 1) {
      p.proxima = fecha(1);
    } else {
      p.caja = Math.min(p.caja + (nivel === 3 ? 2 : 1), 5);
      p.proxima = fecha(DIAS[p.caja]);
    }
  }

  p.ultima = new Date().toISOString();
  progreso[actual.id] = p;
  localStorage.setItem("progreso", JSON.stringify(progreso));
  siguiente();
}

// ---------- NEW: Writing mode (English → type the Spanish) ----------
const ESCRIBIR_DESDE = 3;              // a word unlocks writing when its recognition box reaches 3
const NUEVAS_ESCRITURA_POR_DIA = 10;   // how many newly unlocked words per day

const tarjetaEscribir = document.querySelector("#tarjeta-escribir");
const cajaEscribir = document.querySelector("#caja-escribir");
const preguntaEscribir = document.querySelector("#pregunta-escribir");
const entrada = document.querySelector("#entrada");
const resultado = document.querySelector("#resultado");
const solucion = document.querySelector("#solucion");
const botonesEscribir = document.querySelector("#botones-escribir");
const accionEscribir = document.querySelector("#accion-escribir");
const contarBien = document.querySelector("#contar-bien");
let actualEscribir = null;
let nivelEscribir = null;   // the result of "comprobar", saved when you tap "siguiente"

// Good for writing? (not grammar notes like "ir a + infinitivo" or long lists)
function sePuedeEscribir(t) {
  return !/[:+…]/.test(t.es) && t.es.length <= 40;
}

// Today's writing cards: unlocked words that are due + a few newly unlocked ones
function escrituraDeHoy() {
  const hoy = fecha();
  const listas = tarjetas.filter(t => progreso[t.id] && (progreso[t.id].caja || 1) >= ESCRIBIR_DESDE && sePuedeEscribir(t));
  const repasos = listas.filter(t => progreso[t.id].escritura && progreso[t.id].escritura.proxima <= hoy);
  const nuevasHoy = listas.filter(t => progreso[t.id].escritura && progreso[t.id].escritura.primera === hoy).length;
  const nuevas = listas.filter(t => !progreso[t.id].escritura).slice(0, Math.max(0, NUEVAS_ESCRITURA_POR_DIA - nuevasHoy));
  return [...repasos, ...nuevas];
}

// Helpers for checking: "Árbol" → "arbol", "¿Dónde?" → "dónde", "el bosque" → "bosque"
function limpiar(s) { return s.toLowerCase().replace(/[¡!¿?.,;]/g, "").replace(/\s+/g, " ").trim(); }
function sinAcentos(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function sinArticulo(s) { return s.replace(/^(el|la|los|las|un|una) /, ""); }

// How many letters are different between two words (0 = identical)
function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return fila[b.length];
}

// Check what you wrote. Fair, not picky: 3 = perfect · 1 = almost · 0 = not yet
function corregir(escrito, t) {
  const e = limpiar(escrito);
  const opciones = [limpiar(t.es), ...t.es.split("/").map(limpiar)];   // "sucio / sucia" → either one
  if (e === "") return { nivel: 0, es: "todavía no", en: "not yet" };
  if (opciones.includes(e)) return { nivel: 3, es: "✓ ¡perfecto!", en: "perfect!" };
  if (opciones.some(o => sinAcentos(o) === sinAcentos(e))) {
    return { nivel: 1, es: "~ casi: mira los acentos", en: "almost: check the accents (á é í ó ú ñ)" };
  }
  if (opciones.some(o => sinArticulo(o) !== o && sinArticulo(o) === e)) {
    return { nivel: 1, es: "~ casi: falta el artículo", en: "almost: the article (el/la/los/las) is missing" };
  }
  if (opciones.some(o => o.length >= 5 && distancia(sinAcentos(o), sinAcentos(e)) === 1)) {
    return { nivel: 1, es: "~ casi: una letra", en: "almost: one letter is different" };
  }
  return { nivel: 0, es: "✗ todavía no", en: "not yet" };
}

function ocultarEscribir() {
  tarjetaEscribir.classList.add("oculta");
  botonesEscribir.classList.add("oculta");
  contarBien.classList.add("oculta");
  document.querySelector("#tarjeta").classList.remove("oculta");
}

function mostrarEscribir() {
  actualEscribir = colaEscribir[0];
  nivelEscribir = null;
  escribir(estado, `escribir: ${colaEscribir.length} · aprendidas: ${aprendidas()}/${tarjetas.length}`, "writing · learned");
  document.querySelector("#tarjeta").classList.add("oculta");
  respuestas.classList.add("oculta");
  extra.classList.add("oculta");
  tarjetaEscribir.classList.remove("oculta");
  botonesEscribir.classList.remove("oculta");

  const e = progreso[actualEscribir.id].escritura;
  if (e) {
    escribir(cajaEscribir, `escritura · caja ${e.caja} ${"▮".repeat(e.caja)}${"▯".repeat(5 - e.caja)}`, `writing · box ${e.caja} of 5`);
  } else {
    escribir(cajaEscribir, "escritura · nueva", "writing · new");
  }
  escribir(preguntaEscribir, actualEscribir.en);
  entrada.value = "";
  entrada.readOnly = false;
  resultado.classList.add("oculta");
  solucion.classList.add("oculta");
  escribir(accionEscribir, "comprobar", "check");
  entrada.focus();
}

// The big button: first "comprobar" (check), then "siguiente" (next)
function accion() {
  if (tarjetaEscribir.classList.contains("oculta")) return;   // not on the writing screen
  if (nivelEscribir === null) {
    const nota = corregir(entrada.value, actualEscribir);
    nivelEscribir = nota.nivel;
    entrada.readOnly = true;   // keep what you wrote visible, but locked
    escribir(resultado, nota.es, nota.en);
    resultado.className = "resultado " + (nota.nivel === 3 ? "bien" : nota.nivel === 1 ? "casi" : "mal");
    escribir(solucion, actualEscribir.es + "\n" + actualEscribir.ejemplo);
    solucion.classList.remove("oculta");
    contarBien.classList.toggle("oculta", nota.nivel === 3);
    escribir(accionEscribir, "siguiente →", "next");
  } else {
    guardarEscritura(nivelEscribir);
  }
}

// Save the writing answer in its own 5 boxes (same rules as the cards)
function guardarEscritura(nivel) {
  const hoy = fecha();
  const p = progreso[actualEscribir.id];
  const e = p.escritura || { caja: 1, bien: 0, mal: 0, primera: hoy };
  colaEscribir.shift();
  if (nivel === 0) {
    e.mal++;
    e.caja = 1;
    e.proxima = hoy;
    colaEscribir.push(actualEscribir);   // try again later today
  } else if (nivel === 1) {
    e.mal++;
    e.proxima = fecha(1);                // almost: same box, tomorrow
  } else {
    e.bien++;
    e.caja = Math.min(e.caja + 1, 5);
    e.proxima = fecha(DIAS[e.caja]);
  }
  p.escritura = e;
  nivelEscribir = null;
  localStorage.setItem("progreso", JSON.stringify(progreso));
  siguiente();
}

accionEscribir.addEventListener("click", accion);
entrada.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") accion();   // Enter on the keyboard = the big button
});
contarBien.addEventListener("click", () => {
  nivelEscribir = 3;   // you were right, the app was too strict
  guardarEscritura(3);
});

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
tarjetaCaja.addEventListener("click", girar);
// NEW: one listener for all 4 answers: each button knows its own level (data-nivel)
for (const boton of respuestas.querySelectorAll("button")) {
  boton.addEventListener("click", () => responder(Number(boton.dataset.nivel)));
}
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

  // NEW: writing progress, one quiet line
  const practicadas = tarjetas.filter(t => progreso[t.id] && progreso[t.id].escritura);
  const escritas = practicadas.filter(t => progreso[t.id].escritura.caja >= 3).length;
  const lineaEscritura = crear("p", "leyenda", `✍ escritura: ${practicadas.length} practicadas · ${escritas} aprendidas`, "writing: practised · learned");
  lineaEscritura.style.marginTop = "16px";
  informe.append(lineaEscritura);

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
const VERSION = "1.3";
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
