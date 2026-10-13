// mi-app: Octavia's own little app to learn Spanish with her Profe.
// Plain HTML + CSS + JavaScript, no build tools. Read it top to bottom:
//   1 settings · 2 page elements + state · 3 helpers · 4 saved data (+ old formats)
//   5 loading · 6 today's queue · 7 review cards · 8 writing · 9 more practice · 10 backup
//   11 screens · 12 progress · 13 today · 14 add words · 15 report for Profe · 16 offline · 17 start
// What it does: practise flashcards, add words and sentences you meet, and tell Profe what you did.
// Profe is NOT in the app: Profe lives in Claude. The app and Profe talk through files:
//   Profe → app: your cards + today's plan (the bundle you import)
//   app → Profe: your report (what you practised, your weak words, your new words)
// The code is in English. The text you SEE is Spanish, with a small English hint under it.

// ---------- 1. Settings (change these numbers whenever you like) ----------
const VERSION = "2.1";                      // change it every time you publish
const NEW_PER_DAY = 10;                     // new cards per day
const BOX_DAYS = [0, 0, 1, 3, 7, 14];       // days before a card comes back, by box (1–5)
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

let cards = [];             // all your cards: your deck (from Profe / Anki) + the ones you added yourself
let inbox = [];             // words and sentences YOU added: [{ id, es, en, note, date, sent }]
let log = {};               // what you did each day: { "2026-10-13": { reviews, right, wrong, new, writing } }
let queue = [];             // today's queue (the cards waiting for you)
let current = null;         // the card on the screen now
let writingQueue = [];      // today's writing queue
let freePractice = false;   // free practice = review anything, your boxes don't change
let progress = {};          // what you know: progress[cardId] = { box, right, wrong, due, ... }
let plan = null;            // today's plan (from Profe)
let done = {};              // ticked tasks: { "2026-10-09": ["mission"] }

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

// Same, for a text file (Profe's core.md)
async function loadText(path) {
  try {
    const response = await fetch(path);
    return response.ok ? await response.text() : null;
  } catch (error) {
    return null;
  }
}

// The words you added that have a meaning are cards too (id "m-…")
function myCards() {
  return inbox.filter(item => item.en).map(item => ({ id: item.id, es: item.es, en: item.en, example: item.note || "", topic: "mías" }));
}

// Your deck + your own cards (a word that's already in your deck isn't added twice)
function setCards(deck) {
  const inDeck = new Set(deck.map(c => c.es.toLowerCase()));
  cards = [...deck, ...myCards().filter(c => !inDeck.has(c.es.toLowerCase()))];
}

// Add 1 to today's count of something: countToday("reviews")
function countToday(what) {
  const today = day();
  log[today] = log[today] || {};
  log[today][what] = (log[today][what] || 0) + 1;
  save("log", log);
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
// The app has changed shape a few times, and so have the names of the saved data
// (Spanish names until v1.5; "term" instead of "es" in v1.17–1.23). These functions translate
// old data into today's names, so nothing is lost: not your progress, not old backups, not old files.
// They're safe to run on new data too (nothing to rename = nothing changes).
const OLD_STORAGE_KEYS = { progreso: "progress", hechas: "done", tarjetas: "cards" };
const PROGRESS_NAMES = { bien: "right", mal: "wrong", suena: "familiar", caja: "box", proxima: "due", ultima: "last", primera: "first", escritura: "writing" };
const CARD_NAMES = { ejemplo: "example", tema: "topic" };
const PLAN_NAMES = { fecha: "date", de: "from", nombre: "name", saludo: "greeting", saludo_en: "greeting_en", tareas: "tasks", basico: "basic" };
const TASK_NAMES = { tipo: "type", texto: "text" };
const TASK_TYPES = { tarjetas: "cards", leccion: "lesson", mision: "mission", escuela: "school" };
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
  return old.map(c => {
    const card = renameKeys(c, CARD_NAMES);
    if (card.es === undefined && card.term !== undefined) {   // v1.17–1.23 called the word "term"
      card.es = card.term;
      delete card.term;
    }
    card.en = card.en || "";
    return card;
  });
}

// Cards that Profe-in-the-app gave you (v1.7–1.23, saved as "profeCards") become words in your own list
function migrateOldProfeCards() {
  const oldCards = migrateCards(loadSaved("profeCards") || []);
  if (oldCards.length === 0) return;
  const known = new Set(inbox.map(item => item.id));
  for (const c of oldCards) {
    if (!known.has(c.id)) inbox.push({ id: c.id, es: c.es, en: c.en, note: c.example || "", date: "", sent: "antes" });
  }
  save("inbox", inbox);
  localStorage.removeItem("profeCards");
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
  inbox = loadSaved("inbox") || [];
  log = loadSaved("log") || {};
  migrateOldProfeCards();
  setCards(migrateCards((await loadJson("cards.json")) || loadSaved("cards") || (await loadJson("sample.json")) || []));
  plan = migratePlan((await loadJson("today.json")) || loadSaved("plan"));

  showName();
  buildQueue();
  nextCard();
  drawInbox();
  show("today");
}

// ---------- 6. Today's queue ----------
// A card you added yourself? (their ids start with "m-"; older ones with "p-")
function isMine(c) {
  return /^[mp]-/.test(String(c.id));
}

function isDue(c) {
  return progress[c.id] && (progress[c.id].due || day()) <= day();
}

// Today's queue = cards due for review + a few new ones
function buildQueue() {
  const today = day();
  const reviews = cards.filter(isDue);
  const newToday = Object.values(progress).filter(p => p.first === today).length;
  const mine = cards.filter(c => !progress[c.id] && isMine(c));   // you asked for these: always today
  const newCards = cards.filter(c => !progress[c.id] && !isMine(c)).slice(0, Math.max(0, NEW_PER_DAY - newToday));
  queue = [...reviews, ...mine, ...newCards];
  writingQueue = writingForToday();
}

// How many cards are still waiting for you today (reviews due + new ones left + writing)
function leftToday() {
  const today = day();
  const reviews = cards.filter(isDue).length;
  const newToday = Object.values(progress).filter(p => p.first === today).length;
  const mine = cards.filter(c => !progress[c.id] && isMine(c)).length;
  const unseen = cards.filter(c => !progress[c.id] && !isMine(c)).length;
  return reviews + mine + Math.min(unseen, Math.max(0, NEW_PER_DAY - newToday)) + writingForToday().length;
}

// A card is "learned" when it reaches box 3 (right on 2 different days)
function learnedCount() {
  return cards.filter(c => stateOf(c) === "learned").length;
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
  if (!progress[current.id]) countToday("new");   // the first time you see this card
  const p = progress[current.id] || { right: 0, wrong: 0, box: 1, first: today };
  p.box = p.box || 1;
  p.familiar = p.familiar || 0;
  queue.shift();   // take this card off the front of the queue

  // count the answer (the progress screen and Profe use these numbers)
  if (level === 0) p.wrong++;
  if (level === 1) p.familiar++;
  if (level >= 2) p.right++;

  // ...and count it in today's log (Profe reads it in your report)
  countToday("reviews");
  if (level === 0) countToday("wrong");
  if (level >= 2) countToday("right");

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
  countToday("writing");
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

// Export: put your progress, your own words and your report for Profe in a file.
// Save it in iCloud Drive → mi-app: Profe finds it there the next time you talk.
// On the phone: open the share menu (Save to Files, AirDrop...). Otherwise: download it.
async function exportBackup() {
  const backup = { app: "mi-app", version: 3, date: day(), progress: progress, inbox: inbox, log: log, report: reportText() };
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
      const deck = migrateCards(newCards);
      save("cards", deck);
      save("deckDate", data.date || day());   // when Profe made this deck (shown in ⚙)
      setCards(deck);   // your own words stay
      found.push(`${deck.length} tarjetas`);
    }
    const theirWords = [...(data.inbox || []), ...migrateCards(data.profeCards || []).map(c => ({ id: c.id, es: c.es, en: c.en, note: c.example || "", date: "", sent: "antes" }))];
    if (theirWords.length) {   // your own words from another device: add the ones this device doesn't have
      const known = new Set(inbox.map(item => item.id));
      const added = theirWords.filter(item => !known.has(item.id));
      inbox = [...added, ...inbox];
      save("inbox", inbox);
      setCards(cards.filter(c => !isMine(c)));
      if (added.length) found.push(`${added.length} palabras tuyas`);
    }
    if (data.log) {   // the days this device doesn't know about
      log = { ...data.log, ...log };
      save("log", log);
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
    if (found.length === 0) throw new Error("not a mi-app file");

    showName();
    buildQueue();
    nextCard();
    drawInbox();
    show("today");
    setText(statusLine, `✓ importado: ${found.join(" · ")}`, "imported");
  } catch (error) {
    setText(statusLine, "✗ ese archivo no es de mi-app", "that file is not a mi-app file");
  }
  fileInput.value = "";   // so the same file can be imported again
}

$("#export").addEventListener("click", exportBackup);
fileInput.addEventListener("change", importFile);

// ---------- 11. Screens: today · review · add · progress · ⚙ settings ----------
const screens = {
  today: $("#screen-today"),
  review: $("#screen-review"),
  add: $("#screen-add"),             // your own words and sentences
  progress: $("#screen-progress"),
  settings: $("#screen-settings"),   // ⚙ backups + updates
};
const navButtons = {
  today: $("#nav-today"),
  review: $("#nav-review"),
  add: $("#nav-add"),
  progress: $("#nav-progress"),
  settings: $("#nav-settings"),
};

// Show ONE screen and hide the others. toggle(class, yes/no) adds or removes a class.
function show(name) {
  for (const n in screens) {
    screens[n].classList.toggle("hidden", n !== name);
    navButtons[n].classList.toggle("active", n === name);
  }
  statusLine.classList.toggle("hidden", name === "add" || name === "settings");
  if (name === "progress") drawProgress();
  if (name === "today") drawToday();
  if (name === "add") drawInbox();
  if (name === "settings") drawDeckInfo();
}

// ⚙: how many cards you have and from which day, so you can compare with Anki
function drawDeckInfo() {
  const own = cards.filter(isMine).length;
  const date = loadSaved("deckDate");
  setText($("#deck-info"), `${cards.length - own} tarjetas de Profe${date ? " · del " + date : ""} · ${own} tuyas`,
    "cards from Profe (your Anki deck), from that day · your own");
}

for (const name in navButtons) navButtons[name].addEventListener("click", () => show(name));

// ---------- 12. Progress screen ----------
const report = $("#report");

// English names of the topics (the topic names are Spanish content, from your cards)
const TOPICS_EN = {
  saludos: "greetings", animales: "animals", adjetivos: "adjectives", verbos: "verbs",
  "en clase": "in class", "básicas": "basics", planes: "plans", fiesta: "party",
  "sobre mí": "about me", tiempo: "time", comida: "food", nuevas: "new words", "de Profe": "from Profe", "mías": "my own words",
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
  const writingLine = make("p", "caption", `escritura: ${practised.length} practicadas · ${written} aprendidas`, "writing: practised · learned");
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
}

// ---------- 13. Today screen (the plan comes from Profe: today.json) ----------
const greeting = $("#greeting");
const taskList = $("#tasks");
const planNote = $("#plan-note");

// "> hola, Octavia_": the name comes from Profe's plan
function showName() {
  $("#name").textContent = plan && plan.name ? `, ${plan.name}` : "";
}

function drawToday() {
  taskList.innerHTML = "";   // empty the list, then fill it again
  // no plan from Profe (yet)? Then there's one thing to do: your cards
  const tasks = plan ? plan.tasks : [{ type: "cards", text: "repasa tus tarjetas", en: "review your cards" }];
  const today = day();
  const ticked = done[today] || [];
  if (plan) setText(greeting, plan.greeting, plan.greeting_en);
  else setText(greeting, "¡Hola!", "no plan from Profe yet: import your bundle in ⚙");

  for (const task of tasks) {
    let isDone = ticked.includes(task.type);
    let text = task.text;
    if (task.type === "cards") {   // the app knows this one by itself
      isDone = leftToday() === 0;
      text = `${task.text} (${leftToday()} para hoy)`;
    }
    const li = make("li", isDone ? "done" : "", `${isDone ? "[x]" : "[ ]"} ${text}`, task.en);
    li.addEventListener("click", () => tick(task));
    taskList.append(li);
  }
  if (!plan) {
    planNote.textContent = "";
  } else if (plan.date === today) {
    setText(planNote, `plan de ${plan.from} · hoy`, `plan from ${plan.from} · today`);
  } else {
    setText(planNote, `plan de ${plan.from} · del ${plan.date}`, `plan from ${plan.from} · from ${plan.date}`);
  }
}

// Tap a task: cards → the review; the others tick on / off (you do them with Profe, or out in the street)
function tick(task) {
  const type = task.type;
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

// ---------- 14. Add words: the things you meet in real life ----------
// A word on a sign, a sentence a friend said... write it here before you forget it.
//   - with a meaning: it becomes a flashcard right away
//   - without a meaning: it waits in your list, and goes to Profe in your next report.
//     Profe explains it and puts it in your deck.
const addEs = $("#add-es");
const addEn = $("#add-en");
const addNote = $("#add-note");
const inboxList = $("#inbox");

// ---- Look it up first: do I already have this word? ----
// While you type in "palabra" or "significado", the app searches ALL your cards (your deck + your own words)
// and shows what it finds under the form. So the same boxes work as a small dictionary of what you have:
// type the Spanish to see the meaning, or type the meaning to find the Spanish.
// If the word is already there, you can't add it twice.
const foundBox = $("#found");

// "El Perro", "perro", "pérro" → "perro": so small differences don't hide a word you already have
function simple(text) {
  return stripArticle(stripAccents(normalize(text)));
}

// Everything you have: your cards, and your own words that still wait for a meaning
function everything() {
  const waiting = inbox.filter(item => !item.en).map(item => ({ es: item.es, en: "→ Profe" }));
  return [...cards, ...waiting];
}

// Is this exact word already in your cards? ("sucio / sucia" counts for "sucio" and for "sucia")
function alreadyHave(text) {
  const word = simple(text);
  if (!word) return false;
  return everything().some(c => [c.es, ...c.es.split("/")].some(part => simple(part) === word));
}

function lookUp() {
  const es = simple(addEs.value);
  const en = normalize(addEn.value);
  foundBox.innerHTML = "";
  const duplicate = alreadyHave(addEs.value);
  $("#add-save").disabled = duplicate;
  if (es.length < 2 && en.length < 2) return;   // too short to search
  const matches = everything().filter(c =>
    (es.length >= 2 && simple(c.es).includes(es)) || (en.length >= 2 && normalize(c.en).includes(en)));
  if (duplicate) foundBox.append(make("p", "caption warning", "ya la tienes: no hace falta añadirla", "you already have it: no need to add it"));
  else if (matches.length === 0) foundBox.append(make("p", "caption", "no la tienes: es nueva", "you don't have it: it's new"));
  else foundBox.append(make("p", "caption", "en tus tarjetas:", "in your cards:"));
  for (const c of matches.slice(0, 8)) foundBox.append(make("p", "found-line", c.es, c.en));
  if (matches.length > 8) foundBox.append(make("p", "caption", `… y ${matches.length - 8} más`, "and more: type more letters"));
}

function addWord() {
  const es = addEs.value.trim();
  if (!es) return;   // nothing written: nothing to save
  if (alreadyHave(es)) return;   // you already have it
  inbox.unshift({ id: `m-${Date.now()}`, es, en: addEn.value.trim(), note: addNote.value.trim(), date: day(), sent: null });
  save("inbox", inbox);
  addEs.value = addEn.value = addNote.value = "";
  setCards(cards.filter(c => !isMine(c)));   // your deck + your own cards, again
  buildQueue();
  nextCard();
  drawInbox();
  lookUp();
  addEs.focus();
}

function removeWord(id) {
  inbox = inbox.filter(item => item.id !== id);
  save("inbox", inbox);
  setCards(cards.filter(c => !isMine(c)));
  buildQueue();
  nextCard();
  drawInbox();
}

// Your list, the newest first. "→ Profe" = not in a report yet · "✓ enviada" = Profe has it
function drawInbox() {
  inboxList.innerHTML = "";
  if (inbox.length === 0) {
    inboxList.append(make("p", "empty", "todavía nada", "nothing yet: add the first word you meet today"));
    return;
  }
  for (const item of inbox) {
    const row = make("li");
    const state = item.sent ? "✓ enviada" : "→ Profe";
    row.append(make("span", "word", item.es, [item.en, item.note].filter(Boolean).join(" · ")), make("span", "state", state));
    const remove = make("button", "link", "borrar", "delete");
    remove.onclick = () => removeWord(item.id);
    row.append(remove);
    inboxList.append(row);
  }
}

$("#add-save").addEventListener("click", addWord);
addEs.addEventListener("input", lookUp);
addEn.addEventListener("input", lookUp);
for (const box of [addEs, addEn, addNote]) {
  box.addEventListener("keydown", event => { if (event.key === "Enter") addWord(); });
}

// ---------- 15. The report for Profe ----------
// Everything Profe needs to know about your work in the app, as plain text:
// what you did today and this week, your totals, your weak words, and your new words.
// You share it (or copy it) and paste it into your chat with Profe.
function reportText() {
  const today = day();
  const dayLine = d => {
    const x = log[d] || {};
    return `${x.reviews || 0} repasos (✓${x.right || 0} ✗${x.wrong || 0}) · ${x.new || 0} nuevas · ${x.writing || 0} escritura`;
  };
  const lines = [`mi-app → Profe · ${today}`, "", "HOY", dayLine(today)];
  const ticked = done[today] || [];
  if (plan) lines.push("tareas: " + plan.tasks.map(task => `${task.type === "cards" ? (leftToday() === 0 ? "[x]" : "[ ]") : ticked.includes(task.type) ? "[x]" : "[ ]"} ${task.text}`).join(" · "));

  lines.push("", "ÚLTIMOS 7 DÍAS");
  for (let i = 1; i <= 7; i++) {
    const d = day(-i);
    if (log[d]) lines.push(`${d}: ${dayLine(d)}`);
  }
  if (lines[lines.length - 1] === "ÚLTIMOS 7 DÍAS") lines.push("(nada todavía)");

  const practised = cards.filter(c => progress[c.id] && progress[c.id].writing);
  lines.push("", "TOTAL",
    `tarjetas: ${cards.length} · aprendidas: ${learnedCount()} · vistas: ${cards.filter(c => stateOf(c) !== "new").length} · quedan para hoy: ${leftToday()}`,
    `escritura: ${practised.length} practicadas · ${practised.filter(c => progress[c.id].writing.box >= 3).length} aprendidas`);

  const weak = cards
    .filter(c => progress[c.id] && progress[c.id].wrong > 0 && stateOf(c) !== "learned")
    .sort((x, y) => progress[y.id].wrong - progress[x.id].wrong)
    .slice(0, 10);
  lines.push("", "PUNTOS DÉBILES", weak.length ? weak.map(c => `${c.es} (✗${progress[c.id].wrong})`).join(" · ") : "(ninguno)");

  const fresh = inbox.filter(item => !item.sent);
  lines.push("", "PALABRAS Y FRASES NUEVAS PARA TI");
  if (fresh.length === 0) lines.push("(ninguna)");
  for (const item of fresh) {
    lines.push(`- ${item.es}${item.en ? ` = ${item.en}` : " (no sé qué significa)"}${item.note ? ` · nota: ${item.note}` : ""}`);
  }
  return lines.join("\n");
}

// Share the report (the phone's share menu), or copy it. Then your new words count as "sent".
async function sendReport() {
  const text = reportText();
  const box = $("#report-text");
  box.value = text;   // always shown too, so you can read it and copy it by hand
  box.classList.remove("hidden");
  let how = null;
  try {
    if (navigator.share) {
      await navigator.share({ text });
      how = ["✓ informe enviado", "report shared: paste it in your chat with Profe"];
    } else {
      await navigator.clipboard.writeText(text);
      how = ["✓ informe copiado", "report copied: paste it in your chat with Profe"];
    }
  } catch (error) {
    setText(statusLine, "informe sin enviar: cópialo de la caja", "not shared: copy it from the box below");
    return;
  }
  for (const item of inbox) {
    if (!item.sent) item.sent = day();
  }
  save("inbox", inbox);
  setText(statusLine, ...how);
}

$("#report-send").addEventListener("click", sendReport);

//@@END13
// ---------- 16. Offline + updates ----------
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

// ---------- 17. Start the app ----------
// At the very end, so everything above already exists when it runs.
start();
