export function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false, endedQuote = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') value += c;
      else if (text[i + 1] === '"') { value += '"'; i += 1; }
      else { quoted = false; endedQuote = true; }
    } else if (c === ",") {
      row.push(value); value = ""; endedQuote = false;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some(part => part.trim())) rows.push(row);
      row = []; value = ""; endedQuote = false;
    } else if (c === '"' && !value && !endedQuote) quoted = true;
    else {
      if (endedQuote || c === '"') throw new Error("Unexpected character after a CSV quote.");
      value += c;
    }
  }
  if (quoted) throw new Error("An opening CSV quote was not closed.");
  row.push(value);
  if (row.some(part => part.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("Include a header and at least one data row.");
  if (rows.some(record => record.length !== rows[0].length)) {
    throw new Error("Every CSV row needs the same number of fields as the header.");
  }
  const [headers, ...data] = rows;
  if ((headers.length - 1) * data.length > 2000) {
    throw new Error("Compare at most 2,000 CSV cells at a time.");
  }
  const years = headers.slice(1).map(part => part.trim());
  if (!headers[0].trim() || years.length < 1 || years.some(y => !/^(19|20)\d{2}$/.test(y))) {
    throw new Error("Use a label column followed by four-digit year columns, such as Item,2024,2025.");
  }
  if (new Set(years).size !== years.length) throw new Error("CSV year columns must be unique.");
  return { years, rows: data.map(([label, ...values]) => ({ label: label.trim(), values })) };
}

export function normalizeLabel(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function readNumber(value) {
  let text = value.normalize("NFKC").trim().replace(/[−–]/g, "-");
  let accounting = false;
  if (/^\(.*\)$/.test(text)) {
    accounting = true;
    text = text.slice(1, -1).trim();
  }
  const unitMatches = text.match(/[$€£¥₩₹%]/g) ?? [];
  if (unitMatches.length > 1) return null;
  const unit = unitMatches[0] ?? "";
  text = text.replace(/^([$€£¥₩₹])\s*/, "")
    .replace(/^([+-])([$€£¥₩₹])\s*/, "$1")
    .replace(/\s*%$/, "").trim();
  if (accounting && /^[+-]/.test(text)) return null;
  if (!/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const parsed = Number(text.replaceAll(",", ""));
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) return null;
  return { value: accounting ? -parsed : parsed, unit };
}

const center = word => word.x + word.width / 2;

export function pdfLines(items, viewport) {
  const lines = [];
  for (const item of items) {
    if (!item.str?.trim() || item.dir === "ttb" || item.transform.some(x => !Number.isFinite(x))) continue;
    if (Math.abs(item.transform[1]) > 0.1 || Math.abs(item.transform[2]) > 0.1) continue;
    const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const width = Math.abs(item.width) * viewport.scale;
    const height = Math.abs(item.height || item.transform[3]) * viewport.scale;
    if (width <= 0 || height <= 0) continue;
    const line = lines.find(entry => Math.abs(entry.baseline - baseline) <= Math.min(3, height / 3));
    const entry = line ?? { baseline, words: [] };
    if (!line) lines.push(entry);
    // Horizontal offsets inside a combined text run are estimates. Highlight the original run.
    const bounds = { x, y: baseline - height, width, height: height * 1.24 };
    const chunks = [...item.str.matchAll(/\S+/g)];
    const multiNumberRun = chunks.filter(chunk => readNumber(chunk[0]) !== null).length > 1;
    for (const chunk of chunks) {
      entry.words.push({
        text: chunk[0], x: x + (chunk.index / item.str.length) * width,
        width: (chunk[0].length / item.str.length) * width, bounds, multiNumberRun,
      });
    }
  }
  return lines.sort((left, right) => left.baseline - right.baseline)
    .map(line => ({ ...line, words: line.words.sort((left, right) => left.x - right.x) }));
}

function locateHeaders(lines, years) {
  return lines.flatMap((line, index) => {
    const columns = years.map(year => line.words.filter(word => word.text === year));
    return columns.every(matches => matches.length === 1)
      ? [{ index, columns: columns.map(matches => matches[0]),
        allYears: line.words.filter(word => /^(19|20)\d{2}$/.test(word.text)) }] : [];
  });
}

function rowFromLine(line, columns, allYears) {
  const sorted = allYears.map(center).sort((a, b) => a - b);
  const gap = sorted.length > 1
    ? Math.min(...sorted.slice(1).map((position, index) => position - sorted[index]))
    : 120;
  const left = sorted[0] - gap * 0.48;
  const label = line.words.filter(word => center(word) < left).map(word => word.text).join(" ");
  const values = columns.map(column => {
    const candidates = line.words.filter(word =>
      Math.abs(center(word) - center(column)) < gap * 0.45 && readNumber(word.text));
    if (candidates.length !== 1 || candidates[0].multiNumberRun) return null;
    return { ...readNumber(candidates[0].text), source: candidates[0] };
  });
  return { label, values };
}

export function auditTable(csv, lines, headerIndex = null) {
  const headers = locateHeaders(lines, csv.years);
  const header = headerIndex === null && headers.length === 1
    ? headers[0] : headers.find(candidate => candidate.index === headerIndex);
  if (!header) {
    return { years: csv.years, headerOptions: headers.map(option => option.index), rows: [],
      reason: headers.length > 1 ? "Choose the header for the table you want to compare."
        : "The selected page needs one readable header cell for each CSV year." };
  }
  const nextHeader = headers.find(option => option.index > header.index)?.index ?? lines.length;
  const rows = lines.slice(header.index + 1, nextHeader).map(line => rowFromLine(line, header.columns, header.allYears));
  const seen = new Map();
  for (const row of csv.rows) {
    const label = normalizeLabel(row.label);
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  return {
    years: csv.years,
    headerOptions: headers.map(option => option.index),
    headerIndex: header.index,
    rows: csv.rows.map(row => {
      const label = normalizeLabel(row.label);
      const matches = rows.filter(candidate => normalizeLabel(candidate.label) === label);
      const reliable = label && matches.length === 1 && seen.get(label) === 1;
      return {
        label: row.label, cells: row.values.map((input, index) => {
          const expected = readNumber(input);
          const actual = reliable ? matches[0].values[index] : null;
          if (!reliable || !actual || !expected) return {
            status: "Review", input, source: actual?.source,
            reason: !reliable ? "The row label is missing or ambiguous." :
              !actual ? "The PDF cell has no single recognizable number." : "The CSV cell is not a supported number.",
          };
          if (expected.unit !== actual.unit && (expected.unit || actual.unit)) return {
            status: "Review", input, source: actual.source, pdfText: actual.source.text,
            reason: "The displayed units differ. Check the source before comparing.",
          };
          return { status: expected.value === actual.value ? "Match" : "Mismatch",
            input, source: actual.source, pdfText: actual.source.text };
        }),
      };
    }),
  };
}
