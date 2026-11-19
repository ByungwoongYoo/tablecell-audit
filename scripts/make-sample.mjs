import { mkdir, writeFile } from "node:fs/promises";

const folder = new URL("../web/samples/", import.meta.url);
await mkdir(folder, { recursive: true });
const row = (x, y, size, value) =>
  "BT /F1 " + size + " Tf " + x + " " + y + " Td (" +
  value.replace(/[\\()]/g, "\\$&") + ") Tj ET";
const rows = [
  ["Operating cash", "128,400", "138,600"],
  ["Investing cash", "(42,700)", "(47,300)"],
  ["Financing cash", "15,900", "19,700"],
  ["Net cash change", "101,600", "111,000"],
];
const content = [
  "0.12 0.18 0.34 rg",
  row(58, 724, 22, "Illustrative cash flow statement"),
  row(58, 699, 10, "Synthetic sample for testing table extraction, units as shown."),
  "0.94 0.95 0.99 rg 52 638 510 32 re f",
  "0.12 0.18 0.34 rg",
  row(60, 649, 13, "Item"), row(332, 649, 13, "2024"), row(460, 649, 13, "2025"),
];
rows.forEach(([label, left, right], i) => {
  const y = 614 - i * 38;
  content.push(row(60, y, 13, label), row(327, y, 13, left), row(455, y, 13, right),
    "0.8 0.83 0.89 RG 52 " + (y - 14) + " m 562 " + (y - 14) + " l S");
});
const stream = content.join("\n") + "\n";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "endstream",
];
let out = "%PDF-1.4\n";
const offsets = ["0000000000 65535 f "];
for (const [i, object] of objects.entries()) {
  offsets.push(String(Buffer.byteLength(out)).padStart(10, "0") + " 00000 n ");
  out += (i + 1) + " 0 obj\n" + object + "\nendobj\n";
}
const xref = Buffer.byteLength(out);
out += "xref\n0 " + offsets.length + "\n" + offsets.join("\n") + "\n";
out += "trailer\n<< /Size " + offsets.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
await writeFile(new URL("financial-statement.pdf", folder), out);
const q = text => '"' + text + '"';
const csv = records => ["Item,2024,2025",
  ...records.map(([label, a, b]) => [label, q(a), q(b)].join(","))].join("\n") + "\n";
await writeFile(new URL("correct.csv", folder), csv([rows[2], rows[0], rows[3], rows[1]]));
await writeFile(new URL("switched-years.csv", folder), csv([
  [rows[0][0], rows[0][2], rows[0][1]], ...rows.slice(1),
]));
