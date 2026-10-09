// mi-app: a calm, terminal-style app to learn a language with your own Profe.
// Plain HTML + CSS + JavaScript, no build tools. Read it top to bottom:
//   1 settings · 2 page elements + state · 3 helpers · 4 saved data (+ migration from v1.5)
//   5 loading · 6 today's queue · 7 review cards · 8 writing · 9 more practice · 10 backup
//   11 screens · 12 progress · 13 today · 14 Profe's interview · 15 offline + updates · 16 start
// The code is in English so anyone can read it and contribute.
// The text the learner SEES is Spanish (with small English hints): that's content, not code.

// ---------- 1. Settings (change these numbers whenever you like) ----------
const VERSION = "1.6";                      // change it every time you publish
const NEW_PER_DAY = 15;                     // new cards per day (when the profile doesn't say)
const BOX_DAYS = [0, 0, 1, 3, 7, 14];       // days before a card comes back, by box (1–5)
const NEW_PER_MINUTES = { 5: 5, 15: 10, 30: 15, 60: 20 };   // minutes per day (profile) → new cards per day
const WRITING_FROM_BOX = 3;                 // a word unlocks writing when its card reaches box 3
const NEW_WRITING_PER_DAY = 10;             // newly unlocked writing words per day

// ---------- 2. Page elements + state ----------
const $ = selector => document.querySelector(selector);   // a short name for "find this on the page"

const statusLine = $("#status");
const card = $("#card");                  // tap the card to flip it
const boxLabel = $("#box");               // "caja 2 ▮▮▯▯▯"
const question = $("#question");
const answer = $("#answer");
const tapHint = $("#tap-hint");
const answers = $("#answers");            // the 4 answer buttons
const more = $("#more");                  // [ + 5 nuevas ] [ práctica libre ]

let cards = [];             // all your cards
let queue = [];             // today's queue (the cards waiting for you)
let current = null;         // the card on the screen now
let writingQueue = [];      // today's writing queue
let freePractice = false;   // free practice = review anything, your boxes don't change
let progress = {};          // what you know: progress[cardId] = { box, right, wrong, due, ... }
let profile = null;         // your profile, made in the interview with Profe
let plan = null;            // today's plan (from Profe)
let done = {};              // ticked tasks: { "2026-10-09": ["mission"] }
let interview = null;       // Profe's interview questions (profe/interview.json)

// ---------- 3. Helpers ----------
// A date as "2026-10-09". day() = today, day(3) = in 3 days
function day(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toLocaleDateString("sv");   // "sv" (Swedish) writes dates as YYYY-MM-DD
}

// Write Spanish on the screen + a small English hint under it.
// The hint lives in data-hint, and the CSS shows it (style.css → "Hints").
function setText(element, es, en) {
  element.textContent = es;
  if (en) {
    element.dataset.hint = en;
  } else {
    delete element.dataset.hint;   // no hint for this text
  }
}

// Create a piece of the page: make("p", "heading", "por tema", "by topic")
function make(tag, className, es, en) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (es !== undefined) setText(element, es, en);
  return element;
}

// Read a JSON file from the app folder. If it isn't there, return null (no crash).
async function loadJson(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;   // e.g. 404 = file not found
    return await response.json();
  } catch (error) {
    return null;
  }
}

// Read / write something saved on this device
function loadSaved(key) {
  return JSON.parse(localStorage.getItem(key));
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Wait a little (in milliseconds), so Profe "types" like a person
function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- 4. Saved data + migration ----------
// Until v1.5 the code was in Spanish, and so were the names of the saved data
// ("progreso", "caja", "tarjetas"...). These functions translate old data into the
// new English names, so nothing is lost: not your saved progress, not old backups, not old files.
// They're safe to run on new data too (nothing to rename = nothing changes).
const OLD_STORAGE_KEYS = { progreso: "progress", hechas: "done", tarjetas: "cards", perfil: "profile" };
const PROGRESS_NAMES = { bien: "right", mal: "wrong", suena: "familiar", caja: "box", proxima: "due", ultima: "last", primera: "first", escritura: "writing" };
const CARD_NAMES = { ejemplo: "example", tema: "topic" };
const PLAN_NAMES = { fecha: "date", de: "from", nombre: "name", saludo: "greeting", saludo_en: "greeting_en", tareas: "tasks", basico: "basic" };
const TASK_NAMES = { tipo: "type", texto: "text" };
const TASK_TYPES = { tarjetas: "cards", leccion: "lesson", mision: "mission", escuela: "school" };
const PROFILE_NAMES = {
  nombre: "name", nativo: "native", otros: "others", idiomas: "languages", aprende: "learning", nivel: "level",
  pistas: "hints", motivos: "reasons", ciudad: "city", escuela: "school", intereses: "interests",
  minutos: "minutes", creado: "created", ultima: "updated",
};
const PROFILE_VALUES = {
  nativo: "native", "básico": "basic", medio: "intermediate", alto: "advanced", ninguna: "none",
  vivir: "live", gente: "people", trabajo: "work", estudios: "studies", viajar: "travel", examen: "exam", gusto: "fun",
  comida: "food", deporte: "sport", "música": "music", animales: "animals", naturaleza: "nature", arte: "art",
  "tecnología": "tech", viajes: "travel", compras: "shopping", cine: "film", libros: "books", juegos: "games",
};

// { caja: 2 } → { box: 2 }
function renameKeys(object, names) {
  const result = {};
  for (const key in object) result[names[key] || key] = object[key];
  return result;
}

function migrateProgress(old) {
  const result = {};
  for (const id in old) {
    const record = renameKeys(old[id], PROGRESS_NAMES);
    if (record.writing) record.writing = renameKeys(record.writing, PROGRESS_NAMES);
    result[id] = record;
  }
  return result;
}

function migrateCards(old) {
  return old.map(c => renameKeys(c, CARD_NAMES));
}

function migratePlan(old) {
  if (!old) return old;
  const result = renameKeys(old, PLAN_NAMES);
  result.tasks = (result.tasks || []).map(t => {
    const task = renameKeys(t, TASK_NAMES);
    task.type = TASK_TYPES[task.type] || task.type;
    return task;
  });
  return result;
}

function migrateDone(old) {
  const result = {};
  for (const date in old) result[date] = old[date].map(type => TASK_TYPES[type] || type);
  return result;
}

function migrateProfile(old) {
  if (!old) return old;
  const value = v => PROFILE_VALUES[v] || v;
  const code = c => (c === "otro" ? "other" : c);   // the only language code that was Spanish
  const result = renameKeys(old, PROFILE_NAMES);
  const languages = {};
  for (const c in result.languages || {}) languages[code(c)] = value(result.languages[c]);
  result.native = code(result.native);
  result.others = (result.others || []).map(code);
  result.languages = languages;
  result.hints = value(result.hints);
  result.reasons = (result.reasons || []).map(value);
  result.interests = (result.interests || []).map(value);
  return result;
}

// Once, at start: copy old Spanish keys to the new English ones.
// The old keys stay as a safety copy (a later version can delete them).
function migrateStorage() {
  for (const oldKey in OLD_STORAGE_KEYS) {
    const newKey = OLD_STORAGE_KEYS[oldKey];
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, oldValue);
    }
  }
}

// ---------- 5. Loading ----------
// Where do your cards and plan come from?
//   1) files next to the app (on your Mac: cards.json, today.json, made by Victoria's bridge)
//   2) a bundle you imported on this device (from iCloud Drive)
//   3) the sample deck, for anyone trying the app for the first time
async function start() {
  migrateStorage();
  progress = migrateProgress(loadSaved("progress") || {});
  done = migrateDone(loadSaved("done") || {});
  profile = migrateProfile(loadSaved("profile"));
  cards = migrateCards((await loadJson("cards.json")) || loadSaved("cards") || (await loadJson("sample.json")) || []);
  plan = migratePlan((await loadJson("today.json")) || loadSaved("plan"));
  interview = await loadJson("profe/interview.json");

  applyHints();
  showName();
  buildQueue();
  nextCard();
  if (!profile && interview) {
    meetProfe();   // first time here? Profe wants to meet you
  } else {
    show("today");
  }
}

// ---------- 6. Today's queue ----------
// New cards per day: from your profile (minutes per day), or the setting at the top
function newPerDay() {
  return (profile && NEW_PER_MINUTES[profile.minutes]) || NEW_PER_DAY;
}

function isDue(c) {
  return progress[c.id] && (progress[c.id].due || day()) <= day();
}

// Today's queue = cards due for review + a few new ones
function buildQueue() {
  const today = day();
  const reviews = cards.filter(isDue);
  const newToday = Object.values(progress).filter(p => p.first === today).length;
  const newCards = cards.filter(c => !progress[c.id]).slice(0, Math.max(0, newPerDay() - newToday));
  queue = [...reviews, ...newCards];
  writingQueue = writingForToday();
}

// How many cards are still waiting for you today (reviews due + new ones left + writing)
function leftToday() {
  const today = day();
  const reviews = cards.filter(isDue).length;
  const newToday = Object.values(progress).filter(p => p.first === today).length;
  const unseen = cards.filter(c => !progress[c.id]).length;
  return reviews + Math.min(unseen, Math.max(0, newPerDay() - newToday)) + writingForToday().length;
}

// A card is "learned" when it reaches box 3 (right on 2 different days)
function learnedCount() {
  return Object.values(progress).filter(p => (p.box || 1) >= 3).length;
}

// ---------- 7. Review cards ----------
// Show the next card in the queue (or "done!")
function nextCard() {
  if (queue.length === 0) freePractice = false;   // the end of free practice = back to normal

  if (freePractice) {
    setText(statusLine, `práctica libre: ${queue.length} · tus cajas no cambian`, "free practice · your boxes don't change");
  } else {
    setText(statusLine, `para hoy: ${queue.length} · aprendidas: ${learnedCount()}/${cards.length}`, "for today · learned");
  }

  // recognition done → writing practice (if there's any today)
  hideWriting();
  if (queue.length === 0 && writingQueue.length > 0 && !freePractice) {
    showWriting();
    return;
  }

  if (queue.length === 0) {
    setText(question, "✓ todo hecho por hoy", "all done for today");
    setText(answer, "¿quieres más?_", "want more?");
    answer.classList.remove("hidden");
    tapHint.classList.add("hidden");
    answers.classList.add("hidden");
    boxLabel.textContent = "";
    more.classList.remove("hidden");   // show [ + 5 nuevas ] [ práctica libre ]
    return;   // stop here: nothing else to show
  }

  more.classList.add("hidden");
  current = queue[0];   // the first card in the queue
  setText(question, current.es);   // no hint here: that would give away the answer!
  setText(answer, current.en + "\n" + current.example);
  answer.classList.add("hidden");
  tapHint.classList.remove("hidden");
  answers.classList.add("hidden");
  showBox();
}

// "caja 2 ▮▮▯▯▯" (5 boxes): the same picture for cards and writing
function boxBar(box) {
  return "▮".repeat(box) + "▯".repeat(5 - box);
}

// Show where this word is: "nueva" or "caja 2 ▮▮▯▯▯"
function showBox() {
  const p = progress[current.id];
  if (!p) {
    setText(boxLabel, "nueva", "new word");
    return;
  }
  const box = p.box || 1;
  setText(boxLabel, `caja ${box} ${boxBar(box)}`, `box ${box} of 5`);
}

// Flip: show the answer and the 4 answer buttons
function flip() {
  if (queue.length === 0) return;                        // "all done" screen: nothing to flip
  if (!answer.classList.contains("hidden")) return;      // already flipped
  answer.classList.remove("hidden");
  tapHint.classList.add("hidden");
  answers.classList.remove("hidden");
}

// Your answer moves the card between boxes, then we save.
//   level 0 "no la sé"  → back to box 1, comes back TODAY
//   level 1 "me suena"  → stays in its box, comes back TOMORROW
//   level 2 "la sé"     → next box (+1), waits longer
//   level 3 "¡fácil!"   → jumps 2 boxes (+2), waits much longer
function rate(level) {
  const today = day();
  const p = progress[current.id] || { right: 0, wrong: 0, box: 1, first: today };
  p.box = p.box || 1;
  p.familiar = p.familiar || 0;
  queue.shift();   // take this card off the front of the queue

  // count the answer (the progress screen and Profe use these numbers)
  if (level === 0) p.wrong++;
  if (level === 1) p.familiar++;
  if (level >= 2) p.right++;

  if (level === 0) queue.push(current);   // "no la sé": it goes to the back of today's queue

  if (!freePractice) {   // free practice never moves cards between boxes
    if (level === 0) {
      p.box = 1;
      p.due = today;
    } else if (level === 1) {
      p.due = day(1);
    } else {
      p.box = Math.min(p.box + (level === 3 ? 2 : 1), 5);
      p.due = day(BOX_DAYS[p.box]);
    }
  }

  p.last = new Date().toISOString();
  progress[current.id] = p;
  save("progress", progress);
  nextCard();
}

card.addEventListener("click", flip);
// one listener for all 4 answers: each button knows its own level (data-level)
for (const button of answers.querySelectorAll("button")) {
  button.addEventListener("click", () => rate(Number(button.dataset.level)));
}

// ---------- 8. Writing (English → type the Spanish) ----------
const writingCard = $("#writing-card");
const writingBox = $("#writing-box");
const writingQuestion = $("#writing-question");
const writingInput = $("#writing-input");
const result = $("#result");
const solution = $("#solution");
const writingButtons = $("#writing-buttons");
const writingAction = $("#writing-action");
const countCorrect = $("#count-correct");
let currentWriting = null;
let writingGrade = null;   // the result of "comprobar", saved when you tap "siguiente"

// Good for writing? (not grammar notes like "ir a + infinitivo" or long lists)
function isWritable(c) {
  return !/[:+…]/.test(c.es) && c.es.length <= 40;
}

// Today's writing: unlocked words that are due + a few newly unlocked ones
function writingForToday() {
  const today = day();
  const ready = cards.filter(c => progress[c.id] && (progress[c.id].box || 1) >= WRITING_FROM_BOX && isWritable(c));
  const reviews = ready.filter(c => progress[c.id].writing && progress[c.id].writing.due <= today);
  const newToday = ready.filter(c => progress[c.id].writing && progress[c.id].writing.first === today).length;
  const newOnes = ready.filter(c => !progress[c.id].writing).slice(0, Math.max(0, NEW_WRITING_PER_DAY - newToday));
  return [...reviews, ...newOnes];
}

// Helpers for checking: "¿Dónde?" → "dónde", "Árbol" → "arbol", "el bosque" → "bosque"
function normalize(s) { return s.toLowerCase().replace(/[¡!¿?.,;]/g, "").replace(/\s+/g, " ").trim(); }
function stripAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function stripArticle(s) { return s.replace(/^(el|la|los|las|un|una) /, ""); }

// How many letters are different between two words (0 = identical).
// A famous algorithm called "Levenshtein distance": spell-checkers use it too.
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

// Check what you wrote. Fair, not picky: 3 = perfect · 1 = almost · 0 = not yet
function gradeWriting(written, c) {
  const w = normalize(written);
  const options = [normalize(c.es), ...c.es.split("/").map(normalize)];   // "sucio / sucia" → either one
  if (w === "") return { level: 0, es: "todavía no", en: "not yet" };
  if (options.includes(w)) return { level: 3, es: "✓ ¡perfecto!", en: "perfect!" };
  if (options.some(o => stripAccents(o) === stripAccents(w))) {
    return { level: 1, es: "~ casi: mira los acentos", en: "almost: check the accents (á é í ó ú ñ)" };
  }
  if (options.some(o => stripArticle(o) !== o && stripArticle(o) === w)) {
    return { level: 1, es: "~ casi: falta el artículo", en: "almost: the article (el/la/los/las) is missing" };
  }
  if (options.some(o => o.length >= 5 && editDistance(stripAccents(o), stripAccents(w)) === 1)) {
    return { level: 1, es: "~ casi: una letra", en: "almost: one letter is different" };
  }
  return { level: 0, es: "✗ todavía no", en: "not yet" };
}

function hideWriting() {
  writingCard.classList.add("hidden");
  writingButtons.classList.add("hidden");
  countCorrect.classList.add("hidden");
  card.classList.remove("hidden");
}

function showWriting() {
  currentWriting = writingQueue[0];
  writingGrade = null;
  setText(statusLine, `escribir: ${writingQueue.length} · aprendidas: ${learnedCount()}/${cards.length}`, "writing · learned");
  card.classList.add("hidden");
  answers.classList.add("hidden");
  more.classList.add("hidden");
  writingCard.classList.remove("hidden");
  writingButtons.classList.remove("hidden");

  const w = progress[currentWriting.id].writing;
  if (w) {
    setText(writingBox, `escritura · caja ${w.box} ${boxBar(w.box)}`, `writing · box ${w.box} of 5`);
  } else {
    setText(writingBox, "escritura · nueva", "writing · new");
  }
  setText(writingQuestion, currentWriting.en);
  writingInput.value = "";
  writingInput.readOnly = false;
  result.classList.add("hidden");
  solution.classList.add("hidden");
  setText(writingAction, "comprobar", "check");
  writingInput.focus();
}

// The big button: first "comprobar" (check), then "siguiente" (next)
function writingStep() {
  if (writingCard.classList.contains("hidden")) return;   // not on the writing screen
  if (writingGrade === null) {
    const grade = gradeWriting(writingInput.value, currentWriting);
    writingGrade = grade.level;
    writingInput.readOnly = true;   // keep what you wrote visible, but locked
    setText(result, grade.es, grade.en);
    result.className = "result " + (grade.level === 3 ? "good" : grade.level === 1 ? "almost" : "bad");
    setText(solution, currentWriting.es + "\n" + currentWriting.example);
    solution.classList.remove("hidden");
    countCorrect.classList.toggle("hidden", grade.level === 3);
    setText(writingAction, "siguiente →", "next");
  } else {
    saveWriting(writingGrade);
  }
}

// Save the writing answer in its own 5 boxes (same rules as the cards)
function saveWriting(level) {
  const today = day();
  const p = progress[currentWriting.id];
  const w = p.writing || { box: 1, right: 0, wrong: 0, first: today };
  writingQueue.shift();
  if (level === 0) {
    w.wrong++;
    w.box = 1;
    w.due = today;
    writingQueue.push(currentWriting);   // try again later today
  } else if (level === 1) {
    w.wrong++;
    w.due = day(1);                      // almost: same box, tomorrow
  } else {
    w.right++;
    w.box = Math.min(w.box + 1, 5);
    w.due = day(BOX_DAYS[w.box]);
  }
  p.writing = w;
  writingGrade = null;
  save("progress", progress);
  nextCard();
}

writingAction.addEventListener("click", writingStep);
writingInput.addEventListener("keydown", event => {
  if (event.key === "Enter") writingStep();   // Enter on the keyboard = the big button
});
countCorrect.addEventListener("click", () => saveWriting(3));   // you were right, the app was too strict

// ---------- 9. More practice (when today's cards are done) ----------
// + 5 new cards (they join your boxes like normal new cards)
function moreNew() {
  const newCards = cards.filter(c => !progress[c.id]).slice(0, 5);
  if (newCards.length === 0) {
    setText(statusLine, "¡ya has visto todas tus tarjetas!", "you've already seen all your cards!");
    return;
  }
  freePractice = false;
  queue = newCards;
  nextCard();
}

// Free practice: 20 cards you've already seen, the hardest first
function startFreePractice() {
  const seen = cards.filter(c => progress[c.id]);
  if (seen.length === 0) {
    setText(statusLine, "todavía no has visto ninguna tarjeta", "you haven't seen any cards yet");
    return;
  }
  const difficulty = c => progress[c.id].wrong - progress[c.id].right;   // more ✗ = harder
  seen.sort(() => Math.random() - 0.5);                       // shuffle first...
  seen.sort((x, y) => difficulty(y) - difficulty(x));         // ...then hardest first
  freePractice = true;
  queue = seen.slice(0, 20);
  nextCard();
}

$("#more-new").addEventListener("click", moreNew);
$("#free-practice").addEventListener("click", startFreePractice);

// ---------- 10. Backup: export / import ----------
const fileInput = $("#file");

// Export: put all your progress + your profile in a file.
// On the phone: open the share menu (Save to Files, AirDrop...). Otherwise: download it.
async function exportBackup() {
  const backup = { app: "mi-app", version: 2, date: day(), progress: progress, profile: profile };
  const fileName = `mi-app-backup-${day()}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], fileName, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      setText(statusLine, "✓ backup exportado", "backup saved");
    } catch (error) {
      setText(statusLine, "backup cancelado", "backup cancelled");
    }
    return;
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  link.click();
  setText(statusLine, "✓ backup exportado", "backup saved");
}

// Import: read a file and use what's inside. Old (Spanish) files work too.
//  - a bundle (from Victoria, in iCloud Drive/mi-app): your cards + today's plan
//  - a backup (from [ exportar ]): your progress, MERGED with this device
//    (for each card, the most recent answer wins: the latest "last")
async function importFile() {
  const file = fileInput.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const found = [];   // what we found, for the message

    const newCards = data.cards || data.tarjetas;
    if (newCards) {
      cards = migrateCards(newCards);
      save("cards", cards);
      found.push(`${cards.length} tarjetas`);
    }
    if (data.plan) {
      plan = migratePlan(data.plan);
      save("plan", plan);
      found.push("plan de hoy");
    }
    const theirProgress = data.progress || data.progreso;
    if (theirProgress) {
      const incoming = migrateProgress(theirProgress);
      let changes = 0;
      for (const id in incoming) {
        const theirs = incoming[id];   // the card in the file
        const mine = progress[id];     // the same card on this device
        if (!mine || (theirs.last || "") > (mine.last || "")) {
          progress[id] = theirs;
          changes++;
        }
      }
      save("progress", progress);
      found.push(`progreso de ${changes} tarjetas`);
    }
    const theirProfile = migrateProfile(data.profile || data.perfil);
    if (theirProfile && (!profile || (theirProfile.updated || "") > (profile.updated || ""))) {
      profile = theirProfile;   // the profile travels with the backup (the newest one wins)
      save("profile", profile);
      applyHints();
      found.push("tu ficha");
    }
    if (found.length === 0) throw new Error("not a mi-app file");

    showName();
    buildQueue();
    nextCard();
    show("today");
    setText(statusLine, `✓ importado: ${found.join(" · ")}`, "imported");
  } catch (error) {
    setText(statusLine, "✗ ese archivo no es de mi-app", "that file is not a mi-app file");
  }
  fileInput.value = "";   // so the same file can be imported again
}

$("#export").addEventListener("click", exportBackup);
fileInput.addEventListener("change", importFile);

// ---------- 11. Screens: today · review · progress · profe ----------
const screens = {
  today: $("#screen-today"),
  review: $("#screen-review"),
  progress: $("#screen-progress"),
  profe: $("#screen-profe"),   // chatting with Profe
};
const navButtons = {
  today: $("#nav-today"),
  review: $("#nav-review"),
  progress: $("#nav-progress"),
};

// Show ONE screen and hide the others. toggle(class, yes/no) adds or removes a class.
function show(name) {
  for (const n in screens) {
    screens[n].classList.toggle("hidden", n !== name);
    if (navButtons[n]) navButtons[n].classList.toggle("active", n === name);
  }
  // while you talk to Profe, hide the menu and the status line (calm, one thing at a time)
  $(".menu").classList.toggle("hidden", name === "profe");
  statusLine.classList.toggle("hidden", name === "profe");
  if (name === "progress") drawProgress();
  if (name === "today") drawToday();
}

navButtons.today.addEventListener("click", () => show("today"));
navButtons.review.addEventListener("click", () => show("review"));
navButtons.progress.addEventListener("click", () => show("progress"));

// ---------- 12. Progress screen ----------
const report = $("#report");

// English names of the topics (the topic names are Spanish content, from your cards)
const TOPICS_EN = {
  saludos: "greetings", animales: "animals", adjetivos: "adjectives", verbos: "verbs",
  "en clase": "in class", "básicas": "basics", planes: "plans", fiesta: "party",
  "sobre mí": "about me", tiempo: "time", comida: "food", nuevas: "new words",
};

// Each card is "learned" (box 3+), "seen" or "new" (never seen)
function stateOf(c) {
  const p = progress[c.id];
  if (!p) return "new";
  if ((p.box || 1) >= 3) return "learned";
  return "seen";
}

// A bar like ██▒▒▒░░░░░ made of 3 coloured pieces (█ learned · ▒ seen · ░ new)
function bar(list, width = 10) {
  const learned = list.filter(c => stateOf(c) === "learned").length;
  const seen = list.filter(c => stateOf(c) === "seen").length;
  const full = Math.round((learned / list.length) * width);
  const half = Math.round(((learned + seen) / list.length) * width) - full;
  const b = make("span", "bar");
  b.append(
    make("span", "bar-learned", "█".repeat(full)),
    make("span", "bar-seen", "▒".repeat(half)),
    make("span", "bar-new", "░".repeat(width - full - half)),
  );
  return b;
}

function drawProgress() {
  report.innerHTML = "";   // empty the screen, then build it again
  const learned = cards.filter(c => stateOf(c) === "learned").length;
  const seen = cards.filter(c => stateOf(c) !== "new").length;

  // 1. Three big numbers at the top
  const summary = make("div", "summary");
  const stats = [
    [learned, "aprendidas", "learned"],
    [seen, "vistas", "seen"],
    [leftToday(), "para hoy", "for today"],
  ];
  for (const [number, es, en] of stats) {
    const stat = make("div", "stat");
    stat.append(make("div", "number", String(number)), make("div", "label", es, en));
    summary.append(stat);
  }
  report.append(summary);

  // writing progress, one quiet line
  const practised = cards.filter(c => progress[c.id] && progress[c.id].writing);
  const written = practised.filter(c => progress[c.id].writing.box >= 3).length;
  const writingLine = make("p", "caption", `✍ escritura: ${practised.length} practicadas · ${written} aprendidas`, "writing: practised · learned");
  writingLine.style.marginTop = "16px";
  report.append(writingLine);

  // 2. By topic: one row each (name | bar | count)
  report.append(make("h2", "heading", "por tema", "by topic"));
  report.append(make("p", "caption", "█ aprendida · ▒ vista · ░ nueva", "learned · seen · new"));
  const topics = {};   // group the cards: { animales: [...], verbos: [...], ... }
  for (const c of cards) {
    if (!topics[c.topic]) topics[c.topic] = [];
    topics[c.topic].push(c);
  }
  for (const topic in topics) {
    const list = topics[topic];
    const learnedHere = list.filter(c => stateOf(c) === "learned").length;
    const row = make("div", "row");
    row.append(
      make("span", "topic", topic, TOPICS_EN[topic]),
      bar(list),
      make("span", "count", `${learnedHere}/${list.length}`),
    );
    report.append(row);
  }

  // 3. Weak spots: cards you got wrong that aren't learned yet, most ✗ first
  report.append(make("h2", "heading", "puntos débiles", "weak spots"));
  const weak = cards
    .filter(c => progress[c.id] && progress[c.id].wrong > 0 && stateOf(c) !== "learned")
    .sort((x, y) => progress[y.id].wrong - progress[x.id].wrong)
    .slice(0, 7);
  if (weak.length === 0) {
    report.append(make("p", "empty", "ninguno todavía", "none yet"));
  }
  const ul = make("ul", "weak");
  for (const c of weak) {
    const li = make("li");
    li.append(make("span", "misses", `✗${progress[c.id].wrong}`), make("span", "word", c.es, c.en));
    ul.append(li);
  }
  report.append(ul);

  drawProfile();   // what Profe knows about you
}

// ---------- 13. Today screen (the plan comes from Profe: today.json) ----------
const greeting = $("#greeting");
const taskList = $("#tasks");
const planNote = $("#plan-note");

// "> hola, Octavia_": the name from your profile (or from Profe's plan)
function showName() {
  const name = (profile && profile.name) || (plan && plan.name);
  $("#name").textContent = name ? `, ${name}` : "";
}

// No plan file from Profe? Then the app makes a simple one from your profile
function basicPlan() {
  const hour = new Date().getHours();
  const [es, en] = hour < 14 ? ["Buenos días", "good morning"] : hour < 20 ? ["Buenas tardes", "good afternoon"] : ["Buenas noches", "good evening"];
  return {
    date: day(), from: "Profe", name: profile.name, basic: true,
    greeting: `¡${es}, ${profile.name}!`, greeting_en: en,
    tasks: [{ type: "cards", text: "repasa tus tarjetas", en: "review your cards" }],
  };
}

function drawToday() {
  taskList.innerHTML = "";   // empty the list, then fill it again
  if (!plan && profile) plan = basicPlan();
  if (!plan) {
    setText(greeting, "sin plan de Profe todavía_", "no plan from Profe yet");
    planNote.textContent = "";
    return;
  }
  const today = day();
  const ticked = done[today] || [];
  setText(greeting, plan.greeting, plan.greeting_en);

  for (const task of plan.tasks) {
    let isDone = ticked.includes(task.type);
    let text = task.text;
    if (task.type === "cards") {   // the app knows this one by itself
      isDone = leftToday() === 0;
      text = `${task.text} (${leftToday()} para hoy)`;
    }
    const li = make("li", isDone ? "done" : "", `${isDone ? "[x]" : "[ ]"} ${text}`, task.en);
    li.addEventListener("click", () => tick(task.type));
    taskList.append(li);
  }
  if (plan.date === today) {
    setText(planNote, `plan de ${plan.from} · hoy`, `plan from ${plan.from} · today`);
  } else {
    setText(planNote, `plan de ${plan.from} · del ${plan.date}`, `plan from ${plan.from} · from ${plan.date}`);
  }
}

// Tap a task: the cards one opens the review; the others tick on / off
function tick(type) {
  if (type === "cards") {
    show("review");
    return;
  }
  const today = day();
  const ticked = done[today] || [];
  done[today] = ticked.includes(type) ? ticked.filter(t => t !== type) : [...ticked, type];
  save("done", done);
  drawToday();
}

// ---------- 14. Profe: the first meeting (onboarding interview) ----------
// Profe's questions live in profe/interview.json: part of the Núcleo (the core),
// the same for every learner. Your answers become your profile ("tu ficha").
// It's saved ONLY on this device. Every Profe is the same teacher... but every profile is different.
const chat = $("#chat");
const choices = $("#choices");
const chatCompose = $("#chat-compose");
const chatInput = $("#chat-input");
const chatSend = $("#chat-send");
let draft = {};              // your answers so far
let askingAbout = null;      // the language Profe is asking about right now ("¿Qué tal hablas inglés?")

// Hints on or off, from your profile ("none" = no hints)
function applyHints() {
  document.body.classList.toggle("no-hints", Boolean(profile && profile.hints === "none"));
}

// A language's name: languageName("it") → "italiano" (or "Italian" with "en")
function languageName(code, inLanguage = "es") {
  const language = interview.languages[code];
  return language ? language[inLanguage] : code;
}

// Fill in the gaps: "¡Mucho gusto, {name}!" → "¡Mucho gusto, Octavia!"
function fillIn(text) {
  const gaps = {
    name: draft.name,
    learning: languageName(draft.learning || "es"),
    learning_en: languageName(draft.learning || "es", "en"),
    language: askingAbout && languageName(askingAbout),
    language_en: askingAbout && languageName(askingAbout, "en"),
  };
  return text.replace(/\{(\w+)\}/g, (gap, key) => gaps[key] || "");
}

// Add one line to the chat. who = "profe" or "you"
function say(who, es, en) {
  const line = make("p", "message " + who, es, en);
  chat.append(line);
  line.scrollIntoView({ block: "end", behavior: "smooth" });
}

// The answer buttons for a step. Some steps build them from the list of languages.
function optionsFor(step) {
  const all = Object.keys(interview.languages);
  const lang = code => interview.languages[code];
  const asOption = code => ({ value: code, es: languageName(code), en: languageName(code, "en") });
  if (step.options === "languages") {
    return all.filter(c => c !== draft.native).map(asOption);
  }
  if (step.options === "teachable") {   // only the languages Profe can already teach
    return all.filter(c => lang(c).teach && c !== draft.native).map(asOption);
  }
  if (step.options === "hints") {       // languages you know AND the app has hints for (not the one you're learning)
    const known = [draft.native, ...(draft.others || [])].filter(c => c !== draft.learning);
    return [...known.filter(c => lang(c) && lang(c).hints).map(asOption), ...step.extra];
  }
  return step.options;
}

// "pronto" (coming soon): languages that are ON THE PLAN (planned) but not ready yet.
// No false promises: a language that isn't planned never shows here.
function comingSoon(step) {
  const planned = Object.keys(interview.languages).filter(c => interview.languages[c].planned);
  if (step.options === "teachable") {
    return planned.filter(c => !interview.languages[c].teach && c !== draft.native);
  }
  if (step.options === "hints") {
    const known = [draft.native, ...(draft.others || [])];
    return planned.filter(c => known.includes(c) && c !== draft.learning && !interview.languages[c].hints);
  }
  return [];
}

// ---- Checking typed answers (buttons can't be wrong, but typing can) ----
// Without AI, the app can't know what a word MEANS. It can check the SHAPE:
// only letters, not too long. For places, it also knows a list of cities;
// a place it doesn't know isn't blocked (your town may be small!), Profe just asks "are you sure?".
const ONLY_LETTERS = /^[\p{L}][\p{L} '’.-]*$/u;   // \p{L} = any letter, in any alphabet (ñ, é, ж, ع...)

function problemWith(step, text) {
  if (text.length > 40) return { es: "es muy largo", en: "that's too long" };
  if (step.check && !ONLY_LETTERS.test(text)) return { es: "solo letras, por favor", en: "letters only, please" };
  return null;   // null = looks fine
}

function isKnownPlace(step, text) {
  const simple = t => stripAccents(normalize(t));
  return (step.known || []).some(place => simple(place) === simple(text));
}

// "octavia wilde" → "Octavia Wilde"
function capitalize(text) {
  return text.replace(/(^|[\s-])(\p{L})/gu, (all, before, letter) => before + letter.toUpperCase());
}

// Show the answer area for one step and WAIT until you answer.
// A Promise = "I'll give you the answer later, when the user taps".
function waitForAnswer(step) {
  choices.innerHTML = "";
  chatCompose.classList.add("hidden");
  if (replay.length > 0) return Promise.resolve(replay.shift());   // going back: replay old answers instantly
  const before = goingBackTo;   // the answer you gave here before going back (or null)
  goingBackTo = null;

  return new Promise(answerWith => {
    // "← atrás" (back): on every question except the first one
    if (answerLog.length > 0) {
      const back = make("button", "back", "← atrás", "back");
      back.onclick = () => {
        chatCompose.classList.add("hidden");
        chatSend.onclick = chatInput.onkeydown = null;
        answerWith({ back: true });
      };
      choices.append(back);
    }

    // 1. Type an answer (your name, your city)
    if (step.type === "text") {
      chatCompose.classList.remove("hidden");
      chatInput.value = before ? before.value : "";   // back here? your old answer is already typed
      chatInput.focus();
      const warning = make("p", "caption warning");
      const finish = text => {
        chatCompose.classList.add("hidden");
        chatSend.onclick = chatInput.onkeydown = null;
        answerWith({ value: text, es: text });
      };
      const send = () => {
        const text = step.check ? capitalize(chatInput.value.trim()) : chatInput.value.trim();
        if (!text) return;   // empty: wait for something
        const problem = problemWith(step, text);
        if (problem) {       // wrong shape: say why, and let them try again
          setText(warning, "✗ " + problem.es, problem.en);
          choices.prepend(warning);
          return;
        }
        if (step.check === "place" && !isKnownPlace(step, text)) {
          confirmPlace(text, finish);   // a place Profe doesn't know: ask, don't block
          return;
        }
        finish(text);
      };
      chatSend.onclick = send;
      chatInput.onkeydown = event => { if (event.key === "Enter") send(); };
      if (step.optional) {
        const skip = make("button", "", "saltar", "skip");
        skip.onclick = () => {
          chatCompose.classList.add("hidden");
          answerWith({ value: "", es: "—" });
        };
        choices.append(skip);
      }
      return;
    }

    const list = optionsFor(step);

    // 2. Pick ONE answer
    if (step.type === "one" || step.type === "levels" || step.type === "end") {
      for (const option of list) {
        const button = make("button", "", option.es, option.en);
        if (before && before.value === option.value) button.classList.add("chosen");   // your old choice, in green
        button.onclick = () => answerWith(option);
        choices.append(button);
      }
    }

    // 3. Pick SEVERAL answers: tap to tick [x] / untick [ ], then "listo"
    if (step.type === "many") {
      const chosen = [];
      for (const option of list) {
        const button = make("button", "", `[ ] ${option.es}`, option.en);
        if (before && before.value.includes(option.value)) {   // back here? your old ticks are still there
          chosen.push(option);
          setText(button, `[x] ${option.es}`, option.en);
          button.classList.add("chosen");
        }
        button.onclick = () => {
          const i = chosen.indexOf(option);
          if (i === -1) chosen.push(option); else chosen.splice(i, 1);
          setText(button, `${i === -1 ? "[x]" : "[ ]"} ${option.es}`, option.en);
          button.classList.toggle("chosen", i === -1);
        };
        choices.append(button);
      }
      const ready = make("button", "ready", "listo →", "done");
      ready.onclick = () => answerWith({
        value: chosen.map(option => option.value),
        es: chosen.length ? chosen.map(option => option.es).join(", ") : "ninguno",
      });
      choices.append(ready);
    }

    // languages that are coming soon: one quiet line, not more buttons
    const soon = comingSoon(step);
    if (soon.length) {
      choices.append(make("p", "caption soon", "pronto: " + soon.map(c => languageName(c)).join(" · "), "coming soon"));
    }
    choices.scrollIntoView({ block: "end", behavior: "smooth" });   // keep the answers on screen
  });
}

// "No conozco «Dog»": two buttons, keep it or fix it
function confirmPlace(text, finish) {
  const kept = [...choices.children].filter(el => !el.classList.contains("warning"));   // ← atrás, saltar: keep them for later
  chatCompose.classList.add("hidden");
  choices.innerHTML = "";
  choices.append(make("p", "caption soon", `no conozco «${text}». ¿es una ciudad o un pueblo?`, `I don't know "${text}". Is it a city or a town?`));
  const yes = make("button", "", "sí, es mi ciudad", "yes, it's where I live");
  yes.onclick = () => finish(text);
  const fix = make("button", "", "corregir", "fix it");
  fix.onclick = () => {
    choices.replaceChildren(...kept);   // back to the text box, with its buttons
    chatCompose.classList.remove("hidden");
    chatInput.focus();
  };
  choices.append(yes, fix);
}

// One step: Profe talks, you answer, the answer is shown as "tú>"
async function ask(step, messages = step.says) {
  for (const m of messages) {
    if (replay.length === 0) await pause(600);   // no "typing" pause while replaying
    say("profe", fillIn(m.es), fillIn(m.en));
  }
  const reply = await waitForAnswer(step);
  choices.innerHTML = "";
  if (reply.back) throw BACK;   // jump out of the interview... and start it again, one answer shorter
  answerLog.push(reply);
  say("you", reply.es);
  return reply.value;
}

// Going back, the simple way: forget your last answer, then run the interview again
// from the start, replaying your other answers instantly (replay). You land on the
// previous question. It also works when an earlier answer changes the next questions
// (e.g. which languages Profe asks "¿Qué tal hablas...?" about).
const BACK = "back";
let answerLog = [];         // your answers, in order
let replay = [];          // answers waiting to be replayed
let goingBackTo = null;   // the answer you're going back to (shown ticked / typed again)

async function meetProfe(savedAnswers = []) {
  try {
    await runInterview(savedAnswers);
  } catch (signal) {
    if (signal !== BACK) throw signal;   // a real error: don't hide it
    goingBackTo = answerLog[answerLog.length - 1] || null;
    return meetProfe(answerLog.slice(0, -1));
  }
}

// The whole interview, step by step
async function runInterview(savedAnswers) {
  draft = { languages: {} };
  answerLog = [];
  replay = [...savedAnswers];
  chat.innerHTML = "";
  show("profe");

  for (const step of interview.steps) {
    if (step.type === "levels") {   // one question per language you speak
      for (const code of draft.others || []) {
        if (code === "other") continue;
        askingAbout = code;
        draft.languages[code] = await ask(step);
      }
      askingAbout = null;
      continue;
    }

    if (step.type === "end") {
      for (const m of step.says) {
        await pause(600);
        say("profe", fillIn(m.es), fillIn(m.en));
      }
      for (const [es, en] of profileLines(draft)) say("profile-line", es, en);
      if (await ask(step, step.after) === "again") return runInterview([]);   // start again, from zero
      continue;
    }

    const value = await ask(step);
    draft[step.saveAs] = value;
    if (step.id === "native") draft.languages[value] = "native";
  }

  // Done: save the profile on this device and open the app
  profile = { ...draft, created: profile ? profile.created : day(), updated: new Date().toISOString() };
  save("profile", profile);
  applyHints();
  showName();
  if (plan && plan.basic) plan = null;   // the simple plan will be made again, with your new name
  buildQueue();
  nextCard();
  show("today");
}

// The profile as short lines (Spanish + English hint): at the end of the interview and in [ progreso ]
function optionLabel(stepId, value) {
  if (value === "native") return "nativo";
  const step = interview.steps.find(s => s.id === stepId);
  const option = Array.isArray(step.options) && step.options.find(o => o.value === value);
  return option ? option.es : String(value);
}

function profileLines(p) {
  const spoken = Object.entries(p.languages || {}).map(([code, level]) => `${languageName(code)} (${optionLabel("levels", level)})`);
  const list = (stepId, values) => (values || []).map(v => optionLabel(stepId, v)).join(" · ") || "—";
  return [
    [`nombre: ${p.name}`, "name"],
    [`hablas: ${spoken.join(" · ") || "—"}`, "languages you speak"],
    [`aprendes: ${languageName(p.learning)} · nivel ${p.level}`, "you're learning · level"],
    [`pistas: ${p.hints === "none" ? "sin pistas" : languageName(p.hints)}`, "hints"],
    [`para: ${list("reasons", p.reasons)}`, "why"],
    [`vives en: ${p.city || "—"} · ${p.school ? "con escuela" : "sin escuela"}`, "you live in · with / without a school"],
    [`te gusta: ${list("interests", p.interests)}`, "you like"],
    [`tiempo: ${optionLabel("minutes", p.minutes)} al día · ${NEW_PER_MINUTES[p.minutes]} palabras nuevas`, "time per day · new words"],
  ];
}

// [ progreso ] → "tu ficha": what Profe knows about you, + meet Profe again
function drawProfile() {
  const box = $("#profile");
  box.innerHTML = "";
  if (!interview) return;   // offline and the questions never loaded: nothing to show
  if (profile) {
    for (const [es, en] of profileLines(profile)) box.append(make("p", "message profile-line", es, en));
  } else {
    box.append(make("p", "empty", "todavía no conoces a Profe", "you haven't met Profe yet"));
  }
  const again = make("button", "link", profile ? "↺ repetir la entrevista" : "→ conocer a Profe", profile ? "redo the interview" : "meet Profe");
  again.onclick = () => meetProfe();
  box.append(again);
}

// ---------- 15. Offline + updates ----------
// The service worker (sw.js) keeps a copy of the app, so it opens with no internet.
if ("serviceWorker" in navigator) {
  // updateViaCache "none" = always check the real sw.js, never an old saved copy
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
}

$("#version").textContent = `mi-app v${VERSION}`;

// [ ↻ actualizar ]: get the newest files and restart the app
async function update() {
  setText(statusLine, "actualizando...", "updating...");
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) await registration.update().catch(() => {});   // is there a new sw.js?
  }
  location.reload();
}
$("#update").addEventListener("click", update);

// iPhone home-screen apps don't really close: they sleep in the background.
// If the app wakes up after 30+ minutes, restart it so it's fresh
// (new version, new day, new plan). Your progress is saved, nothing is lost.
let asleepSince = null;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    asleepSince = Date.now();
  } else if (asleepSince && Date.now() - asleepSince > 30 * 60 * 1000) {
    location.reload();
  }
});

// ---------- 16. Start the app ----------
// At the very end, so everything above already exists when it runs.
start();
