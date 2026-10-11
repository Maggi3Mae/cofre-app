// WebKit (la ventana de Tauri en macOS) aún no permite recorrer un ReadableStream con `for await`,
// y pdf.js lo usa al extraer texto. Se agrega el iterador cuando falta; en motores que ya lo traen no hace nada.
const proto = (globalThis as any).ReadableStream?.prototype;
if (proto && !(Symbol.asyncIterator in proto)) {
  const iterar = async function* (this: ReadableStream, opciones?: { preventCancel?: boolean }) {
    const lector = this.getReader();
    try {
      while (true) {
        const { done, value } = await lector.read();
        if (done) return;
        yield value;
      }
    } finally {
      if (!opciones?.preventCancel) await lector.cancel().catch(() => {});
      lector.releaseLock();
    }
  };
  Object.defineProperty(proto, Symbol.asyncIterator, { value: iterar, writable: true, configurable: true });
  if (!("values" in proto)) Object.defineProperty(proto, "values", { value: iterar, writable: true, configurable: true });
}
export {};
