import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../web/", import.meta.url));
const pdfjs = fileURLToPath(new URL("../node_modules/pdfjs-dist/", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8",
  ".wasm": "application/wasm" };
const port = Number(process.env.PORT || 4178);
createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const url = new URL(request.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const library = pathname.startsWith("vendor/");
    const allowed = library ? pdfjs : root;
    const relative = library ? pathname.slice(7) : pathname;
    const file = path.resolve(allowed, relative);
    const within = path.relative(allowed, file);
    if (within.startsWith("..") || path.isAbsolute(within) || !statSync(file).isFile()) {
      response.writeHead(404).end("File not found");
      return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("File not found");
  }
}).listen(port, "127.0.0.1", () => console.log("TableCell Audit at http://127.0.0.1:" + port));
