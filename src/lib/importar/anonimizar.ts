// Texto extraído sin datos sensibles, para compartirlo al ajustar un lector.
// Enmascara números largos (cuentas, tarjetas, documentos) dejando los últimos 4.
// Se conservan fechas y montos: son lo que el lector necesita. Los nombres hay que revisarlos a mano.

const esFecha8 = (s: string) => {
  const d = +s.slice(0, 2), m = +s.slice(2, 4), a = +s.slice(4);
  const a2 = +s.slice(0, 4), m2 = +s.slice(4, 6), d2 = +s.slice(6);
  return (d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 1990 && a <= 2100) ||
    (a2 >= 1990 && a2 <= 2100 && m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31);
};

export function anonimizar(texto: string): string {
  return texto
    // correos
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "correo@oculto")
    // secuencias de 7+ dígitos (pueden llevar *), que no sean montos ni fechas
    .replace(/(?<![\d.,$])(\d[\d*]{5,}\d)(?![\d]|[.,]\d)/g, (m) => {
      const solo = m.replace(/[^\d]/g, "");
      if (solo.length < 7 || (solo.length === 8 && esFecha8(solo))) return m;
      return "••••" + solo.slice(-4);
    });
}
