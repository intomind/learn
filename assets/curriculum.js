// One book, four levels. The level is set before the page draws, by the
// script in each page's head, and this switch changes it and remembers it
// from page to page. The theme switch does the same for dark and light.
// Every figure on the page is drawn here, by figures.js. What a reader
// writes on the page, predictions, records and results, stays in this
// browser and nowhere else.
import { mount, refresh } from "./figures.js";

const NAMES = { ms: "Middle school", hs: "High school", college: "College", grad: "Graduate" };
const root = document.documentElement;
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private browsing */ } };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

function showLevel() {
  for (const b of document.querySelectorAll(".levels button")) b.setAttribute("aria-pressed", String(b.dataset.level === root.dataset.level));
  for (const el of document.querySelectorAll("[data-level-name]")) el.textContent = NAMES[root.dataset.level];
}
for (const b of document.querySelectorAll(".levels button")) {
  b.addEventListener("click", () => { root.dataset.level = b.dataset.level; store("curriculum-level", b.dataset.level); delete root.dataset.ask; document.querySelector(".ask-level")?.remove(); showLevel(); refresh(); });
}
showLevel();

// A student who arrives with no level, from a link without one and nothing remembered, picks it once.
if (root.dataset.ask) {
  const veil = document.createElement("div");
  veil.className = "ask-level";
  veil.innerHTML = `<div><h2>Which level is your class?</h2><div class="levels">${Object.entries(NAMES).map(([l, n]) => `<button type="button" data-level="${l}">${n}</button>`).join("")}</div></div>`;
  for (const b of veil.querySelectorAll("button")) b.addEventListener("click", () => { root.dataset.level = b.dataset.level; store("curriculum-level", b.dataset.level); delete root.dataset.ask; veil.remove(); showLevel(); refresh(); });
  document.body.append(veil);
}

function showTheme() { for (const b of document.querySelectorAll(".theme")) b.textContent = root.dataset.theme === "light" ? "Dark" : "Light"; }
for (const b of document.querySelectorAll(".theme")) {
  b.addEventListener("click", () => { root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light"; store("curriculum-theme", root.dataset.theme); showTheme(); refresh(); });
}
showTheme();

// Writing on the page. A field keeps its key on the element, and a record sheet's empty cells become fields keyed by row and column.
const page = location.pathname.replace(/\/$/, "") || "home";
const keyOf = (el) => `bci101:${page}:${el.dataset.key}`;
function field(el) {
  el.contentEditable = "plaintext-only";
  if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
  const had = load(keyOf(el));
  if (had) el.textContent = had;
  el.addEventListener("input", () => store(keyOf(el), el.textContent));
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && el.classList.contains("fill")) { e.preventDefault(); el.blur(); } });
  el.addEventListener("paste", (e) => { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); });
}
if (!root.dataset.print) {
  for (const el of document.querySelectorAll(".fill[data-key]")) field(el);
  document.querySelectorAll("table.sheet").forEach((table, n) => {
    const id = table.dataset.sheet ?? `sheet${n}`;
    table.querySelectorAll("tbody tr").forEach((tr, r) => {
      tr.querySelectorAll("td").forEach((td, c) => {
        if (td.textContent.trim() !== "" || td.children.length) return;
        td.dataset.key = `${id}:${r}:${c}`;
        field(td);
      });
    });
    if (table.querySelector("td[data-key]")) {
      const bar = document.createElement("div");
      bar.className = "sheet-bar";
      if (table.dataset.l) bar.dataset.l = table.dataset.l;
      const note = document.createElement("span");
      note.textContent = "Saved in this browser as you type.";
      const keep = document.createElement("button");
      keep.type = "button";
      keep.className = "keep";
      keep.textContent = "Save or print";
      keep.addEventListener("click", () => printWork(table));
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "clear";
      clear.textContent = "Clear";
      clear.addEventListener("click", () => {
        if (!confirm("Clear this record sheet in this browser?")) return;
        for (const td of table.querySelectorAll("td[data-key]")) { td.textContent = ""; store(keyOf(td), ""); }
      });
      bar.append(note, keep, clear);
      table.after(bar);
    }
  });
}

/** A copy of the work on this page, to save as a PDF or print from the browser's print window: the lab, the predictions, and the record sheet as filled in. */
function printWork(table) {
  const visible = (el) => el && el.offsetParent !== null;
  const copy = document.createElement("div");
  const lv = table.closest(".lv");
  copy.className = lv ? `work-copy ${lv.className}` : "work-copy";
  const h1 = [...document.querySelectorAll("h1")].find(visible);
  const eb = h1?.parentElement.querySelector(".eb");
  if (eb) { const p = document.createElement("p"); p.className = "eb"; p.textContent = eb.textContent; copy.append(p); }
  const title = document.createElement("h1");
  title.textContent = h1 ? h1.textContent : document.title;
  copy.append(title);
  for (const ask of [...document.querySelectorAll(".ask")].filter(visible)) copy.append(ask.cloneNode(true));
  copy.append(table.cloneNode(true));
  document.body.append(copy);
  root.dataset.printing = "work";
  const done = () => { copy.remove(); delete root.dataset.printing; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

mount(document);
document.body.dataset.ready = "1";
