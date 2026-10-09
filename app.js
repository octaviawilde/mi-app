// 1. Find the pieces of the page we want to control
const estado = document.querySelector("#estado");
const pregunta = document.querySelector("#pregunta");
const respuesta = document.querySelector("#respuesta");
const botonGirar = document.querySelector("#girar");
const botonBien = document.querySelector("#bien");
const botonMal = document.querySelector("#mal");

// 2. Variables: boxes that remember things while the app is open
let tarjetas = [];   // all your cards
let actual = null;   // the card on the screen now

// 3. NEW: the app's memory on this device (localStorage)
//    If something was saved before, load it. If not, start with an empty notebook {}.
let progreso = JSON.parse(localStorage.getItem("progreso")) || {};

// 4. Load your cards from the file cards.json
async function cargar() {
  const archivo = await fetch("cards.json");
  tarjetas = await archivo.json();
  siguiente();
}

// 5. NEW: add up all your ✓ and ✗ from the memory
function totales() {
  let bien = 0;
  let mal = 0;
  for (const id in progreso) {
    bien = bien + progreso[id].bien;
    mal = mal + progreso[id].mal;
  }
  return { bien, mal };
}

// 6. Show a random card (Spanish side only)
function siguiente() {
  const numero = Math.floor(Math.random() * tarjetas.length);
  actual = tarjetas[numero];
  pregunta.textContent = actual.es;
  respuesta.textContent = actual.en + "\n" + actual.ejemplo;
  respuesta.classList.add("oculta");
  botonGirar.classList.remove("oculta");
  botonBien.classList.add("oculta");
  botonMal.classList.add("oculta");
  const t = totales();
  estado.textContent = `${tarjetas.length} tarjetas · ✓ ${t.bien} · ✗ ${t.mal}`;
}

// 7. Flip: show the answer and the ✓ / ✗ buttons
function girar() {
  respuesta.classList.remove("oculta");
  botonGirar.classList.add("oculta");
  botonBien.classList.remove("oculta");
  botonMal.classList.remove("oculta");
}

// 8. NEW: write your answer for this card in the memory, then save it
function guardar(laSe) {
  const p = progreso[actual.id] || { bien: 0, mal: 0 };
  if (laSe) {
    p.bien++;
  } else {
    p.mal++;
  }
  p.ultima = new Date().toISOString();   // when you last saw it
  progreso[actual.id] = p;
  localStorage.setItem("progreso", JSON.stringify(progreso));
  siguiente();
}

// 9. When a button is tapped, run a function
botonGirar.addEventListener("click", girar);
botonBien.addEventListener("click", () => guardar(true));
botonMal.addEventListener("click", () => guardar(false));

cargar();