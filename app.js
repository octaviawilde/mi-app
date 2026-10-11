// mi-app: a calm, terminal-style app to learn a language with your own Profe.
// Plain HTML + CSS + JavaScript, no build tools. Read it top to bottom:
//   1 settings · 2 page elements + state · 3 helpers · 4 saved data (+ migration from v1.5)
//   5 loading · 6 today's queue · 7 review cards · 8 writing · 9 more practice · 10 backup
//   11 screens · 12 progress · 13 today · 14 Profe's interview · 15 Profe's map (curriculum)
//   16 placement test + lessons · 17 Profe with AI (chat) · 18 offline + updates · 19 start
// The code is in English so anyone can read it and contribute.
// The text the learner SEES lives in lang/<code>.json (es, en, uk, it, ru): big = the language
// they're learning, small hint under it = their own language. That's content, not code.

// ---------- 1. Settings (change these numbers whenever you like) ----------
const VERSION = "1.23";                      // change it every time you publish
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

let cards = [];             // all your cards: your deck + the ones Profe gave you
let profeCards = [];        // cards Profe made for you in the chat (saved apart, so a new deck never deletes them)
let queue = [];             // today's queue (the cards waiting for you)
let current = null;         // the card on the screen now
let writingQueue = [];      // today's writing queue
let freePractice = false;   // free practice = review anything, your boxes don't change
let progress = {};          // what you know: progress[cardId] = { box, right, wrong, due, ... }
let profile = null;         // your profile, made in the interview with Profe
let plan = null;            // today's plan (from Profe)
let done = {};              // ticked tasks: { "2026-10-09": ["mission"] }
let interview = null;       // Profe's interview questions (profe/interview.json)
let lessons = null;         // written lessons that need no AI (profe/lessons/<language>.json)

const UI_LANGUAGES = ["es", "en", "uk", "it", "ru"];   // the app's own text exists in these (lang/<code>.json)
let strings = {};                                 // strings.es = { "nav.today": "hoy", ... }
let speaking = { main: "en", hint: null };        // main = the big text · hint = the small text under it

// ---------- 3. Helpers ----------
// A date as "2026-10-09". day() = today, day(3) = in 3 days
function day(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toLocaleDateString("sv");   // "sv" (Swedish) writes dates as YYYY-MM-DD
}

// Write a text on the screen + a small hint under it.
// The hint lives in data-hint, and the CSS shows it (style.css → "Hints").
function setText(element, main, hint) {
  element.textContent = main;
  if (hint && hint !== main) {
    element.dataset.hint = hint;
  } else {
    delete element.dataset.hint;   // no hint for this text
  }
}

// Create a piece of the page: make("p", "heading", "por tema", "за темами") → text + hint under it
function make(tag, className, main, hint) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (main !== undefined) setText(element, main, hint);
  return element;
}

// ---- Languages ----
// Every text of the app has a key ("nav.today") and lives in lang/<code>.json, once per language.
// The app shows two languages at once:
//   main = the language you're LEARNING (big)   ·   hint = YOUR language (small, under it)
// A Ukrainian learning Spanish sees "hoy" with "сьогодні" under it.

// One text in one language. {gaps} are filled in: phrase("es", "box.n", { box: 2 }) → "caja 2"
// values can also be a function, when the words to fill in depend on the language.
function phrase(language, key, values) {
  const text = (strings[language] && strings[language][key]) || (strings.en && strings.en[key]) || key;
  const filled = typeof values === "function" ? values(language) : values || {};
  return text.replace(/\{(\w+)\}/g, (gap, name) => (filled[name] === undefined ? "" : filled[name]));
}

// t = the text in the main language · tr = both: [main, hint]
// own = in YOUR language: for places with no room for a hint (lists to choose from, grey text inside a box)
function t(key, values) {
  return phrase(speaking.main, key, values);
}

function tr(key, values) {
  return [t(key, values), speaking.hint ? phrase(speaking.hint, key, values) : ""];
}

function own(key, values) {
  return phrase(speaking.hint || speaking.main, key, values);
}

// Content written in several languages ({ es: "…", en: "…", uk: "…" }): pick one / pick [main, hint]
function pick(item, language) {
  return item[language] || item.all || item.en || "";
}

function both(item) {
  return [pick(item, speaking.main), speaking.hint ? pick(item, speaking.hint) : ""];
}

// Content that only has an English hint (your imported cards, the curriculum): show it if you use hints
function contentHint(english) {
  return speaking.hint && speaking.main !== "en" ? english || "" : "";
}

// What a card means, in your language when the card has it
function meaning(c) {
  return c[speaking.hint] || c[profile && profile.ui] || c.en || c.es || "";
}

// The language you're learning ("es")
function learning() {
  return (profile && profile.learning) || draft.learning || "es";
}

// The phone's language, if the app speaks it ("uk-UA" → "uk")
function deviceLanguage() {
  const code = (navigator.language || "en").slice(0, 2);
  return UI_LANGUAGES.includes(code) ? code : "en";
}

// Decide main + hint from a profile (or from the answers so far, during the interview)
function setLanguages(p) {
  p = p || {};
  const yours = p.ui || (UI_LANGUAGES.includes(p.hints) ? p.hints : deviceLanguage());
  const main = UI_LANGUAGES.includes(p.learning) ? p.learning : yours;
  let hint = p.hints === undefined ? yours : p.hints;   // not chosen yet? your own language
  if (hint === main || !UI_LANGUAGES.includes(hint)) hint = null;   // "none", or the same as main: no hints
  speaking = { main, hint };
  document.documentElement.lang = main;
  translatePage();
}

// The fixed texts of index.html: each one says which key it shows (data-t="nav.today")
function translatePage() {
  for (const element of document.querySelectorAll("[data-t]")) setText(element, ...tr(element.dataset.t));
  for (const element of document.querySelectorAll("[data-t-main]")) element.textContent = t(element.dataset.tMain);
  for (const element of document.querySelectorAll("[data-t-placeholder]")) element.placeholder = own(element.dataset.tPlaceholder);
  for (const element of document.querySelectorAll("[data-t-hint]")) {   // a symbol (→) with only a hint
    setText(element, element.textContent, speaking.hint ? phrase(speaking.hint, element.dataset.tHint) : "");
  }
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

// Same, for a text file (Profe's core.md)
async function loadText(path) {
  try {
    const response = await fetch(path);
    return response.ok ? await response.text() : null;
  } catch (error) {
    return null;
  }
}

// Your deck + Profe's cards (a Profe card that's already in your deck isn't added twice)
function setCards(deck) {
  const inDeck = new Set(deck.map(c => c.term.toLowerCase()));
  cards = [...deck, ...profeCards.filter(c => !inDeck.has(c.term.toLowerCase()))];
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

// Since v1.17 a card's word is "term" (it can be Spanish, English...). Older cards called it "es".
function migrateCards(old) {
  return old.map(c => {
    const card = renameKeys(c, CARD_NAMES);
    if (card.term === undefined) {
      card.term = card.es;
      delete card.es;
    }
    return card;
  });
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
  const texts = await Promise.all(UI_LANGUAGES.map(code => loadJson(`lang/${code}.json`)));   // all 4 at once
  UI_LANGUAGES.forEach((code, i) => { strings[code] = texts[i] || {}; });
  progress = migrateProgress(loadSaved("progress") || {});
  done = migrateDone(loadSaved("done") || {});
  profile = migrateProfile(loadSaved("profile"));
  profeCards = migrateCards(loadSaved("profeCards") || []);
  plan = migratePlan((await loadJson("today.json")) || loadSaved("plan"));
  interview = await loadJson("profe/interview.json");
  profeCore = await loadText("profe/core.md");   // Profe's teaching method, for the AI
  await loadCourse();   // Profe's map, the placement test and your cards

  setLanguages(profile);
  showName();
  buildQueue();
  nextCard();
  if (!profile && interview) {
    meetProfe();   // first time here? Profe wants to meet you
  } else {
    show("today");
  }
}

// Everything that depends on the language you learn and your level: Profe's map, the test, your cards.
// Your cards: your own deck if you have one (from Anki, through Victoria's bridge), otherwise the starter decks.
async function loadCourse() {
  curriculum = await loadJson(`profe/curriculum/${learning()}.json`);
  placementTest = await loadJson(`profe/placement/${learning()}.json`);
  lessons = await loadJson(`profe/lessons/${learning()}.json`);
  let deck = migrateCards((await loadJson("cards.json")) || loadSaved("cards") || []);
  if (deck.length === 0) deck = await loadDecks();
  if (deck.length === 0) deck = migrateCards((await loadJson("sample.json")) || []);
  setCards(deck);
}

// The starter decks: decks/A1.json ... C1.json. One row = one idea in every language:
//   { id, topic, es: "la casa", en: "house", uk: "дім", it: "casa", ru: "дом", ex_es: "…", ex_en: "…" }
// A card = the word in the language you learn (term) + its example + its meaning in the other languages.
// You get the decks from YOUR level up: if you start at B1, you don't get "hola".
const DECK_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

async function loadDecks() {
  const language = learning();
  const level = map.start || (profile && profile.level);
  const from = level === "C2" ? DECK_LEVELS.length - 1 : Math.max(0, DECK_LEVELS.indexOf(level));
  const files = await Promise.all(DECK_LEVELS.slice(from).map(l => loadJson(`decks/${l}.json`)));
  const deck = [];
  for (const file of files) {
    for (const row of (file && file.cards) || []) {
      if (!row[language]) continue;   // no word in this language: skip the row
      const card = { id: `${language}-${row.id}`, term: row[language], example: row["ex_" + language] || "", topic: row.topic, level: file.level };
      for (const code of UI_LANGUAGES) {
        if (code !== language && row[code]) card[code] = row[code];
      }
      deck.push(card);
    }
  }
  return deck;
}

// ---------- 6. Today's queue ----------
// New cards per day: from your profile (minutes per day), or the setting at the top
function newPerDay() {
  return (profile && NEW_PER_MINUTES[profile.minutes]) || NEW_PER_DAY;
}

function isFromProfe(c) {
  return String(c.id).startsWith("p-");
}

function isDue(c) {
  return progress[c.id] && (progress[c.id].due || day()) <= day();
}

// Today's queue = cards due for review + a few new ones
function buildQueue() {
  const today = day();
  const reviews = cards.filter(isDue);
  const newToday = Object.values(progress).filter(p => p.first === today).length;
  const fromProfe = cards.filter(c => !progress[c.id] && isFromProfe(c));   // you asked for these: always today
  const newCards = cards.filter(c => !progress[c.id] && !isFromProfe(c)).slice(0, Math.max(0, newPerDay() - newToday));
  queue = [...reviews, ...fromProfe, ...newCards];
  writingQueue = writingForToday();
}

// How many cards are still waiting for you today (reviews due + new ones left + writing)
function leftToday() {
  const today = day();
  const reviews = cards.filter(isDue).length;
  const newToday = Object.values(progress).filter(p => p.first === today).length;
  const fromProfe = cards.filter(c => !progress[c.id] && isFromProfe(c)).length;
  const unseen = cards.filter(c => !progress[c.id] && !isFromProfe(c)).length;
  return reviews + fromProfe + Math.min(unseen, Math.max(0, newPerDay() - newToday)) + writingForToday().length;
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
    setText(statusLine, ...tr("status.free", { n: queue.length }));
  } else {
    setText(statusLine, ...tr("status.today", { n: queue.length, learned: learnedCount(), total: cards.length }));
  }

  // recognition done → writing practice (if there's any today)
  hideWriting();
  if (queue.length === 0 && writingQueue.length > 0 && !freePractice) {
    showWriting();
    return;
  }

  if (queue.length === 0) {
    setText(question, ...tr("review.done"));
    setText(answer, ...tr("review.more"));
    answer.classList.remove("hidden");
    tapHint.classList.add("hidden");
    answers.classList.add("hidden");
    boxLabel.textContent = "";
    more.classList.remove("hidden");   // show [ + 5 nuevas ] [ práctica libre ]
    return;   // stop here: nothing else to show
  }

  more.classList.add("hidden");
  current = queue[0];   // the first card in the queue
  setText(question, current.term);   // no hint here: that would give away the answer!
  setText(answer, meaning(current) + "\n" + current.example);
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
    setText(boxLabel, ...tr("box.new"));
    return;
  }
  const box = p.box || 1;
  const [name, hint] = tr("box.n", { box });
  setText(boxLabel, `${name} ${boxBar(box)}`, hint);
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

// ---------- 8. Writing (see the meaning → type the word) ----------
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
  return !/[:+…]/.test(c.term) && c.term.length <= 40;
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
function normalize(s) { return s.toLowerCase().replace(/[’‘]/g, "'").replace(/[¡!¿?.,;]/g, "").replace(/\s+/g, " ").trim(); }
function stripAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
const ARTICLES = { es: /^(el|la|los|las|un|una) /, en: /^(the|a|an|to) / };   // small words in front, by language
function stripArticle(s) { return ARTICLES[learning()] ? s.replace(ARTICLES[learning()], "") : s; }

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
// key = which text to show ("grade.perfect" → "✓ ¡perfecto!")
function gradeWriting(written, c) {
  const w = normalize(written);
  const options = [normalize(c.term), ...c.term.split("/").map(normalize)];   // "sucio / sucia" → either one
  if (w === "") return { level: 0, key: "grade.empty" };
  if (options.includes(w)) return { level: 3, key: "grade.perfect" };
  if (options.some(o => stripAccents(o) === stripAccents(w))) return { level: 1, key: "grade.accents" };
  if (options.some(o => stripArticle(o) !== o && stripArticle(o) === w)) return { level: 1, key: "grade.article" };
  if (options.some(o => o.length >= 5 && editDistance(stripAccents(o), stripAccents(w)) === 1)) return { level: 1, key: "grade.letter" };
  return { level: 0, key: "grade.no" };
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
  setText(statusLine, ...tr("status.writing", { n: writingQueue.length, learned: learnedCount(), total: cards.length }));
  setText($("#writing-label"), ...tr("writing.label", language => ({ in: phrase(language, "in." + learning()) })));   // "escríbelo en español"
  $("#writing-tip").classList.toggle("hidden", learning() !== "es");   // the accent tip is only for Spanish
  card.classList.add("hidden");
  answers.classList.add("hidden");
  more.classList.add("hidden");
  writingCard.classList.remove("hidden");
  writingButtons.classList.remove("hidden");

  const w = progress[currentWriting.id].writing;
  if (w) {
    const [name, hint] = tr("writing.box", { box: w.box });
    setText(writingBox, `${name} ${boxBar(w.box)}`, hint);
  } else {
    setText(writingBox, ...tr("writing.new"));
  }
  setText(writingQuestion, meaning(currentWriting));
  writingInput.value = "";
  writingInput.readOnly = false;
  result.classList.add("hidden");
  solution.classList.add("hidden");
  setText(writingAction, ...tr("writing.check"));
  writingInput.focus();
}

// The big button: first "comprobar" (check), then "siguiente" (next)
function writingStep() {
  if (writingCard.classList.contains("hidden")) return;   // not on the writing screen
  if (writingGrade === null) {
    const grade = gradeWriting(writingInput.value, currentWriting);
    writingGrade = grade.level;
    writingInput.readOnly = true;   // keep what you wrote visible, but locked
    setText(result, ...tr(grade.key));
    result.className = "result " + (grade.level === 3 ? "good" : grade.level === 1 ? "almost" : "bad");
    setText(solution, currentWriting.term + "\n" + currentWriting.example);
    solution.classList.remove("hidden");
    countCorrect.classList.toggle("hidden", grade.level === 3);
    setText(writingAction, ...tr("writing.next"));
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
    setText(statusLine, ...tr("more.none"));
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
    setText(statusLine, ...tr("free.none"));
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
  // your AI key is NOT in here on purpose: a backup file can end up anywhere
  const backup = { app: "mi-app", version: 2, date: day(), progress: progress, profile: profile, profeCards: profeCards, talk: talk, map: map };
  const fileName = `mi-app-backup-${day()}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], fileName, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      setText(statusLine, ...tr("backup.saved"));
    } catch (error) {
      setText(statusLine, ...tr("backup.cancelled"));
    }
    return;
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  link.click();
  setText(statusLine, ...tr("backup.saved"));
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
    const found = [];   // what we found, for the message: [key, values]

    const newCards = data.cards || data.tarjetas;
    if (newCards) {
      const deck = migrateCards(newCards);
      save("cards", deck);
      setCards(deck);   // Profe's cards stay
      found.push(["import.cards", { n: deck.length }]);
    }
    if (data.profeCards) {
      const known = new Set(profeCards.map(c => c.id));
      const added = migrateCards(data.profeCards).filter(c => !known.has(c.id));
      profeCards = [...profeCards, ...added];
      save("profeCards", profeCards);
      setCards(cards.filter(c => !isFromProfe(c)));
      if (added.length) found.push(["import.profeCards", { n: added.length }]);
    }
    if (data.map && data.map.done) {
      map = { ...map, ...data.map, done: { ...data.map.done, ...map.done } };   // steps done on either device stay done
      save("map", map);
    }
    if (data.talk && data.talk.length > talk.length) {
      talk = data.talk;   // the longer conversation wins
      save("talk", talk);
    }
    if (data.plan) {
      plan = migratePlan(data.plan);
      save("plan", plan);
      found.push(["import.plan"]);
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
      found.push(["import.progress", { n: changes }]);
    }
    const theirProfile = migrateProfile(data.profile || data.perfil);
    if (theirProfile && (!profile || (theirProfile.updated || "") > (profile.updated || ""))) {
      profile = theirProfile;   // the profile travels with the backup (the newest one wins)
      save("profile", profile);
      setLanguages(profile);
      await loadCourse();   // the profile may bring another language or level
      found.push(["settings.profile"]);
    }
    if (found.length === 0) throw new Error("not a mi-app file");

    showName();
    buildQueue();
    nextCard();
    show("today");
    setText(statusLine, ...tr("import.ok", language => ({ what: found.map(([key, values]) => phrase(language, key, values)).join(" · ") })));
  } catch (error) {
    setText(statusLine, ...tr("import.bad"));
  }
  fileInput.value = "";   // so the same file can be imported again
}

$("#export").addEventListener("click", exportBackup);
fileInput.addEventListener("change", importFile);

// ---------- 11. Screens: today · profe · review · progress · ⚙ settings ----------
const screens = {
  today: $("#screen-today"),
  review: $("#screen-review"),
  progress: $("#screen-progress"),
  settings: $("#screen-settings"),     // ⚙ you and the app: profile, AI, backups, updates
  interview: $("#screen-interview"),   // meeting Profe (the first time)
  placement: $("#screen-placement"),   // the placement test
  profe: $("#screen-profe"),           // chatting with Profe (needs an AI)
};
const navButtons = {
  today: $("#nav-today"),
  review: $("#nav-review"),
  progress: $("#nav-progress"),
  profe: $("#nav-profe"),
  settings: $("#nav-settings"),
};

// Show ONE screen and hide the others. toggle(class, yes/no) adds or removes a class.
function show(name) {
  for (const n in screens) {
    screens[n].classList.toggle("hidden", n !== name);
    if (navButtons[n]) navButtons[n].classList.toggle("active", n === name);
  }
  // during the interview and the test, hide the menu and the status line (calm, one thing at a time)
  $(".menu").classList.toggle("hidden", name === "interview" || name === "placement");
  navButtons.settings.classList.toggle("hidden", name === "interview" || name === "placement");   // no ⚙ either: it was a way to skip the interview
  statusLine.classList.toggle("hidden", ["interview", "placement", "profe", "settings"].includes(name));
  if (name === "progress") drawProgress();
  if (name === "today") drawToday();
  if (name === "profe") drawTalk();
  if (name === "settings") {
    drawProfile();      // what Profe knows about you
    drawAiSettings();   // the AI that powers Profe
  }
}

navButtons.today.addEventListener("click", () => show("today"));
navButtons.review.addEventListener("click", () => show("review"));
navButtons.progress.addEventListener("click", () => show("progress"));
navButtons.profe.addEventListener("click", () => show("profe"));
navButtons.settings.addEventListener("click", () => show("settings"));

// ---------- 12. Progress screen ----------
const report = $("#report");

// English names of the topics (the topic names are content, from your cards)
const TOPICS_EN = {
  saludos: "greetings", animales: "animals", adjetivos: "adjectives", verbos: "verbs",
  "en clase": "in class", "básicas": "basics", planes: "plans", fiesta: "party",
  "sobre mí": "about me", tiempo: "time", comida: "food", nuevas: "new words", "de Profe": "from Profe",
};

// A topic's name as [main, hint]. Starter-deck topics are translated (lang/*.json → "topic.food");
// topics from your own cards are shown as they are.
function topicName(topic) {
  if (strings.en && strings.en["topic." + topic]) return tr("topic." + topic);
  return [topic === "de Profe" ? t("topic.profe") : topic, contentHint(TOPICS_EN[topic])];
}

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
    [learned, "stat.learned"],
    [seen, "stat.seen"],
    [leftToday(), "stat.today"],
  ];
  for (const [number, key] of stats) {
    const stat = make("div", "stat");
    stat.append(make("div", "number", String(number)), make("div", "label", ...tr(key)));
    summary.append(stat);
  }
  report.append(summary);

  // writing progress, one quiet line
  const practised = cards.filter(c => progress[c.id] && progress[c.id].writing);
  const written = practised.filter(c => progress[c.id].writing.box >= 3).length;
  const writingLine = make("p", "caption", ...tr("progress.writing", { practised: practised.length, learned: written }));
  writingLine.style.marginTop = "16px";
  report.append(writingLine);

  // 2. By topic: one row each (name | bar | count)
  report.append(make("h2", "heading", ...tr("progress.byTopic")));
  report.append(make("p", "caption", ...tr("progress.legend")));
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
      make("span", "topic", ...topicName(topic)),
      bar(list),
      make("span", "count", `${learnedHere}/${list.length}`),
    );
    report.append(row);
  }

  // 3. Weak spots: cards you got wrong that aren't learned yet, most ✗ first
  report.append(make("h2", "heading", ...tr("progress.weak")));
  const weak = cards
    .filter(c => progress[c.id] && progress[c.id].wrong > 0 && stateOf(c) !== "learned")
    .sort((x, y) => progress[y.id].wrong - progress[x.id].wrong)
    .slice(0, 7);
  if (weak.length === 0) {
    report.append(make("p", "empty", ...tr("progress.none")));
  }
  const ul = make("ul", "weak");
  for (const c of weak) {
    const li = make("li");
    li.append(make("span", "misses", `✗${progress[c.id].wrong}`), make("span", "word", c.term, meaning(c)));
    ul.append(li);
  }
  report.append(ul);

  drawMap();       // where you are on Profe's map
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
  const moment = hour < 14 ? "morning" : hour < 20 ? "afternoon" : "evening";
  const [greeting, greetingHint] = tr(`greeting.${moment}`, { name: profile.name });
  const task = (type, key, values, more) => {
    const [text, hint] = tr(key, values);
    return { type, text, hint, en: phrase("en", key, values), ...more };   // en: what Profe (the AI) reads
  };
  const tasks = [task("cards", "task.cards", { n: leftToday() })];
  if (placementTest && !profile.placement && profile.level !== "pre-A1") tasks.push(task("placement", "task.placement"));
  const step = curriculum && currentStep();   // today's lesson, from your map
  if (step) {
    const title = language => ({ title: language === speaking.main ? step.title : step.en || step.title });
    tasks.push(task("lesson", "task.lesson", title, { title: step.title }));
  } else if (!curriculum) {   // no map for this language yet: Profe plans the lesson
    tasks.push(task("lesson", "task.freeLesson", {}, { free: true }));
  }
  return { date: day(), from: "Profe", name: profile.name, basic: true, greeting, greetingHint, tasks };
}

function drawToday() {
  taskList.innerHTML = "";   // empty the list, then fill it again
  if (profile && (!plan || plan.basic)) plan = basicPlan();   // the simple plan is made fresh each time
  if (!plan) {
    setText(greeting, ...tr("today.noplan"));
    planNote.textContent = "";
    return;
  }
  const today = day();
  const ticked = done[today] || [];
  // a plan made by the app brings its own hints; a plan from a file (Victoria's bridge) brings English ones
  setText(greeting, plan.greeting, plan.basic ? plan.greetingHint : contentHint(plan.greeting_en));

  for (const task of plan.tasks) {
    let isDone = ticked.includes(task.type);
    let text = task.text;
    if (task.type === "cards") {   // the app knows this one by itself
      isDone = leftToday() === 0;
      if (!plan.basic) text = `${task.text} (${leftToday()} para hoy)`;
    }
    const li = make("li", isDone ? "done" : "", `${isDone ? "[x]" : "[ ]"} ${text}`, plan.basic ? task.hint : contentHint(task.en));
    li.addEventListener("click", () => tick(task));
    taskList.append(li);
  }
  setText(planNote, ...tr(plan.date === today ? "today.from" : "today.fromDate", { from: plan.from, date: plan.date }));
}

// Tap a task: cards → the review; lesson → Profe (ready to start); the others tick on / off
function tick(task) {
  const type = task.type;
  if (type === "cards") {
    show("review");
    return;
  }
  if (type === "placement") {
    startPlacement();
    return;
  }
  if (type === "lesson") {
    const step = curriculum && currentStep();
    if (plan.basic && hasLesson(step)) {   // a written lesson exists: no AI needed
      startLesson(step);
      return;
    }
    show("profe");   // otherwise Profe (the AI) teaches it, and marks it done on your map
    talkInput.value = task.free ? t("lesson.free") : t("lesson.start", { title: task.title || task.text.replace(/^clase con Profe: /, "") });
    talkInput.focus();
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
let askingAbout = null;      // the language Profe is asking about right now ("inglés: ¿qué tal lo hablas?")

// A language's name: languageName("it", "es") → "italiano" · languageName("it", "en") → "Italian"
function languageName(code, inLanguage) {
  return phrase(inLanguage, "language." + code);
}

// Fill in the gaps: "¡Mucho gusto, {name}!" → "¡Mucho gusto, Octavia!"
function fillIn(text, inLanguage) {
  const gaps = { name: draft.name, language: askingAbout && languageName(askingAbout, inLanguage) };
  return text.replace(/\{(\w+)\}/g, (gap, key) => gaps[key] || "");
}

// One of Profe's lines (written in 4 languages in interview.json) → [main text, hint]
function profeSays(line) {
  const { main, hint } = speaking;
  return [fillIn(pick(line, main), main), hint ? fillIn(pick(line, hint), hint) : ""];
}

// Add one line to a chat. who = "profe" or "you". where = the interview chat, or the AI chat
function say(who, main, hint, where = chat) {
  const line = make("p", "message " + who, main, hint);
  where.append(line);
  line.scrollIntoView({ block: "end", behavior: "smooth" });
}

// The answer buttons for a step. Some steps build them from the list of languages.
function optionsFor(step) {
  const all = Object.keys(interview.languages);
  const lang = code => interview.languages[code];
  // a language as an answer: its name in each of the app's languages ({ value: "it", es: "italiano", en: "Italian", ... })
  const asOption = code => {
    const option = { value: code };
    for (const language of UI_LANGUAGES) option[language] = languageName(code, language);
    return option;
  };
  if (step.options === "interface") {   // the very first question: each language in its OWN name (Українська, Italiano...)
    return all.filter(c => lang(c).ui).map(c => ({ value: c, all: lang(c).own }));
  }
  if (step.options === "languages") {
    return all.filter(c => c !== draft.native).map(asOption);
  }
  if (step.options === "teachable") {   // only the languages Profe can already teach
    return all.filter(c => lang(c).teach && c !== draft.native).map(asOption);
  }
  if (step.options === "hints") {       // languages you know AND the app can speak (not the one you're learning)
    const known = [...new Set([draft.ui, draft.native, ...(draft.others || [])])].filter(c => c !== draft.learning);
    return [...known.filter(c => lang(c) && lang(c).ui).map(asOption), ...step.extra];
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
    return planned.filter(c => known.includes(c) && c !== draft.learning && !interview.languages[c].ui);
  }
  return [];
}

// ---- Checking typed answers (buttons can't be wrong, but typing can) ----
// Without AI, the app can't know what a word MEANS. It can check the SHAPE:
// only letters, not too long. For places, it also knows a list of cities;
// a place it doesn't know isn't blocked (your town may be small!), Profe just asks "are you sure?".
const ONLY_LETTERS = /^[\p{L}][\p{L} '’.-]*$/u;   // \p{L} = any letter, in any alphabet (ñ, é, ж, ع...)

function problemWith(step, text) {
  if (text.length > 40) return "check.long";
  if (step.check && !ONLY_LETTERS.test(text)) return "check.letters";
  return null;   // null = looks fine (otherwise: the key of the text that says what's wrong)
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
      const back = make("button", "back", ...tr("interview.back"));
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
        answerWith({ value: text, text });
      };
      const send = () => {
        const text = step.check ? capitalize(chatInput.value.trim()) : chatInput.value.trim();
        if (!text) return;   // empty: wait for something
        const problem = problemWith(step, text);
        if (problem) {       // wrong shape: say why, and let them try again
          const [main, hint] = tr(problem);
          setText(warning, "✗ " + main, hint);
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
        const skip = make("button", "", ...tr("interview.skip"));
        skip.onclick = () => {
          chatCompose.classList.add("hidden");
          answerWith({ value: "", text: "—" });
        };
        choices.append(skip);
      }
      return;
    }

    const list = optionsFor(step);

    // 2. Pick ONE answer
    if (step.type === "one" || step.type === "levels" || step.type === "end") {
      for (const option of list) {
        const button = make("button", "", ...both(option));
        if (before && before.value === option.value) button.classList.add("chosen");   // your old choice, in green
        button.onclick = () => answerWith({ value: option.value, text: pick(option, speaking.main) });
        choices.append(button);
      }
    }

    // 3. Pick SEVERAL answers: tap to tick [x] / untick [ ], then "listo"
    if (step.type === "many") {
      const chosen = [];
      for (const option of list) {
        const [name, hint] = both(option);
        const button = make("button", "", `[ ] ${name}`, hint);
        if (before && before.value.includes(option.value)) {   // back here? your old ticks are still there
          chosen.push(option);
          setText(button, `[x] ${name}`, hint);
          button.classList.add("chosen");
        }
        button.onclick = () => {
          const i = chosen.indexOf(option);
          if (i === -1) chosen.push(option); else chosen.splice(i, 1);
          setText(button, `${i === -1 ? "[x]" : "[ ]"} ${name}`, hint);
          button.classList.toggle("chosen", i === -1);
        };
        choices.append(button);
      }
      const ready = make("button", "ready", ...tr("interview.ready"));
      ready.onclick = () => answerWith({
        value: chosen.map(option => option.value),
        text: chosen.length ? chosen.map(option => pick(option, speaking.main)).join(", ") : t("interview.none"),
      });
      choices.append(ready);
    }

    // languages that are coming soon: one quiet line, not more buttons
    const soon = comingSoon(step);
    if (soon.length) {
      choices.append(make("p", "caption soon", ...tr("interview.soon", language => ({ list: soon.map(c => languageName(c, language)).join(" · ") }))));
    }
    choices.scrollIntoView({ block: "end", behavior: "smooth" });   // keep the answers on screen
  });
}

// "No conozco «Dog»": two buttons, keep it or fix it
function confirmPlace(text, finish) {
  const kept = [...choices.children].filter(el => !el.classList.contains("warning"));   // ← atrás, saltar: keep them for later
  chatCompose.classList.add("hidden");
  choices.innerHTML = "";
  choices.append(make("p", "caption soon", ...tr("place.unknown", { place: text })));
  const yes = make("button", "", ...tr("place.yes"));
  yes.onclick = () => finish(text);
  const fix = make("button", "", ...tr("place.fix"));
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
    say("profe", ...profeSays(m));
  }
  const reply = await waitForAnswer(step);
  choices.innerHTML = "";
  if (reply.back) throw BACK;   // jump out of the interview... and start it again, one answer shorter
  answerLog.push(reply);
  say("you", reply.text);
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
  setLanguages(draft);   // before your first answer: the phone's language
  answerLog = [];
  replay = [...savedAnswers];
  chat.innerHTML = "";
  show("interview");

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
        say("profe", ...profeSays(m));
      }
      for (const [main, hint] of profileLines(draft)) say("profile-line", main, hint);
      if (await ask(step, step.after) === "again") return runInterview([]);   // start again, from zero
      continue;
    }

    // only one language to learn (Spanish, for now)? Then there's nothing to ask
    const onlyOne = step.options === "teachable" && optionsFor(step).length <= 1;
    const value = onlyOne ? Object.keys(interview.languages).find(c => interview.languages[c].teach) : await ask(step);
    draft[step.saveAs] = value;
    if (step.id === "native") draft.languages[value] = "native";
    setLanguages(draft);   // Profe switches language as soon as you choose (your language, then the one you learn)
  }

  // Done: save the profile on this device and open the app
  const before = profile || {};
  profile = { ...draft, notes: before.notes || [], created: before.created || day(), updated: new Date().toISOString() };
  const sameLanguage = before.learning === profile.learning;
  if (before.placement && sameLanguage) {   // you already took the test: its result counts more than a guess
    profile.placement = before.placement;
    profile.level = before.placement.level;
  }
  if (before.learning && !sameLanguage) {   // another language = a new map, from the start
    map = { done: {} };
    save("map", map);
  }
  save("profile", profile);
  setLanguages(profile);
  await loadCourse();   // the map, the test and the cards for YOUR language and level
  showName();
  if (plan && plan.basic) plan = null;   // the simple plan will be made again, with your new name
  buildQueue();
  nextCard();
  // "nada, empiezo de cero" needs no test. Everyone else: check the level they chose.
  if (placementTest && !profile.placement && profile.level !== "pre-A1") startPlacement();
  else show("today");
}

// The profile as short lines [main, hint]: at the end of the interview and in ⚙ "tu ficha"
function optionLabel(stepId, value, language) {
  if (value === "native") return phrase(language, "profile.native");
  const step = interview.steps.find(s => s.id === stepId);
  const option = Array.isArray(step.options) && step.options.find(o => o.value === value);
  return option ? pick(option, language) : String(value);
}

function profileLines(p) {
  const list = (stepId, values, language) => (values || []).map(v => optionLabel(stepId, v, language)).join(" · ") || "—";
  const spoken = language => Object.entries(p.languages || {})
    .map(([code, level]) => `${languageName(code, language)} (${optionLabel("levels", level, language)})`).join(" · ") || "—";
  return [
    tr("profile.name", { name: p.name }),
    tr("profile.speaks", language => ({ list: spoken(language) })),
    tr("profile.learning", language => ({ language: languageName(p.learning, language), level: p.level })),
    tr("profile.hints", language => ({ language: p.hints === "none" ? phrase(language, "profile.nohints") : languageName(p.hints, language) })),
    tr("profile.reasons", language => ({ list: list("reasons", p.reasons, language) })),
    tr("profile.lives", language => ({ city: p.city || "—", school: phrase(language, p.school ? "school.yes" : "school.no") })),
    tr("profile.likes", language => ({ list: list("interests", p.interests, language) })),
    tr("profile.time", language => ({ minutes: optionLabel("minutes", p.minutes, language) })),
    ...(p.placement ? [tr(p.placement.passed ? "profile.testPassed" : "profile.test", p.placement)] : []),
    ...(p.notes || []).map(note => [`✎ ${note}`, ""]),   // Profe's notes about you (Profe writes them in English)
  ];
}

// ⚙ → "tu ficha": what Profe knows about you, + meet Profe again
function drawProfile() {
  const box = $("#profile");
  box.innerHTML = "";
  if (!interview) return;   // offline and the questions never loaded: nothing to show
  if (profile) {
    for (const [main, hint] of profileLines(profile)) box.append(make("p", "message profile-line", main, hint));
  } else {
    box.append(make("p", "empty", ...tr("profile.empty")));
  }
  const again = make("button", "link", ...tr(profile ? "profile.again" : "profile.meet"));
  again.onclick = () => meetProfe();
  box.append(again);
  if (profile && placementTest) {
    const test = make("button", "link", ...tr(profile.placement ? "test.again" : "test.take"));
    test.onclick = startPlacement;
    box.append(test);
  }
}


// ---------- 15. Profe's map (the curriculum) ----------
// profe/curriculum/<language>.json: the CEFR levels A1 → C2 and what to learn at each one, in order.
// The map is the same for every learner. YOUR position on it is saved only on this device ("map").
let curriculum = null;
let map = loadSaved("map") || { done: {} };   // done: { "A1.0.1": "2026-10-10", ... }

// Every step of the map, in order: a lesson, or a whole module while its lessons aren't written yet
function mapSteps() {
  const list = [];
  for (const level of curriculum.levels) {
    for (const module of level.modules) {
      if (module.lessons) {
        for (const lesson of module.lessons) list.push({ ...lesson, level: level.id, moduleId: module.id });
      } else {
        list.push({ ...module, level: level.id, moduleId: module.id });
      }
    }
  }
  return list;
}

// Where you start: your level from the interview ("pre-A1" starts at A1, lesson 0).
// The placement test will make it precise (it will set map.start).
function startLevel() {
  const level = map.start || (profile && profile.level);
  return curriculum.levels.some(l => l.id === level) ? level : "A1";
}

// Your current step = the first one, from your start level on, that isn't done yet
function currentStep() {
  const all = mapSteps();
  const from = all.findIndex(s => s.level === startLevel());
  return all.slice(from).find(s => !map.done[s.id]) || null;
}

// Profe marks a step done, after you've shown you can do it
function markDone(id) {
  if (!mapSteps().some(s => s.id === id) || map.done[id]) return false;
  map.done[id] = day();
  save("map", map);
  return true;
}

// "Buy fruit at a market in {city}" → "Buy fruit at a market in Valencia"
function fillCity(text) {
  return (text || "").replace(/\{city\}/g, (profile && profile.city) || "your city");
}

// A step's name for [main, hint]: its title in the language you learn, and what you'll be able to do as the hint
function stepTitle(step) {
  return language => ({ title: language === speaking.main ? step.title : step.review ? phrase(language, "map.review") : step.cando });
}

// For Profe (the AI): where you are on the map, and what comes next
function mapContext() {
  if (!curriculum) return "\n# No fixed map for this language yet\nPlan the lessons yourself by CEFR level, starting from the learner's level.";
  const all = mapSteps();
  const step = currentStep();
  const level = curriculum.levels.find(l => l.id === (step ? step.level : startLevel()));
  const describe = s => [
    `${s.id} ${s.title} (${s.en})`,
    s.review ? "review + mini-test of the module" : `can-do: ${s.cando}`,
    s.grammar && `grammar: ${s.grammar}`,
    s.vocab && `vocab: ${s.vocab}`,
    s.mission && `mission: ${fillCity(s.mission)}`,
  ].filter(Boolean).join(" · ");
  const lines = ["", `# Position on the map (${curriculum.framework})`];
  lines.push(`Level ${level.id} "${level.name}" (${level.en}): ${level.summary}`);
  lines.push(`Started at ${startLevel()} · steps done: ${Object.keys(map.done).length}`);
  if (step) {
    const i = all.findIndex(s => s.id === step.id);
    lines.push(`Current step: ${describe(step)}`);
    lines.push(`Next steps: ${all.slice(i + 1, i + 3).map(s => `${s.id} ${s.title}`).join(" · ")}`);
  } else {
    lines.push("The learner has finished the map.");
  }
  return lines.join("\n");
}

// [ progreso ] → "tu mapa": the 6 levels, the modules of your level, and your current step
function drawMap() {
  const box = $("#map");
  box.innerHTML = "";
  $("#map-heading").classList.toggle("hidden", !curriculum);   // no map for this language yet: no title either
  if (!curriculum) return;
  const all = mapSteps();
  const step = currentStep();
  const levelId = step ? step.level : curriculum.levels[curriculum.levels.length - 1].id;

  // A1 ✓ · A2 ● · B1 ○ … (✓ finished · ● you're here · ○ not yet)
  const levels = make("p", "levels");
  for (const level of curriculum.levels) {
    const finished = all.filter(s => s.level === level.id).every(s => map.done[s.id]);
    const mark = level.id === levelId ? "●" : finished ? "✓" : "○";
    levels.append(make("span", level.id === levelId ? "here" : "", `${mark} ${level.id}  `));
  }
  box.append(levels);

  const level = curriculum.levels.find(l => l.id === levelId);
  box.append(make("p", "caption", `${level.id} · ${level.name}`, contentHint(`${level.en}: ${level.summary}`)));
  if (step) {   // your current step, right under the level
    box.append(make("p", "now", ...tr("map.now", stepTitle(step))));
  }

  for (const module of level.modules) {
    const moduleSteps = all.filter(s => s.moduleId === module.id);
    const doneHere = moduleSteps.filter(s => map.done[s.id]).length;
    const width = 10;
    const full = Math.round((doneHere / moduleSteps.length) * width);
    const bar = make("span", "bar");
    bar.append(make("span", "bar-learned", "█".repeat(full)), make("span", "bar-new", "░".repeat(width - full)));
    const row = make("div", "row");
    row.append(make("span", "topic", module.title, contentHint(module.en)), bar, make("span", "count", `${doneHere}/${moduleSteps.length}`));
    box.append(row);
  }

}

// ---------- 16. The placement test ----------
// profe/placement/<language>.json: 8 questions per CEFR level. The kinds of questions:
//   choice = pick the right answer (grammar, vocabulary, reading, "what does the speaker mean?")
//   gap    = the missing word: beginners (A1) tap it, everyone else types it. No translation needed.
//   listen = the phone reads a short dialogue aloud (you can hear it twice), then you pick the answer
//   write  = translate a sentence (the older kind of writing question)
// The level you CHOSE in the interview is a guess. The test checks it:
//   start at your level → pass (60% right)? go up one level, and again... → fail? that's the level to study.
//   fail the first level? go down, until you pass one.
// No AI needed: the code scores it. It can't hear you, so it doesn't measure speaking.
let placementTest = null;
const ptProgress = $("#pt-progress");
const ptText = $("#pt-text");
const ptQuestion = $("#pt-question");
const ptCompose = $("#pt-compose");
const ptInput = $("#pt-input");
const ptSend = $("#pt-send");
const ptOptions = $("#pt-options");
const SKILLS = ["grammar", "vocabulary", "reading", "meaning", "listening", "writing"];   // their names: lang/*.json → "skill.grammar"...

// A new order every time: [a, b, c] → [c, a, b]
function shuffle(list) {
  return list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(pair => pair[1]);
}

// Is what you typed one of the right answers? Accents, ¿¡ and one wrong letter are forgiven.
function isRightAnswer(written, answers) {
  const simple = t => stripAccents(normalize(t));
  const w = simple(written);
  return answers.some(a => simple(a) === w || (w.length >= 8 && editDistance(simple(a), w) <= 1));
}

// The sentence to translate, in a language you know: your hint language, the one you chose at the start, your native one...
function promptFor(item) {
  const order = [speaking.hint, profile && profile.ui, profile && profile.native, "en", "es"];
  const code = order.find(c => c && c !== learning() && item[c]);
  return code ? item[code] : "";
}

// ---- Listening: the phone's own voice reads the text aloud (no internet, no cost) ----
const VOICES = { es: "es-ES", en: "en-GB" };

function canSpeak() {
  return "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

if (canSpeak()) speechSynthesis.getVoices();   // ask for the list of voices early: some phones load it slowly

let utterance = null;   // what the voice is saying now (kept here: some phones forget it otherwise and stay silent)

// Read a text aloud. onSilent runs if the voice never started (so the app can give the "listen" back).
// Phones are picky here:
//   - stopping the voice and starting it again in the same instant makes an iPhone say nothing,
//     so we only stop it when it's really talking, and then wait a moment
//   - naming the voice (not only the language) works on more phones
function speak(text, onSilent) {
  const start = () => {
    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = VOICES[learning()] || learning();
    const voices = speechSynthesis.getVoices();
    const code = v => v.lang.replace("_", "-").toLowerCase();
    const mine = voices.filter(v => code(v).startsWith(learning()));   // the voices for the language you learn
    // the best one first: the phone's standard Spanish voice (Mónica), then one from Spain, then any
    const voice = mine.find(v => /m[oó]nica/i.test(v.name)) || mine.find(v => code(v) === utterance.lang.toLowerCase()) || mine[0];
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;   // a little slower than normal speech
    let started = false;
    utterance.onstart = () => { started = true; };
    speechSynthesis.speak(utterance);
    speechSynthesis.resume();   // some phones start "paused"
    setTimeout(() => { if (!started && onSilent) onSilent(); }, 2500);
  };
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    setTimeout(start, 250);
  } else {
    start();
  }
}

// Under a "listen" button, after the first tap: what to check if you hear nothing
function soundTip(button) {
  if (ptOptions.querySelector(".sound-tip")) return;
  button.after(make("p", "caption soon sound-tip", ...tr("pt.noSound")));
}

// Show one question and WAIT for the answer. Gives back true (right) or false (wrong / "no lo sé").
// tap = true: a gap question shows answers to tap, not a box to type in (for beginners)
function askItem(item, tap) {
  ptOptions.innerHTML = "";
  ptText.classList.toggle("hidden", !item.text);
  ptText.textContent = item.text || "";
  ptCompose.classList.add("hidden");

  return new Promise(answerWith => {
    const typed = answers => {   // a box to type in
      ptCompose.classList.remove("hidden");
      ptInput.value = "";
      ptInput.focus();
      const send = () => {
        if (!ptInput.value.trim()) return;
        ptSend.onclick = ptInput.onkeydown = null;
        answerWith(isRightAnswer(ptInput.value, answers));
      };
      ptSend.onclick = send;
      ptInput.onkeydown = event => { if (event.key === "Enter") send(); };
    };
    const tapped = (right, wrong) => {   // answers to tap, in a new order every time
      for (const option of shuffle([right, ...wrong])) {
        const button = make("button", "", option);
        button.onclick = () => answerWith(option === right);
        ptOptions.append(button);
      }
    };

    if (item.type === "write") {
      // the sentence to translate, in your language · under it: "write it in Spanish", also in your language
      setText(ptQuestion, promptFor(item), own("writing.label", language => ({ in: phrase(language, "in." + learning()) })));
      typed(item.answers);
    } else if (item.type === "gap") {
      const canTap = tap && item.wrong;
      setText(ptQuestion, item.q, own(canTap ? "pt.gapTap" : "pt.gap"));
      if (canTap) tapped(item.answers[0], item.wrong); else typed(item.answers);
    } else if (item.type === "order") {
      // tap the words in the right order. Above: the sentence in your language (if the lesson has it)
      setText(ptQuestion, promptFor(item) || t("lesson.order"), own("lesson.order"));
      const built = make("p", "built", "…");
      const chosen = [];
      const words = shuffle(item.answer.split(" ")).map(word => {
        const button = make("button", "word", word);
        button.onclick = () => {
          chosen.push(word);
          button.disabled = true;
          built.textContent = chosen.join(" ");
          if (chosen.length === words.length) answerWith(chosen.join(" ") === item.answer);
        };
        return button;
      });
      const clear = make("button", "word clear", own("lesson.clear"));
      clear.onclick = () => {
        chosen.length = 0;
        built.textContent = "…";
        for (const button of words) button.disabled = false;
      };
      ptOptions.append(built, ...words, clear);
    } else if (item.type === "listen") {
      let left = 2;   // you can hear it twice
      const listen = make("button", "ready", `${t("pt.listen")} (${left})`, speaking.hint ? phrase(speaking.hint, "pt.listen") : "");
      const showLeft = () => {
        listen.firstChild.textContent = `${t("pt.listen")} (${left})`;
        listen.disabled = left === 0;
      };
      listen.onclick = () => {
        left--;
        showLeft();
        speak(item.audio, () => {   // the voice never started: that listen doesn't count
          left++;
          showLeft();
        });
        soundTip(listen);
      };
      ptOptions.append(listen);
      setText(ptQuestion, item.q, item.hint ? promptFor(item.hint) : "");
      tapped(item.answer, item.wrong);
    } else {
      setText(ptQuestion, item.q, item.hint ? promptFor(item.hint) : "");
      tapped(item.answer, item.wrong);
    }
    // an honest "I don't know" is better than a lucky guess: it makes your level more accurate
    const skip = make("button", "back", ...tr("pt.idk"));
    skip.onclick = () => {
      ptSend.onclick = ptInput.onkeydown = null;
      answerWith(false);
    };
    ptOptions.append(skip);
  }).finally(() => {
    if (canSpeak()) speechSynthesis.cancel();   // answered: stop the voice
  });
}

// One level. Stops early when you can't pass any more (kinder for beginners).
// Gives back { right, passed }. To pass you need 60% right (or the test's own "pass" number).
async function testLevel(level, skills) {
  const items = level.items.filter(item => item.type !== "listen" || canSpeak());   // no voice on this phone: no listening questions
  const needed = placementTest.passRatio ? Math.ceil(items.length * placementTest.passRatio) : placementTest.pass;
  let right = 0;
  let wrong = 0;
  for (const [i, item] of items.entries()) {
    setText(ptProgress, ...tr("pt.progress", { level: level.id, n: i + 1, total: items.length }));
    const ok = await askItem(item, level.id === "A1");
    if (ok) right++; else wrong++;
    const s = skills[item.skill] = skills[item.skill] || {};
    s[level.id] = s[level.id] || { right: 0, total: 0 };
    s[level.id].total++;
    if (ok) s[level.id].right++;
    if (wrong > items.length - needed) break;   // too many wrong to pass: stop this level
  }
  return { right, passed: right >= needed };
}

// ---- Lessons without AI ----
// profe/lessons/<language>.json: for a step of the map, a written lesson the app can teach alone:
//   phrases  = new sentences to read and hear (with their meaning in your language)
//   note     = the key idea, explained in your language
//   practice = questions the app checks itself (the same kinds as the test, + "order")
// Get 70% right and the step is done on your map. No AI, no internet needed.
const LESSON_PASS = 0.7;

function hasLesson(step) {
  return Boolean(lessons && step && lessons[step.id]);
}

// Show some buttons and WAIT for a tap. Gives back the key of the tapped one.
function waitForTap(buttons) {
  return new Promise(choose => {
    for (const [key, main, hint, className] of buttons) {
      const button = make("button", className || "", main, hint);
      button.onclick = () => choose(key);
      ptOptions.append(button);
    }
  });
}

async function startLesson(step) {
  const lesson = lessons[step.id];
  const total = lesson.phrases.length + (lesson.note ? 1 : 0) + lesson.practice.length;
  let n = 0;
  const nextScreen = () => {
    setText(ptProgress, ...tr("lesson.progress", { title: step.title, n: ++n, total }));
    ptText.classList.add("hidden");
    ptCompose.classList.add("hidden");
    ptOptions.innerHTML = "";
  };
  const next = ["next", ...tr("writing.next"), "ready"];
  const exit = ["exit", ...tr("lesson.exit"), "back"];
  show("placement");   // the same calm screen as the test: one thing at a time

  // 1. the new sentences: read, listen, next
  for (const sentence of lesson.phrases) {
    nextScreen();
    setText(ptQuestion, sentence.t, sentence.all || promptFor(sentence));   // all = the same for everyone (numbers)
    if (canSpeak()) {
      const listen = make("button", "", ...tr("pt.listen"));
      listen.onclick = () => {
        speak(sentence.t);
        soundTip(listen);
      };
      ptOptions.append(listen);
    }
    if (await waitForTap([next, exit]) === "exit") return show("today");
  }

  // 2. the key idea, in your language
  if (lesson.note) {
    nextScreen();
    setText(ptQuestion, ...tr("lesson.tip"));
    ptText.textContent = promptFor(lesson.note) || lesson.note[learning()] || "";
    ptText.classList.remove("hidden");
    if (await waitForTap([next, exit]) === "exit") return show("today");
  }

  // 3. practice: the app checks each answer and shows the right one
  let right = 0;
  for (const item of lesson.practice) {
    nextScreen();
    const ok = await askItem(item, true);
    if (ok) right++;
    ptOptions.innerHTML = "";
    ptCompose.classList.add("hidden");
    const answer = item.answer || item.answers[0];
    ptOptions.append(make("p", ok ? "now" : "caption warning", ...tr(ok ? "lesson.right" : "lesson.wrong", { answer })));
    if (await waitForTap([next, exit]) === "exit") return show("today");
  }

  // 4. the result
  const passed = right >= Math.ceil(lesson.practice.length * LESSON_PASS);
  if (passed) markDone(step.id);
  nextScreen();
  setText(ptProgress, ...tr("lesson.progress", { title: step.title, n: total, total }));
  setText(ptQuestion, ...tr(passed ? "lesson.done" : "lesson.retry", { right, total: lesson.practice.length }));
  const home = ["home", ...tr("nav.today").map(text => text && "→ " + text), passed ? "ready" : ""];
  const again = ["again", ...tr("lesson.again"), passed ? "" : "ready"];
  if (await waitForTap(passed ? [home, again] : [again, home]) === "again") return startLesson(step);
  show("today");
}

// The whole test. Result: the level to STUDY (the first one you didn't pass).
async function runPlacement() {
  const levels = placementTest.levels;
  const skills = {};    // { grammar: { A1: { right: 2, total: 2 }, ... }, ... }
  const scores = {};    // { A1: 5, A2: 2 }
  const guess = map.start || (profile && profile.level);   // where to begin: your last result, or your own guess
  let i = guess === "C2" ? levels.length - 1 : Math.max(0, levels.findIndex(l => l.id === guess));
  let direction = null;
  let placed = null;

  while (placed === null) {
    const { right, passed } = await testLevel(levels[i], skills);
    scores[levels[i].id] = right;
    if (passed) {                                      // passed this level
      if (direction === "down") placed = levels[i + 1].id;       // we came down from a failed one
      else if (i === levels.length - 1) placed = "C2";            // passed the last level in the test
      else { direction = "up"; i++; }
    } else {                                           // didn't pass
      if (direction === "up" || i === 0) placed = levels[i].id;
      else { direction = "down"; i--; }
    }
  }

  // per skill: the highest level where you got at least half right
  const order = levels.map(l => l.id);
  const skillLevels = {};
  for (const skill of SKILLS) {
    if (!skills[skill]) continue;   // this skill wasn't in the test
    const passed = order.filter(id => skills[skill] && skills[skill][id] && skills[skill][id].right * 2 >= skills[skill][id].total);
    skillLevels[skill] = passed.length ? passed[passed.length - 1] : null;
  }
  const beginner = placed === "A1" && scores.A1 <= 1;   // (almost) nothing right at A1 = starting from zero
  const all = [...order, "C2"];
  const passed = all[all.indexOf(placed) - 1] || null;   // the level below the one you'll study
  return { date: day(), level: beginner ? "pre-A1" : placed, start: placed, passed, scores, skills: skillLevels };
}

// Start the test (from the interview, the Today task, or ⚙)
async function startPlacement() {
  if (!placementTest || !profile) return;
  show("placement");
  ptText.classList.add("hidden");
  ptCompose.classList.add("hidden");
  setText(ptProgress, ...tr("pt.title"));
  setText(ptQuestion, ...tr("pt.intro"));
  ptOptions.innerHTML = "";
  ptOptions.append(make("p", "caption soon", ...tr("pt.rules", { idk: t("pt.idk") })));
  const go = make("button", "", ...tr("pt.start"));
  const later = make("button", "", ...tr("pt.later"));
  ptOptions.append(go, later);
  const answer = await new Promise(choose => {
    go.onclick = () => choose(true);
    later.onclick = () => choose(false);
  });
  if (!answer) {
    show("today");
    return;
  }

  const result = await runPlacement();
  profile.placement = result;
  profile.level = result.level;
  profile.updated = new Date().toISOString();
  save("profile", profile);
  map.start = result.start;
  save("map", map);
  await loadCourse();   // your cards now start at your real level
  showPlacementResult(result);
}

function showPlacementResult(result) {
  ptText.classList.add("hidden");
  ptCompose.classList.add("hidden");
  ptOptions.innerHTML = "";
  setText(ptProgress, ...tr("pt.result"));
  const level = curriculum && curriculum.levels.find(l => l.id === result.start);
  // "superado" = the level you passed · "ahora estudias" = the level you work on next
  setText(ptQuestion, ...tr("pt.study", language => ({ level: result.start + (level ? " · " + (language === speaking.main ? level.name : level.en) : "") })));
  ptOptions.append(make("p", "now", ...tr(result.passed ? "pt.passed" : "pt.zero", { level: result.passed })));
  for (const [main, hint] of placementLines(result)) ptOptions.append(make("p", "message profile-line", main, hint));
  const step = curriculum && currentStep();
  if (step) ptOptions.append(make("p", "now", ...tr("pt.startAt", stepTitle(step))));
  ptOptions.append(make("p", "caption soon", ...tr("pt.estimate")));
  const go = make("button", "ready", ...tr("go"));
  go.onclick = () => {
    buildQueue();
    nextCard();
    show("today");
  };
  ptOptions.append(go);
}

// "gramática: A2" … as [main, hint] lines, for the result screen
function placementLines(result) {
  return SKILLS.filter(skill => skill in result.skills).map(skill => {
    const line = language => `${phrase(language, "skill." + skill)}: ${result.skills[skill] || phrase(language, "pt.below")}`;
    return [line(speaking.main), speaking.hint ? line(speaking.hint) : ""];
  });
}

// For Profe (the AI)
function placementContext() {
  if (!placementTest) return "\nPlacement test: this language has none in the app yet. Assess the level in conversation (the level above is the learner's own guess).";
  const p = profile && profile.placement;
  if (!p) return "\nPlacement test: not taken yet (the level above is the learner's own guess).";
  const skills = SKILLS.filter(s => s in p.skills).map(s => `${s} ${p.skills[s] || "below A1"}`).join(", ");
  const missing = "listening" in p.skills ? "Speaking was" : "Listening and speaking were";
  return `\nPlacement test (${p.date}): passed ${p.passed || "nothing yet"}, so the level to study is ${p.start}; highest level passed per skill: ${skills}. ${missing} not measured: assess in conversation.`;
}

// ---------- 17. Profe with AI (the chat) ----------
// Profe's brain is an AI model. The app has no server: your phone talks DIRECTLY to the
// AI provider you choose, with YOUR API key. The key is saved only on this device
// (localStorage "ai"), it's never in a backup, and it's only sent to that provider.
//
// What the AI gets with every message:
//   1. profe/core.md: how Profe teaches (the Núcleo, the same for everyone)
//   2. your profile + Profe's notes about you + a snapshot of your cards (what you know today)
//   3. the last messages of your conversation
// So every Profe is the same teacher, and every Profe knows a different learner.

// The providers Profe can use. Most providers use OpenAI's request format, so "custom" covers many more.
const AI_PROVIDERS = {
  anthropic: { name: "Anthropic (Claude)", model: "claude-opus-5-5", keys: "console.anthropic.com" },
  openai: { name: "OpenAI", url: "https://api.openai.com/v1", model: "", keys: "platform.openai.com" },
  gemini: { name: "Google Gemini", model: "", keys: "aistudio.google.com" },
  openrouter: { name: "OpenRouter", nameKey: "ai.openrouter", url: "https://openrouter.ai/api/v1", model: "", keys: "openrouter.ai" },
  custom: { name: "Other", nameKey: "ai.custom", url: "", model: "", keys: "" },
};
// A provider's name on the screen (two of them have a few words to translate)
function providerName(id) {
  const provider = AI_PROVIDERS[id];
  return provider.nameKey ? own(provider.nameKey) : provider.name;
}

// An error the learner can read: .message in the main language, .hint in their own
function readableError(key, values) {
  const error = new Error(t(key, values));
  error.hint = tr(key, values)[1];
  return error;
}

const BUSY_CODES = [500, 502, 503, 529];   // "our computers are overloaded, try again"
const BUSY_WAITS = [2000];                 // wait 2 s and try once more, before trying a backup model
const BACKUP_KINDS = { gemini: /flash/, anthropic: /sonnet|haiku/ };   // quick models that make good backups
const NOT_FOR_CHAT = /preview|exp|thinking|image|tts|live|audio|embedding/;
const TALK_MEMORY = 20;   // how many recent messages the AI sees (more = better memory, more cost)

let ai = loadSaved("ai");            // { provider, key, model, url }
let talk = loadSaved("talk") || [];  // the conversation: [{ role: "user" | "assistant", content }]
let profeCore = null;                // the text of profe/core.md
let waiting = false;                 // true while Profe is "typing"

const talkLog = $("#talk");
const talkInput = $("#talk-input");
const talkSend = $("#talk-send");

// ---- Talking to the AI provider ----
// Claude options: "effort" (how hard the model thinks) and an automatic fallback model
// if the first one declines. Only the models that support them get them.
function claudeOptions(model, body, headers) {
  if (/^claude-(opus|sonnet|haiku|fable)-5/.test(model)) body.output_config = { effort: "low" };   // chat: quick answers
  if (["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"].includes(model)) {
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    body.fallbacks = "default";
  }
}

// Send the conversation, get Profe's answer as text. Each provider has its own format.
// once = true: one try only (used for the backup models)
async function askModel(system, messages, model, once) {
  const { provider, key } = ai;
  let url, headers, body, read;

  if (provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      // Anthropic's official switch for calling the API from a web page.
      // "dangerous" because the key lives in the browser: fine here, it's the user's own key on their own phone.
      "anthropic-dangerous-direct-browser-access": "true",
    };
    body = { model, max_tokens: 16000, system, messages };
    claudeOptions(model, body, headers);
    read = data => {
      if (data.stop_reason === "refusal") throw readableError("ai.refusal");
      return data.content.filter(block => block.type === "text").map(block => block.text).join("");
    };
  } else if (provider === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers = { "content-type": "application/json", "x-goog-api-key": key };
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    };
    read = data => data.candidates[0].content.parts.map(part => part.text || "").join("");
  } else {   // openai, openrouter, custom: the OpenAI format
    url = (ai.url || AI_PROVIDERS[provider].url).replace(/\/+$/, "") + "/chat/completions";
    headers = { "content-type": "application/json", authorization: `Bearer ${key}` };
    body = { model, messages: [{ role: "system", content: system }, ...messages] };
    read = data => data.choices[0].message.content;
  }

  // "Busy" answers (500, 502, 503, 529) mean the provider's computers are overloaded: nothing is wrong
  // with your key or your message. They usually pass in seconds, so wait a little and ask again.
  let response;
  let data;
  for (const wait of once ? [null] : [...BUSY_WAITS, null]) {
    try {
      response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (error) {
      throw readableError("ai.offline");
    }
    data = await response.json().catch(() => ({}));
    if (!BUSY_CODES.includes(response.status) || wait === null) break;   // answered, or no tries left
    await pause(wait);
  }
  if (!response.ok) {
    const detail = (data.error && (data.error.message || data.error)) || response.statusText;
    if (response.status === 401 || response.status === 403) throw readableError("ai.badKey", { detail });
    if (response.status === 429) throw readableError("ai.limit", { detail });
    if (BUSY_CODES.includes(response.status)) {
      const error = readableError("ai.busy", { model });
      error.busy = true;   // askAI reads this: time to try a backup model
      throw error;
    }
    throw readableError("ai.error", { status: response.status, detail });
  }
  return read(data);
}

// Ask YOUR model. If it's overloaded, quietly try up to 2 other models your key can use.
let answeredBy = null;   // the model that gave the last answer (it may be a backup one)

async function askAI(system, messages) {
  answeredBy = ai.model;
  try {
    return await askModel(system, messages, ai.model);
  } catch (error) {
    if (!error.busy) throw error;
    for (const model of await backupModels()) {
      try {
        const answer = await askModel(system, messages, model, true);
        answeredBy = model;
        return answer;
      } catch (alsoFailed) {
        // this one is busy too (or your key can't use it): try the next
      }
    }
    throw error;   // nobody answered: show "the AI is overloaded"
  }
}

async function backupModels() {
  const kind = BACKUP_KINDS[ai.provider];
  if (!kind) return [];
  try {
    const models = await listModels(ai.provider, ai.key, ai.url);
    return models.map(m => m.id).filter(id => id !== ai.model && kind.test(id) && !NOT_FOR_CHAT.test(id)).slice(0, 2);
  } catch (error) {
    return [];
  }
}

function aiReady() {
  return Boolean(ai && ai.key && ai.model && (ai.provider !== "custom" || ai.url));
}

// ---- What Profe knows about you (sent with every message) ----
function learnerContext() {
  const lines = [];
  const lang = code => phrase("en", "language." + code);   // Profe's instructions are in English
  if (profile) {
    const spoken = Object.entries(profile.languages || {}).map(([c, level]) => `${lang(c)} (${level})`).join(", ");
    lines.push("# The learner (profile)",
      `Name: ${profile.name}`,
      `Learning: ${lang(profile.learning)}, level ${profile.level}`,
      `Speaks: ${spoken || "unknown"}`,
      `Hint language: ${profile.hints === "none" ? "none (no translations)" : lang(profile.hints)}`,
      `Why: ${(profile.reasons || []).join(", ") || "unknown"}`,
      `Lives in: ${profile.city || "unknown"} · goes to a language school: ${profile.school ? "yes" : "no"}`,
      `Interests: ${(profile.interests || []).join(", ") || "unknown"}`,
      `Time per day: ${profile.minutes} min`);
    if ((profile.notes || []).length) lines.push("Your notes about them:", ...profile.notes.map(n => `- ${n}`));
  } else {
    lines.push("# The learner", "No profile yet: ask them a few questions first.");
  }

  const learned = cards.filter(c => stateOf(c) === "learned").map(c => c.term);
  const seen = cards.filter(c => stateOf(c) === "seen").map(c => c.term);
  const weak = cards.filter(c => progress[c.id] && progress[c.id].wrong > 0 && stateOf(c) !== "learned")
    .sort((x, y) => progress[y.id].wrong - progress[x.id].wrong).slice(0, 10)
    .map(c => `${c.term} (✗${progress[c.id].wrong})`);
  lines.push("", `# Learning snapshot (today is ${day()})`,
    `Cards: ${cards.length} · learned: ${learned.length} · seen, not learned yet: ${seen.length} · still to review today: ${leftToday()}`,
    `Learned words: ${learned.slice(0, 300).join(", ") || "none yet"}`,
    `Seen words: ${seen.slice(0, 200).join(", ") || "none yet"}`,
    `Weak words: ${weak.join(", ") || "none yet"}`);
  if (plan) lines.push(`Today's plan: ${plan.tasks.map(t => t.en || t.text).join(" · ")}`);
  return lines.join("\n") + placementContext() + mapContext();
}

// ---- The chat screen ----
const ACTION = /^\s*\[\[\s*(card|go|note|done)\s*\|(.*)\]\]\s*$/i;
const GO_TO = { review: "nav.review", progress: "nav.progress", today: "nav.today" };   // "→ repasar"...

// Profe's words, with the translations tucked away.
// Profe writes each translation on its own line, starting with ">":
//   ¿Qué tal tu día?
//   > How was your day?
// The app hides those lines until you tap [traducción]: you try to understand first.
// (That button is written in YOUR language: it's the one thing you must always understand.)
function profeMessage(words) {
  const message = make("div", "message profe");
  let translations = 0;
  for (const line of words.split("\n")) {
    const text = line.trim().replace(/\*\*/g, "");   // some AIs add **bold**: we show plain text
    if (!text) {
      message.append(make("span", "gap"));
    } else if (text.startsWith(">")) {
      message.append(make("span", "translation", text.replace(/^>\s*/, "")));
      translations++;
    } else {
      message.append(make("span", "said", text));
    }
  }
  if (translations) {
    const toggle = make("button", "eye", own("talk.translation"));
    toggle.onclick = () => {
      const open = message.classList.toggle("open");
      toggle.textContent = own(open ? "talk.hide" : "talk.translation");
    };
    message.append(toggle);
  }
  return message;
}

// Show one message. Profe's action lines become buttons.
function showMessage(message) {
  if (message.role === "user") {
    say("you", message.content, undefined, talkLog);
    return;
  }
  const text = [];
  const actions = [];
  for (const line of message.content.split("\n")) {
    const match = line.match(ACTION);
    if (match) actions.push([match[1].toLowerCase(), match[2].split("|").map(part => part.trim())]);
    else text.push(line);
  }
  const words = text.join("\n").trim();
  if (words) talkLog.append(profeMessage(words));

  for (const [type, parts] of actions) {
    if (type === "card" && parts[0]) {
      const [term, translation = "", example = ""] = parts;
      const have = cards.some(c => c.term.toLowerCase() === term.toLowerCase());
      const button = make("button", "offer", have ? `✓ ${term}` : `+ ${term} · ${translation}`);   // + = add to my cards
      button.disabled = have;
      button.onclick = () => {
        addProfeCard(term, translation, example);
        setText(button, `✓ ${term}`);
        button.disabled = true;
      };
      talkLog.append(button);
    }
    if (type === "go" && GO_TO[parts[0]]) {
      const target = parts[0];
      const button = make("button", "offer", ...tr(GO_TO[target]).map(text => text && "→ " + text));
      button.onclick = () => show(target);
      talkLog.append(button);
    }
    if (type === "note" && parts[0]) {
      talkLog.append(make("p", "caption", ...tr("talk.note", { note: parts.join(" | ") })));
    }
    if (type === "done" && curriculum) {
      const step = mapSteps().find(s => s.id === parts[0]);
      if (step) talkLog.append(make("p", "caption done-step", ...tr("talk.done", { title: step.title })));
    }
  }
}

// A card Profe offered → your deck (it comes up in today's review)
function addProfeCard(term, translation, example) {
  const card = { id: `p-${Date.now()}`, term, example, topic: "de Profe" };
  card[speaking.hint || "en"] = translation;   // Profe wrote the meaning in your hint language
  profeCards.push(card);
  save("profeCards", profeCards);
  cards.push(card);
  buildQueue();
  nextCard();
}

// Actions that change your data, done once when Profe's answer arrives:
// notes go into your profile (max 30, the newest win), "done" moves you forward on the map
function applyActions(content) {
  for (const line of content.split("\n")) {
    const match = line.match(ACTION);
    if (!match) continue;
    const type = match[1].toLowerCase();
    const value = match[2].trim();
    if (type === "note" && profile) {
      profile.notes = [...(profile.notes || []), value].slice(-30);
      profile.updated = new Date().toISOString();
      save("profile", profile);
    }
    if (type === "done" && curriculum) markDone(value.split("|")[0].trim());
  }
}

function drawTalk() {
  talkLog.innerHTML = "";
  const name = profile && profile.name ? ", " + profile.name : "";
  say("profe", ...tr("talk.hello", { name }), talkLog);
  if (!aiReady()) {
    say("profe", ...tr("talk.needAi"), talkLog);
    const connect = make("button", "offer", ...tr("talk.connect"));
    connect.onclick = () => {
      show("settings");
      $("#ai-settings").scrollIntoView({ behavior: "smooth" });
    };
    talkLog.append(connect);
  }
  for (const message of talk) showMessage(message);
  talkInput.scrollIntoView({ block: "end" });
}

async function sendToProfe() {
  const text = talkInput.value.trim();
  if (!text || waiting) return;
  if (!aiReady()) {
    drawTalk();
    return;
  }
  talkInput.value = "";
  const message = { role: "user", content: text };
  talk.push(message);
  showMessage(message);

  waiting = true;
  const typing = make("p", "message profe typing", "…");
  talkLog.append(typing);
  typing.scrollIntoView({ block: "end", behavior: "smooth" });

  try {
    // the API needs the conversation to start with you, not with Profe
    let recent = talk.slice(-TALK_MEMORY);
    while (recent.length && recent[0].role !== "user") recent = recent.slice(1);
    const system = `${profeCore || "You are Profe, a friendly language teacher."}\n\n${learnerContext()}`;
    const answer = await askAI(system, recent);
    const reply = { role: "assistant", content: answer };
    talk.push(reply);
    save("talk", talk.slice(-200));
    applyActions(answer);
    typing.remove();
    showMessage(reply);
    if (answeredBy !== ai.model) talkLog.append(make("p", "caption", ...tr("ai.backup", { model: answeredBy })));
  } catch (error) {
    talk.pop();   // not answered: take your message back, so you can send it again
    talkInput.value = text;
    typing.remove();
    talkLog.lastElementChild.remove();
    talkLog.append(make("p", "caption warning", `✗ ${error.message}`, error.hint));
  }
  waiting = false;
}

talkSend.addEventListener("click", sendToProfe);
talkInput.addEventListener("keydown", event => { if (event.key === "Enter") sendToProfe(); });
$("#talk-new").addEventListener("click", () => {
  talk = [];   // Profe's notes about you stay in your profile
  save("talk", talk);
  drawTalk();
});

// ---- [ progreso ] → "la IA de Profe": choose a provider, paste your key, pick a model ----
// Nobody has to know model names: after you paste a key, the app asks the provider
// "which models can this key use?" and shows them as a list.
const aiProvider = $("#ai-provider");
const aiKey = $("#ai-key");
const aiModel = $("#ai-model");             // the list of models
const aiModelOther = $("#ai-model-other");  // "✎ otro": type a model name by hand
const aiUrl = $("#ai-url");
const aiStatus = $("#ai-status");
const OTHER_MODEL = "other";

// What each provider's keys look like (to warn you if the box holds something else)
// (providers change their key formats sometimes: Google keys can start with "AIza" or, newer, "AQ.")
const KEY_STARTS = { anthropic: ["sk-ant-"], openai: ["sk-"], gemini: ["AIza", "AQ."], openrouter: ["sk-or-"] };

// Keys are plain letters, numbers, - and _. Copying from a website or a note can add
// spaces, line breaks or invisible characters: remove them all.
function cleanKey(text) {
  return text.replace(/[^\x21-\x7E]/g, "");
}

// Under the box: "108 caracteres · sk-ant-…9Qk" (so you can compare with your key without showing it)
function checkKey() {
  const key = cleanKey(aiKey.value);
  if (key !== aiKey.value) aiKey.value = key;
  const box = $("#ai-key-check");
  if (!key) {
    setText(box, "");
    return;
  }
  const starts = KEY_STARTS[aiProvider.value];
  const looks = { n: key.length, start: key.slice(0, 7), end: key.slice(-4) };
  if (starts && !starts.some(start => key.startsWith(start))) {   // did the phone fill in something else?
    setText(box, ...tr("key.wrong", language => ({ looks: phrase(language, "key.looks", looks), provider: providerName(aiProvider.value), starts: starts.join(" / ") })));
  } else {
    setText(box, ...tr("key.looks", looks));
  }
}

// "gemini-3.8-flash" → 3.8 (to put the newest models first)
function version(id) {
  const match = id.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

// Ask the provider for its models. Returns [{ id, name, free }]
async function listModels(provider, key, url) {
  const get = async (address, headers) => {
    let response;
    try {
      response = await fetch(address, { headers });
    } catch (error) {
      throw readableError("ai.offline");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = (data.error && (data.error.message || data.error)) || response.statusText;
      if (response.status === 400 || response.status === 401 || response.status === 403) throw readableError("ai.badKey", { detail });
      throw readableError("ai.error", { status: response.status, detail });
    }
    return data;
  };

  if (provider === "anthropic") {
    const data = await get("https://api.anthropic.com/v1/models?limit=100", {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    return data.data.map(m => ({ id: m.id, name: m.display_name || m.id }));
  }
  if (provider === "gemini") {
    const data = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { "x-goog-api-key": key });
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))   // models that can chat
      .filter(m => !/embedding|aqa|imagen|veo|tts|image/i.test(m.name))               // not pictures, video or voice
      .map(m => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name }))
      .sort((a, b) => version(b.id) - version(a.id) || a.id.localeCompare(b.id));   // newest first
  }
  if (provider === "openrouter") {
    const data = await get("https://openrouter.ai/api/v1/models", { authorization: `Bearer ${key}` });
    return data.data
      .filter(m => !m.architecture || !m.architecture.output_modalities || m.architecture.output_modalities.includes("text"))
      .map(m => ({ id: m.id, name: m.name || m.id, free: m.id.endsWith(":free") || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0) }))
      .sort((a, b) => (b.free - a.free) || a.name.localeCompare(b.name));   // free ones first
  }
  // openai + custom: the OpenAI format
  const data = await get((url || AI_PROVIDERS[provider].url).replace(/\/+$/, "") + "/models", { authorization: `Bearer ${key}` });
  return (data.data || [])
    .filter(m => !/embedding|whisper|tts|dall-e|moderation|transcribe|image|audio|realtime|search/i.test(m.id))
    .map(m => ({ id: m.id, name: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Fill the list. Chosen: the model you had, or the provider's default, or the first one.
function fillModels(models, wanted) {
  aiModel.innerHTML = "";
  const free = models.filter(m => m.free);
  const groups = free.length ? [[own("models.free"), free], [own("models.paid"), models.filter(m => !m.free)]] : [["", models]];
  for (const [label, list] of groups) {
    const parent = label ? aiModel.appendChild(Object.assign(document.createElement("optgroup"), { label })) : aiModel;
    for (const m of list) parent.append(new Option(m.name === m.id ? m.id : `${m.name} · ${m.id}`, m.id));
  }
  if (models.length === 0) aiModel.append(new Option(own("models.none"), ""));   // nothing to choose yet
  aiModel.append(new Option(own("models.other"), OTHER_MODEL));
  const ids = models.map(m => m.id);
  // Gemini: the newest stable Flash model (fast, and usually in the free tier)
  const flash = aiProvider.value === "gemini" && ids.find(id => /flash/.test(id) && !/preview|exp|lite|thinking/.test(id));
  const pick = [wanted, AI_PROVIDERS[aiProvider.value].model, flash].find(id => id && ids.includes(id));
  aiModel.value = pick || (models[0] ? models[0].id : "");
  showOtherBox();
}

function showOtherBox() {
  aiModelOther.classList.toggle("hidden", aiModel.value !== OTHER_MODEL);
}

// Paste a key (or change provider) → look up the models
let lookup = 0;   // only the newest lookup counts, if you paste twice quickly
async function findModels() {
  checkKey();
  const key = cleanKey(aiKey.value);
  if (!key) return;
  if (aiProvider.value === "custom" && !aiUrl.value.trim()) {
    setText(aiStatus, ...tr("ai.urlFirst"));
    return;
  }
  const mine = ++lookup;
  setText(aiStatus, ...tr("ai.looking"));
  try {
    const models = await listModels(aiProvider.value, key, aiUrl.value.trim());
    if (mine !== lookup) return;
    fillModels(models, ai && ai.provider === aiProvider.value ? ai.model : "");
    setText(aiStatus, ...tr(models.length ? "ai.found" : "ai.notFound", { n: models.length }));
  } catch (error) {
    if (mine !== lookup) return;
    setText(aiStatus, `✗ ${error.message}`, error.hint);
  }
}

function drawAiSettings() {
  const current = ai || { provider: "anthropic", key: "", model: "", url: "" };
  aiProvider.innerHTML = "";   // the list of providers, in your language
  for (const id in AI_PROVIDERS) aiProvider.append(new Option(providerName(id), id));
  aiProvider.value = current.provider;
  aiKey.value = current.key;
  aiKey.classList.add("masked");
  $("#ai-key-show").textContent = t("ai.show");
  aiUrl.value = current.url || "";
  // until you look up the list again, it shows just the model you chose
  fillModels(current.model ? [{ id: current.model, name: current.model }] : [], current.model);
  updateAiForm();
  checkKey();
  if (aiReady()) setText(aiStatus, ...tr("ai.uses", { provider: providerName(ai.provider), model: ai.model }));
}

// Changing provider: where to get a key, and the URL box only for "otro"
function updateAiForm() {
  const p = AI_PROVIDERS[aiProvider.value];
  $("#ai-url-row").classList.toggle("hidden", aiProvider.value !== "custom");
  setText(aiStatus, ...(p.keys ? tr("ai.getKey", { site: p.keys }) : [""]));
}

aiProvider.addEventListener("change", () => {
  fillModels([], "");
  checkKey();
  updateAiForm();
  findModels();
});
// typing or pasting: wait until you stop for a moment, then check the key and look up the models
let keyTimer = null;
aiKey.addEventListener("input", () => {
  clearTimeout(keyTimer);
  keyTimer = setTimeout(findModels, 700);
});
// [ver] (show) / [ocultar] (hide) the key
$("#ai-key-show").addEventListener("click", () => {
  const hidden = aiKey.classList.toggle("masked");
  $("#ai-key-show").textContent = t(hidden ? "ai.show" : "ai.hide");
});
aiModel.addEventListener("change", showOtherBox);
$("#ai-find-models").addEventListener("click", findModels);

$("#ai-save").addEventListener("click", async () => {
  const model = aiModel.value === OTHER_MODEL ? aiModelOther.value.trim() : aiModel.value;
  ai = { provider: aiProvider.value, key: cleanKey(aiKey.value), model, url: aiUrl.value.trim() };
  save("ai", ai);
  if (!aiReady()) {
    setText(aiStatus, ...tr(!ai.key ? "ai.needKey" : !ai.model ? "ai.needModel" : "ai.needUrl"));
    return;
  }
  setText(aiStatus, ...tr("ai.testing"));
  try {
    await askAI("Reply with one short friendly word.", [{ role: "user", content: t("hello") }]);
    setText(aiStatus, ...tr("ai.connected", { provider: providerName(ai.provider), model: ai.model }));
  } catch (error) {
    setText(aiStatus, `✗ ${error.message}`, error.hint);
  }
});

$("#ai-forget").addEventListener("click", () => {
  ai = null;
  localStorage.removeItem("ai");
  drawAiSettings();
  setText(aiStatus, ...tr("ai.deleted"));
});

// ---------- 18. Offline + updates ----------
// The service worker (sw.js) keeps a copy of the app, so it opens with no internet.
if ("serviceWorker" in navigator) {
  // updateViaCache "none" = always check the real sw.js, never an old saved copy
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
}

$("#version").textContent = `mi-app v${VERSION}`;

// [ ↻ actualizar ]: get the newest files and restart the app
async function update() {
  setText(statusLine, ...tr("update.running"));
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

// ---------- 19. Start the app ----------
// At the very end, so everything above already exists when it runs.
start();
