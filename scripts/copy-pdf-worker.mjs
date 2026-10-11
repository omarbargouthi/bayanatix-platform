// Copies the pdf.js worker from node_modules to public/pdfjs/, where the in-page PDF
// preview (components/governance/PdfPreview.tsx) loads it from. The worker must be the
// same version as the pdfjs-dist library, so this runs before every "npm run dev" and
// "npm run build" (predev / prebuild). The copy is also kept in git, so the preview works
// however the app is started; after upgrading pdfjs-dist, commit the refreshed copy.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const to = join(root, "public", "pdfjs", "pdf.worker.min.mjs");

if (!existsSync(from)) {
  // Not an error: e.g. an install with --omit=dev in an image that only runs the built app.
  console.log("copy-pdf-worker: pdfjs-dist is not installed, nothing to copy");
} else {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log("copy-pdf-worker: public/pdfjs/pdf.worker.min.mjs updated");
}
