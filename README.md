# FinePrint X-Ray

Radical transparency for credit card and loan terms. Upload a text-based PDF (no OCR in v0) and get an "Honesty Report" with:

- Gotchas (hidden fees or rate triggers)
- Exit Cost (cancellation friction)
- Verdict (Good Deal vs. Predatory)

## Quickstart

Open `index.html` in a modern browser and drag & drop a text-based PDF into the drop zone.

Privacy note: all processing is local in the browser; no files are uploaded.

## Tech Stack

- HTML5 + CSS3 + Vanilla JS
- PDF.js (client-side text extraction)
- Rule-based detectors (local-first, deterministic)

## Project Structure

- `index.html` — UI scaffold
- `styles.css` — layout + visual styling
- `app.js` — state machine, PDF extraction, report rendering
- `detectors.js` — rule-based detectors
- `report.js` — deterministic report generator
- `storage.js` — PDF hash + IndexedDB cache

## Notes

- v0 supports **text-based PDFs only** (no OCR).
- Scanned PDFs are unsupported in v1 (no OCR).

