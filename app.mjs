import * as pdfjs from "./vendor/build/pdf.mjs";
import { auditTable, pdfLines, parseCsv } from "./audit.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/build/pdf.worker.mjs", import.meta.url).href;
const byId = id => document.getElementById(id);
const pdf = byId("pdf"), csv = byId("csv"), page = byId("page"), header = byId("header");
const message = byId("message"), comparison = byId("comparison");
const frame = byId("pageFrame"), mark = byId("mark"), summary = byId("summary");
const selection = byId("selection");
let data = {}, doc = null, loadingTask = null, revision = 0, selected = null;
let display = { viewport: null, lines: [], csv: null };

function clear() {
  display = { viewport: null, lines: [], csv: null };
  frame.hidden = true;
  mark.hidden = true;
  selected = null;
  comparison.replaceChildren();
  summary.textContent = "";
  selection.textContent = "";
  byId("tablePicker").hidden = true;
}

function describeError(error, token) {
  if (token !== revision) return;
  clear();
  message.textContent = error.message || "The files could not be opened.";
}

async function update({ resetPage = false } = {}) {
  const token = ++revision;
  clear();
  page.disabled = !doc;
  byId("sourceName").textContent = data.pdfName ?? "";
  if (!data.bytes || !data.csv) {
    message.textContent = "Choose both files or open a sample.";
    return;
  }
  message.textContent = "Reading the table...";
  try {
    const parsedCsv = parseCsv(data.csv);
    if (!doc) {
      const task = pdfjs.getDocument({
        data: data.bytes.slice(), cMapUrl: new URL("./vendor/cmaps/", import.meta.url).href,
        cMapPacked: true, standardFontDataUrl: new URL("./vendor/standard_fonts/", import.meta.url).href,
        wasmUrl: new URL("./vendor/wasm/", import.meta.url).href,
        enableXfa: false, isEvalSupported: false,
      });
      const temp = await task.promise;
      if (token !== revision) { await task.destroy(); return; }
      loadingTask = task;
      doc = temp;
    }
    page.disabled = false;
    page.max = doc.numPages;
    if (resetPage) page.value = 1;
    const number = Number(page.value);
    if (!Number.isInteger(number) || number < 1 || number > doc.numPages) {
      message.textContent = "Choose a page from 1 to " + doc.numPages + ".";
      return;
    }
    const currentPage = await doc.getPage(number);
    const viewport = currentPage.getViewport({ scale: 1.4 });
    const content = await currentPage.getTextContent();
    if (token !== revision) return;
    const freshCanvas = document.createElement("canvas");
    freshCanvas.id = "canvas";
    freshCanvas.setAttribute("aria-label", "Rendered original PDF page " + number);
    freshCanvas.width = Math.ceil(viewport.width);
    freshCanvas.height = Math.ceil(viewport.height);
    const canvasContext = freshCanvas.getContext("2d");
    await currentPage.render({ canvas: freshCanvas, canvasContext, viewport }).promise;
    if (token !== revision) return;
    byId("canvas").replaceWith(freshCanvas);
    frame.style.width = viewport.width + "px";
    frame.hidden = false;
    const lines = pdfLines(content.items.filter(item => "transform" in item), viewport);
    display = { viewport, lines, csv: parsedCsv };
    paintResults();
  } catch (error) {
    describeError(error, token);
  }
}

function focusSource(row, year, cell, button) {
  if (selected) selected.removeAttribute("aria-current");
  selected = button;
  button.setAttribute("aria-current", "true");
  selection.textContent = row + " · " + year + " · CSV " + (cell.input || "blank") +
    (cell.pdfText ? " · PDF " + cell.pdfText : "") + (cell.reason ? " · " + cell.reason : "");
  mark.hidden = true;
  if (!cell.source) return;
  const { bounds } = cell.source;
  const { viewport } = display;
  mark.style.left = (bounds.x / viewport.width * 100) + "%";
  mark.style.top = (bounds.y / viewport.height * 100) + "%";
  mark.style.width = (bounds.width / viewport.width * 100) + "%";
  mark.style.height = (bounds.height / viewport.height * 100) + "%";
  mark.hidden = false;
  mark.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function paintResults() {
  if (!display.csv) return;
  const index = header.value ? Number(header.value) : null;
  const result = auditTable(display.csv, display.lines, index);
  comparison.replaceChildren();
  summary.textContent = "";
  selection.textContent = "";
  mark.hidden = true;
  selected = null;
  byId("tablePicker").hidden = result.headerOptions.length < 2;
  header.replaceChildren(element("option", "Choose a header"));
  header.options[0].value = "";
  for (const lineIndex of result.headerOptions) {
    const line = display.lines[lineIndex];
    const option = element("option", line.words.map(w => w.text).join(" ") +
      " · " + Math.round(100 * line.baseline / display.viewport.height) + "% down page");
    option.value = lineIndex;
    header.append(option);
  }
  if (index !== null) header.value = index;
  if (result.reason) {
    message.textContent = result.reason;
    return;
  }
  const table = element("table");
  const heading = element("tr");
  heading.append(element("th", "Row label"));
  result.years.forEach(year => heading.append(element("th", year)));
  const thead = element("thead");
  thead.append(heading);
  table.append(thead);
  const body = element("tbody");
  const counts = { Match: 0, Mismatch: 0, Review: 0 };
  result.rows.forEach(row => {
    const tr = element("tr");
    const label = element("th", row.label || "Blank label");
    label.scope = "row";
    tr.append(label);
    row.cells.forEach((cell, i) => {
      counts[cell.status] += 1;
      const td = element("td");
      const button = element("button");
      button.type = "button";
      button.className = cell.status;
      button.append(element("small", cell.status), element("span", cell.input || "—"));
      button.setAttribute("aria-label", row.label + " " + result.years[i] + ", " +
        cell.status + ", CSV " + (cell.input || "blank"));
      button.addEventListener("click", () => focusSource(row.label, result.years[i], cell, button));
      td.append(button);
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  comparison.append(table);
  summary.textContent = counts.Mismatch + " mismatch · " + counts.Review + " to review";
  message.textContent = counts.Match + " match · " + counts.Mismatch + " mismatch · " +
    counts.Review + " require review on this page. Select a cell to see its source.";
}

async function releaseDocument() {
  const old = loadingTask;
  doc = null;
  loadingTask = null;
  if (old) await old.destroy().catch(() => {});
}

async function readOwn() {
  const token = ++revision;
  const pdfFile = pdf.files[0], csvFile = csv.files[0];
  await releaseDocument();
  try {
    if (pdfFile?.size > 25 * 1024 * 1024 || csvFile?.size > 2 * 1024 * 1024) {
      throw new Error("Use a PDF up to 25 MiB and a CSV up to 2 MiB.");
    }
    const [bytes, text] = await Promise.all([pdfFile?.arrayBuffer(), csvFile?.text()]);
    if (token !== revision) return;
    data = { bytes, csv: text, pdfName: pdfFile?.name };
    header.value = "";
    await update({ resetPage: true });
  } catch (error) { describeError(error, token); }
}

async function sample(file) {
  const token = ++revision;
  await releaseDocument();
  try {
    const [pdfSample, csvSample] = await Promise.all([
      fetch("./samples/financial-statement.pdf"), fetch("./samples/" + file + ".csv"),
    ]);
    if (!pdfSample.ok || !csvSample.ok) throw new Error("The bundled sample files could not be loaded.");
    const [bytes, text] = await Promise.all([pdfSample.arrayBuffer(), csvSample.text()]);
    if (token !== revision) return;
    pdf.value = ""; csv.value = ""; header.value = "";
    data = { bytes, csv: text, pdfName: "Synthetic financial statement" };
    await update({ resetPage: true });
  } catch (error) { describeError(error, token); }
}

pdf.addEventListener("change", readOwn);
csv.addEventListener("change", readOwn);
header.addEventListener("change", paintResults);
page.addEventListener("change", () => { header.value = ""; update(); });
byId("sampleBad").addEventListener("click", () => sample("switched-years"));
byId("sampleGood").addEventListener("click", () => sample("correct"));
