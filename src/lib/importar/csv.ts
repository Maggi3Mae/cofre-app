// CSV a filas: separador «;», tabulador o «,» (el que más aparezca en la primera línea) y comillas.
export function leerCsv(texto: string): string[][] {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a));
  const filas: string[][] = [];
  let fila: string[] = [], celda = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda.trim()); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda.trim()); celda = "";
      if (fila.some((x) => x)) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda.trim());
  if (fila.some((x) => x)) filas.push(fila);
  return filas;
}
