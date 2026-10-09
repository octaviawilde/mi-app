// 1. Find the pieces of the page we want to control
const estado = document.querySelector("#estado");
const pregunta = document.querySelector("#pregunta");
const respuesta = document.querySelector("#respuesta");
const tarjetaCaja = document.querySelector("#tarjeta");   // NEW: tap the card to flip it
const toca = document.querySelector("#toca");
const respuestas = document.querySelector("#respuestas");   // NEW: the 4 answer buttons
const cajaTexto = document.querySelector("#caja");          // NEW: "caja 2 ▮▮▯▯▯" on the card

// 2. Settings (change these numbers whenever you like)
const NUEVAS_POR_DIA = 15;           // how many new cards per day (if your ficha doesn't say)
const DIAS = [0, 0, 1, 3, 7, 14];    // days to wait before a card comes back, by box (caja 1–5)
// NEW: the hints (pistas) and the new cards per day now come from your ficha (section 18)

// 3. Variables: boxes that remember things while the app is open
let tarjetas = [];   // all your cards
let cola = [];       // today's queue (the cards waiting for you)
let actual = null;   // the card on the screen now
let colaEscribir = [];   // NEW: today's writing queue
let modoLibre = false;   // NEW: free practice = review anything, your boxes don't change
let progreso = JSON.parse(localStorage.getItem("progreso")) || {};
let perfil = leerGuardado("perfil");   // NEW: your ficha (profile), made in the interview with Profe

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
  entrevista = await leerArchivo("profe/entrevista.json");   // NEW: Profe's first-meeting questions
  aplicarPistas();
  ponerNombre();
  prepararCola();
  siguiente();
  if (!perfil && entrevista) {
    conocerProfe();   // NEW: first time here? Profe wants to meet you
  } else {
    mostrar("hoy");
  }
}

// 6. Today's queue = cards due for review + a few new ones
function prepararCola() {
  const hoy = fecha();
  const repasos = tarjetas.filter(t => progreso[t.id] && (progreso[t.id].proxima || hoy) <= hoy);
  const nuevasHoy = Object.values(progreso).filter(p => p.primera === hoy).length;
  const cuantasNuevas = Math.max(0, nuevasPorDia() - nuevasHoy);
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
  return repasos + Math.min(sinVer, Math.max(0, nuevasPorDia() - nuevasHoy)) + escrituraDeHoy().length;
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
  const copia = { app: "mi-app", version: 1, fecha: fecha(), progreso: progreso, perfil: perfil };
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
    if (copia.perfil && (!perfil || (copia.perfil.ultima || "") > (perfil.ultima || ""))) {
      perfil = copia.perfil;   // NEW: the ficha travels with the backup (the newest one wins)
      localStorage.setItem("perfil", JSON.stringify(perfil));
      aplicarPistas();
      partes.push("tu ficha");
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
  profe: document.querySelector("#pantalla-profe"),   // NEW: chatting with Profe
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
    if (botonesMenu[n]) botonesMenu[n].classList.toggle("activo", n === nombre);
  }
  // NEW: while you talk to Profe, hide the menu and the status line (calm, one thing at a time)
  document.querySelector(".menu").classList.toggle("oculta", nombre === "profe");
  estado.classList.toggle("oculta", nombre === "profe");
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

  dibujarFicha();   // NEW: what Profe knows about you
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
  const n = (perfil && perfil.nombre) || (plan && plan.nombre);   // your ficha first
  nombre.textContent = n ? `, ${n}` : "";
}

// NEW: no plan file from Profe? Then the app makes a simple one from your ficha
function planBasico() {
  const hora = new Date().getHours();
  const [es, en] = hora < 14 ? ["Buenos días", "good morning"] : hora < 20 ? ["Buenas tardes", "good afternoon"] : ["Buenas noches", "good evening"];
  return {
    fecha: fecha(), de: "Profe", nombre: perfil.nombre, basico: true,
    saludo: `¡${es}, ${perfil.nombre}!`, saludo_en: en,
    tareas: [{ tipo: "tarjetas", texto: "repasa tus tarjetas", en: "review your cards" }],
  };
}

function dibujarHoy() {
  listaTareas.innerHTML = "";   // empty the list, then fill it again
  if (!plan && perfil) plan = planBasico();
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
const VERSION = "1.5";
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

// ---------- 18. Profe: the first meeting (onboarding interview) ----------
// Profe's questions live in profe/entrevista.json: part of the Núcleo, the same for every learner.
// Your answers become your ficha (profile). It's saved ONLY on this device (localStorage "perfil").
// Every Profe is the same teacher... but every ficha is different.
const chat = document.querySelector("#chat");
const opciones = document.querySelector("#opciones");
const chatEscribir = document.querySelector("#chat-escribir");
const chatEntrada = document.querySelector("#chat-entrada");
const chatEnviar = document.querySelector("#chat-enviar");
let entrevista = null;   // the questions (from the file)
let borrador = {};       // your answers so far
let idiomaActual = null; // the language Profe is asking about right now ("¿Qué tal hablas inglés?")

// New cards per day: from your ficha (minutes per day), or the setting at the top
const NUEVAS_POR_MINUTOS = { 5: 5, 15: 10, 30: 15, 60: 20 };
function nuevasPorDia() {
  return (perfil && NUEVAS_POR_MINUTOS[perfil.minutos]) || NUEVAS_POR_DIA;
}

// Hints on or off, from your ficha ("ninguna" = no hints)
function aplicarPistas() {
  document.body.classList.toggle("sin-pistas", Boolean(perfil && perfil.pistas === "ninguna"));
}

// Wait a little (in milliseconds), so Profe "types" like a person
function pausa(ms) {
  return new Promise(listo => setTimeout(listo, ms));
}

// A language's name: nombreIdioma("it") → "italiano" (or "Italian" with "en")
function nombreIdioma(codigo, lengua = "es") {
  const idioma = entrevista.idiomas[codigo];
  return idioma ? idioma[lengua] : codigo;
}

// Fill in the gaps: "¡Mucho gusto, {nombre}!" → "¡Mucho gusto, Octavia!"
function rellenar(texto) {
  const huecos = {
    nombre: borrador.nombre,
    aprende: nombreIdioma(borrador.aprende || "es"),
    aprende_en: nombreIdioma(borrador.aprende || "es", "en"),
    idioma: idiomaActual && nombreIdioma(idiomaActual),
    idioma_en: idiomaActual && nombreIdioma(idiomaActual, "en"),
  };
  return texto.replace(/\{(\w+)\}/g, (hueco, clave) => huecos[clave] || "");
}

// Add one line to the chat. quien = "profe" or "tu" (you)
function decir(quien, es, en) {
  const linea = crear("p", "mensaje " + quien, es, en);
  chat.append(linea);
  linea.scrollIntoView({ block: "end", behavior: "smooth" });
}

// The answer buttons for a step. Some steps build them from the list of languages.
function opcionesDe(paso) {
  const todos = Object.keys(entrevista.idiomas);
  const comoOpcion = codigo => ({ valor: codigo, es: nombreIdioma(codigo), en: nombreIdioma(codigo, "en") });
  if (paso.opciones === "idiomas") {
    return todos.filter(c => c !== borrador.nativo).map(comoOpcion);
  }
  if (paso.opciones === "aprender") {   // only the languages Profe can already teach
    return todos.filter(c => entrevista.idiomas[c].aprender && c !== borrador.nativo).map(comoOpcion);
  }
  if (paso.opciones === "pistas") {     // languages you know AND the app has hints for (not the one you're learning)
    const conocidos = [borrador.nativo, ...(borrador.otros || [])].filter(c => c !== borrador.aprende);
    return [...conocidos.filter(c => entrevista.idiomas[c] && entrevista.idiomas[c].pistas).map(comoOpcion), ...paso.extra];
  }
  return paso.opciones;
}

// "pronto" (coming soon): languages that are ON THE PLAN (planeado) but not ready yet.
// No false promises: a language that isn't planned never shows here.
function prontoDe(paso) {
  const planeados = Object.keys(entrevista.idiomas).filter(c => entrevista.idiomas[c].planeado);
  if (paso.opciones === "aprender") {
    return planeados.filter(c => !entrevista.idiomas[c].aprender && c !== borrador.nativo);
  }
  if (paso.opciones === "pistas") {
    const conocidos = [borrador.nativo, ...(borrador.otros || [])];
    return planeados.filter(c => conocidos.includes(c) && c !== borrador.aprende && !entrevista.idiomas[c].pistas);
  }
  return [];
}

// ---- Checking typed answers (buttons can't be wrong, but typing can) ----
// Without AI, the app can't know what a word MEANS. It can check the SHAPE:
// only letters, not too long. For places, it also knows a list of cities;
// a place it doesn't know isn't blocked (your town may be small!), Profe just asks "are you sure?".
const SOLO_LETRAS = /^[\p{L}][\p{L} '’.-]*$/u;   // \p{L} = any letter, in any alphabet (ñ, é, ж, ع...)

function revisarTexto(paso, texto) {
  if (texto.length > 40) return { es: "es muy largo", en: "that's too long" };
  if (paso.validar && !SOLO_LETRAS.test(texto)) return { es: "solo letras, por favor", en: "letters only, please" };
  return null;   // null = looks fine
}

function esConocida(paso, texto) {
  const normal = t => sinAcentos(limpiar(t));
  return (paso.conocidas || []).some(c => normal(c) === normal(texto));
}

// "octavia wilde" → "Octavia Wilde"
function mayusculas(texto) {
  return texto.replace(/(^|[\s-])(\p{L})/gu, (todo, antes, letra) => antes + letra.toUpperCase());
}

// Show the answer area for one step and WAIT until you answer.
// A Promise = "I'll give you the answer later, when the user taps".
function esperarRespuesta(paso) {
  opciones.innerHTML = "";
  chatEscribir.classList.add("oculta");
  if (repetir.length > 0) return Promise.resolve(repetir.shift());   // going back: replay old answers instantly
  const antes = anterior;   // the answer you gave here before going back (or null)
  anterior = null;

  return new Promise(responder => {
    // "← atrás" (back): on every question except the first one
    if (historial.length > 0) {
      const atras = crear("button", "atras", "← atrás", "back");
      atras.onclick = () => {
        chatEscribir.classList.add("oculta");
        chatEnviar.onclick = chatEntrada.onkeydown = null;
        responder({ atras: true });
      };
      opciones.append(atras);
    }

    // 1. Type an answer (your name, your city)
    if (paso.tipo === "texto") {
      chatEscribir.classList.remove("oculta");
      chatEntrada.value = antes ? antes.valor : "";   // back here? your old answer is already typed
      chatEntrada.focus();
      const aviso = crear("p", "leyenda aviso");
      const terminar = texto => {
        chatEscribir.classList.add("oculta");
        chatEnviar.onclick = chatEntrada.onkeydown = null;
        responder({ valor: texto, es: texto });
      };
      const enviar = () => {
        const texto = paso.validar ? mayusculas(chatEntrada.value.trim()) : chatEntrada.value.trim();
        if (!texto) return;   // empty: wait for something
        const problema = revisarTexto(paso, texto);
        if (problema) {       // wrong shape: say why, and let them try again
          escribir(aviso, "✗ " + problema.es, problema.en);
          opciones.prepend(aviso);
          return;
        }
        if (paso.validar === "lugar" && !esConocida(paso, texto)) {
          confirmarLugar(texto, terminar);   // a place Profe doesn't know: ask, don't block
          return;
        }
        terminar(texto);
      };
      chatEnviar.onclick = enviar;
      chatEntrada.onkeydown = evento => { if (evento.key === "Enter") enviar(); };
      if (paso.opcional) {
        const saltar = crear("button", "", "saltar", "skip");
        saltar.onclick = () => {
          chatEscribir.classList.add("oculta");
          responder({ valor: "", es: "—" });
        };
        opciones.append(saltar);
      }
      return;
    }

    const lista = opcionesDe(paso);

    // 2. Pick ONE answer
    if (paso.tipo === "uno" || paso.tipo === "niveles" || paso.tipo === "fin") {
      for (const op of lista) {
        const boton = crear("button", "", op.es, op.en);
        if (antes && antes.valor === op.valor) boton.classList.add("elegida");   // your old choice, in green
        boton.onclick = () => responder(op);
        opciones.append(boton);
      }
    }

    // 3. Pick SEVERAL answers: tap to tick [x] / untick [ ], then "listo"
    if (paso.tipo === "varios") {
      const elegidas = [];
      for (const op of lista) {
        const boton = crear("button", "", `[ ] ${op.es}`, op.en);
        if (antes && antes.valor.includes(op.valor)) {   // back here? your old ticks are still there
          elegidas.push(op);
          escribir(boton, `[x] ${op.es}`, op.en);
          boton.classList.add("elegida");
        }
        boton.onclick = () => {
          const i = elegidas.indexOf(op);
          if (i === -1) elegidas.push(op); else elegidas.splice(i, 1);
          escribir(boton, `${i === -1 ? "[x]" : "[ ]"} ${op.es}`, op.en);
          boton.classList.toggle("elegida", i === -1);
        };
        opciones.append(boton);
      }
      const listo = crear("button", "listo", "listo →", "done");
      listo.onclick = () => responder({
        valor: elegidas.map(op => op.valor),
        es: elegidas.length ? elegidas.map(op => op.es).join(", ") : "ninguno",
      });
      opciones.append(listo);
    }

    // languages that are coming soon: one quiet line, not more buttons
    const pronto = prontoDe(paso);
    if (pronto.length) {
      opciones.append(crear("p", "leyenda pronto", "pronto: " + pronto.map(c => nombreIdioma(c)).join(" · "), "coming soon"));
    }
    opciones.scrollIntoView({ block: "end", behavior: "smooth" });   // keep the answers on screen
  });
}

// "No conozco «Dog»": two buttons, keep it or fix it
function confirmarLugar(texto, terminar) {
  const antes = [...opciones.children].filter(el => !el.classList.contains("aviso"));   // ← atrás, saltar: keep them for later
  chatEscribir.classList.add("oculta");
  opciones.innerHTML = "";
  opciones.append(crear("p", "leyenda pronto", `no conozco «${texto}». ¿es una ciudad o un pueblo?`, `I don't know "${texto}". Is it a city or a town?`));
  const si = crear("button", "", "sí, es mi ciudad", "yes, it's where I live");
  si.onclick = () => terminar(texto);
  const no = crear("button", "", "corregir", "fix it");
  no.onclick = () => {
    opciones.replaceChildren(...antes);   // back to the text box, with its buttons
    chatEscribir.classList.remove("oculta");
    chatEntrada.focus();
  };
  opciones.append(si, no);
}

// One step: Profe talks, you answer, the answer is shown as "tú>"
async function preguntar(paso, mensajes = paso.profe) {
  for (const m of mensajes) {
    if (repetir.length === 0) await pausa(600);   // no "typing" pause while replaying
    decir("profe", rellenar(m.es), rellenar(m.en));
  }
  const respuesta = await esperarRespuesta(paso);
  opciones.innerHTML = "";
  if (respuesta.atras) throw ATRAS;   // jump out of the interview... and start it again, one answer shorter
  historial.push(respuesta);
  decir("tu", respuesta.es);
  return respuesta.valor;
}

// Going back, the simple way: forget your last answer, then run the interview again
// from the start, replaying your other answers instantly (repetir). You land on the
// previous question. It also works when an earlier answer changes the next questions
// (e.g. which languages Profe asks "¿Qué tal hablas...?" about).
const ATRAS = "atrás";
let historial = [];   // your answers, in order
let repetir = [];     // answers waiting to be replayed
let anterior = null;  // the answer you're going back to (shown ticked / typed again)

async function conocerProfe(guardadas = []) {
  try {
    await entrevistar(guardadas);
  } catch (señal) {
    if (señal !== ATRAS) throw señal;   // a real error: don't hide it
    anterior = historial[historial.length - 1] || null;   // the answer we're going back to
    return conocerProfe(historial.slice(0, -1));
  }
}

// The whole interview, step by step
async function entrevistar(guardadas) {
  borrador = { idiomas: {} };
  historial = [];
  repetir = [...guardadas];
  chat.innerHTML = "";
  mostrar("profe");

  for (const paso of entrevista.pasos) {
    if (paso.tipo === "niveles") {   // one question per language you speak
      for (const codigo of borrador.otros || []) {
        if (codigo === "otro") continue;
        idiomaActual = codigo;
        borrador.idiomas[codigo] = await preguntar(paso);
      }
      idiomaActual = null;
      continue;
    }

    if (paso.tipo === "fin") {
      for (const m of paso.profe) {
        await pausa(600);
        decir("profe", rellenar(m.es), rellenar(m.en));
      }
      for (const [es, en] of lineasFicha(borrador)) decir("ficha", es, en);
      if (await preguntar(paso, paso.despues) === "otra") return entrevistar([]);   // start again, from zero
      continue;
    }

    const valor = await preguntar(paso);
    borrador[paso.guarda] = valor;
    if (paso.id === "nativo") borrador.idiomas[valor] = "nativo";
  }

  // Done: save the ficha on this device and open the app
  perfil = { ...borrador, creado: perfil ? perfil.creado : fecha(), ultima: new Date().toISOString() };
  localStorage.setItem("perfil", JSON.stringify(perfil));
  aplicarPistas();
  ponerNombre();
  if (plan && plan.basico) plan = null;   // the simple plan will be made again, with your new name
  prepararCola();
  siguiente();
  mostrar("hoy");
}

// The ficha as short lines (Spanish + English hint): used at the end of the interview and in [ progreso ]
function etiqueta(pasoId, valor) {
  const paso = entrevista.pasos.find(p => p.id === pasoId);
  const op = Array.isArray(paso.opciones) && paso.opciones.find(o => o.valor === valor);
  return op ? op.es : String(valor);
}

function lineasFicha(p) {
  const idiomas = Object.entries(p.idiomas || {}).map(([c, nivel]) => `${nombreIdioma(c)} (${nivel})`);
  const lineas = [
    [`nombre: ${p.nombre}`, "name"],
    [`hablas: ${idiomas.join(" · ") || "—"}`, "languages you speak"],
    [`aprendes: ${nombreIdioma(p.aprende)} · nivel ${p.nivel}`, "you're learning · level"],
    [`pistas: ${p.pistas === "ninguna" ? "sin pistas" : nombreIdioma(p.pistas)}`, "hints"],
    [`para: ${(p.motivos || []).map(v => etiqueta("motivos", v)).join(" · ") || "—"}`, "why"],
    [`vives en: ${p.ciudad || "—"} · ${p.escuela ? "con escuela" : "sin escuela"}`, "you live in · with / without a school"],
    [`te gusta: ${(p.intereses || []).map(v => etiqueta("intereses", v)).join(" · ") || "—"}`, "you like"],
    [`tiempo: ${etiqueta("minutos", p.minutos)} al día · ${NUEVAS_POR_MINUTOS[p.minutos]} palabras nuevas`, "time per day · new words"],
  ];
  return lineas;
}

// [ progreso ] → "tu ficha": what Profe knows about you, + meet Profe again
function dibujarFicha() {
  const caja = document.querySelector("#ficha");
  caja.innerHTML = "";
  if (!entrevista) return;   // offline and the questions never loaded: nothing to show
  if (perfil) {
    for (const [es, en] of lineasFicha(perfil)) caja.append(crear("p", "mensaje ficha", es, en));
  } else {
    caja.append(crear("p", "vacio", "todavía no conoces a Profe", "you haven't met Profe yet"));
  }
  const otraVez = crear("button", "enlace", perfil ? "↺ repetir la entrevista" : "→ conocer a Profe", perfil ? "redo the interview" : "meet Profe");
  otraVez.onclick = () => conocerProfe();
  caja.append(otraVez);
}

// ---------- 19. Start the app ----------
// At the very end, so everything above already exists when it runs.
cargar();
