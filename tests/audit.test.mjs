import test from "node:test";
import assert from "node:assert/strict";
import { auditTable, parseCsv, readNumber, pdfLines } from "../web/audit.mjs";

const lines = [
  ["Item", "2024", "2025"],
  ["Sales", "10,000", "12,000"],
  ["Costs", "(2,000)", "(3,000)"],
].map(([label, a, b], i) => ({
  baseline: i * 25,
  words: [[label, 10], [a, 190], [b, 290]].map(([text, x]) => ({
    text, x, width: 35, bounds: { x, y: i * 25 - 10, width: 35, height: 12 },
  })),
}));

test("row order and year column order do not change the match", () => {
  const report = auditTable(parseCsv('Item,2025,2024\nCosts,-3000,-2000\nSales,12000,10000'), lines);
  assert.ok(report.rows.every(row => row.cells.every(cell => cell.status === "Match")));
});

test("swapped numbers keep the source coordinates of their actual year", () => {
  const report = auditTable(parseCsv('Item,2024,2025\nSales,12000,10000'), lines);
  assert.deepEqual(report.rows[0].cells.map(cell => [cell.status, cell.pdfText, cell.source.bounds.x]),
    [["Mismatch", "10,000", 190], ["Mismatch", "12,000", 290]]);
});

test("duplicate source labels require review", () => {
  const report = auditTable(parseCsv('Item,2024,2025\nSales,10000,12000'), [...lines, lines[1]]);
  assert.ok(report.rows[0].cells.every(cell => cell.status === "Review"));
});

test("duplicate CSV labels require review", () => {
  const report = auditTable(parseCsv('Item,2024,2025\nSales,10000,12000\nsales,10000,12000'), lines);
  assert.ok(report.rows.every(row => row.cells.every(cell => cell.status === "Review")));
});

test("multiple plausible table headers require a selection", () => {
  const csv = parseCsv('Item,2024,2025\nSales,10000,12000');
  assert.deepEqual(auditTable(csv, [...lines, ...lines]).headerOptions, [0, 3]);
  assert.equal(auditTable(csv, [...lines, ...lines], 3).rows[0].cells[0].status, "Match");
});

test("number parsing preserves accounting negatives, currency, and percentages", () => {
  assert.deepEqual(readNumber("(\$3,000.50)"), { value: -3000.5, unit: "$" });
  assert.deepEqual(readNumber("-￥25"), { value: -25, unit: "¥" });
  assert.deepEqual(readNumber("4.7 %"), { value: 4.7, unit: "%" });
  assert.equal(readNumber("12,50"), null);
  assert.equal(readNumber("3e5"), null);
  assert.equal(readNumber("9007199254740993"), null);
});

test("unknown unit, blank values, and missing headers do not pass", () => {
  const csv = parseCsv('Item,2024,2025\nSales,"$10,000",');
  assert.deepEqual(auditTable(csv, lines).rows[0].cells.map(cell => cell.status), ["Review", "Review"]);
  assert.equal(auditTable(csv, lines.slice(1)).rows.length, 0);
});

test("CSV accepts quoted delimiters and CRLF and rejects malformed rows", () => {
  assert.deepEqual(parseCsv('\uFEFFItem,2024\r\n"Sales, net","12,000"\r\n').rows,
    [{ label: "Sales, net", values: ["12,000"] }]);
  assert.throws(() => parseCsv('Item,2024\nSales,"100'));
  assert.throws(() => parseCsv('Item,2024\nSales,100,200'));
  assert.throws(() => parseCsv('Item,2024,2024\nSales,100,200'));
});

test("PDF text items become top-down lines and retain the source run bounding box", () => {
  const items = [
    { str: "2024", transform: [12, 0, 0, 12, 180, 690], width: 36, height: 12 },
    { str: "Operating cash", transform: [12, 0, 0, 12, 10, 660], width: 91, height: 12 },
    { str: "12300", transform: [12, 0, 0, 12, 180, 660], width: 34, height: 12 },
  ];
  const viewport = { scale: 1, convertToViewportPoint: (x, y) => [x, 750 - y] };
  const report = auditTable(parseCsv('Item,2024\nOperating cash,13200'), pdfLines(items, viewport));
  assert.equal(report.rows[0].cells[0].status, "Mismatch");
  assert.deepEqual(report.rows[0].cells[0].source.bounds, { x: 180, y: 78, width: 34, height: 14.879999999999999 });
});
