# TableCell Audit

Compare an extracted CSV table with its source PDF. The comparison keeps the
row label and year attached to each amount, so swapped figures are visible
even if all the same numbers are present. Select a result with a source
position to highlight the corresponding text on the PDF page.

**[Try the browser demo](https://byungwoongyoo.github.io/tablecell-audit/)**

## Run locally

Node.js 22.13 or later is required.

```sh
npm ci
npm test
npm start
```

Open http://127.0.0.1:4178. **Try switched years** flags the two operating
cash amounts that were assigned to the wrong years. **Try correct data**
compares an export whose rows are reordered, with all eight values matching.
The sample contains invented data.

## Check your files

1. Choose the original PDF and the CSV generated from it.
2. Set the PDF page that contains the table. If several matching year
   headers appear on the page, select the relevant one.
3. Select a cell marked **Mismatch** or **Review** to inspect the original
   value and its source position when available.

Use a label column followed by unique year columns from 1900 through 2099.
Quote any CSV value containing a comma. Rows and year columns may appear
in different orders in the PDF and CSV. The tool accepts PDFs up to 25 MiB
and CSVs up to 2 MiB, with at most 2,000 value cells per CSV.

```csv
Item,2024,2025
Operating cash,"128,400","138,600"
```

The browser reads and compares both files locally. For static hosting,
`npm run build` creates the complete site in `dist/`.

## Reading the results

The checker is designed for text-based tables on a single selected page
with an unambiguous header and one label per row. The comparison covers the
rows and years listed in the CSV. Blank cells, duplicate or unmatched labels,
and currency or percent marker differences require review. A match describes
the compared cell on the selected page. The checker does not perform OCR or
reconcile prose with table data. PDF text runs containing multiple words may
be highlighted as a group.

TableCell Audit is MIT-licensed. PDF rendering uses the bundled Apache-2.0
PDF.js dependency. The synthetic PDF and CSVs can be regenerated with
`node scripts/make-sample.mjs`.
