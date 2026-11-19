import { cp, mkdir, copyFile } from "node:fs/promises";

const from = path => new URL("../" + path, import.meta.url);
await cp(from("web/"), from("dist/"), { recursive: true });
await mkdir(from("dist/vendor/build/"), { recursive: true });
for (const file of ["pdf.mjs", "pdf.worker.mjs"]) {
  await copyFile(from("node_modules/pdfjs-dist/build/" + file), from("dist/vendor/build/" + file));
}
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(from("node_modules/pdfjs-dist/" + folder), from("dist/vendor/" + folder), { recursive: true, force: true })
    .catch(error => { if (error.code !== "ENOENT") throw error; });
}
await copyFile(from("node_modules/pdfjs-dist/LICENSE"), from("dist/vendor/LICENSE"));
await copyFile(from("LICENSE"), from("dist/LICENSE"));
console.log("Static site in dist/");
