// Worker de pdf.js con el mismo arreglo de streams que la ventana (el worker es otro contexto).
import "./polyfill-streams";
import "pdfjs-dist/build/pdf.worker.min.mjs";
