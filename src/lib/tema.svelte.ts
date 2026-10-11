// Tema: «auto» sigue el modo del sistema (celular o Mac); «light» / «dark» lo fijan.
// La elección se guarda en cada equipo (localStorage «cofre-tema»; sin valor = auto).
export type Tema = "light" | "dark";
export type PreferenciaTema = Tema | "auto";

const oscuro = typeof window !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;

function leerPreferencia(): PreferenciaTema {
  try {
    const t = localStorage.getItem("cofre-tema");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "auto";
}
const resolver = (p: PreferenciaTema): Tema => (p === "auto" ? (oscuro?.matches ? "dark" : "light") : p);

const inicial = typeof window !== "undefined" ? leerPreferencia() : "auto";
export const tema = $state<{ preferencia: PreferenciaTema; actual: Tema }>({ preferencia: inicial, actual: resolver(inicial) });

function aplicar() {
  tema.actual = resolver(tema.preferencia);
  document.documentElement.dataset.theme = tema.actual;
}

export function cambiarTema(p: PreferenciaTema) {
  tema.preferencia = p;
  try {
    if (p === "auto") localStorage.removeItem("cofre-tema");
    else localStorage.setItem("cofre-tema", p);
  } catch {}
  aplicar();
}

// En automático, sigue al sistema cuando cambia (p. ej. el modo oscuro programado del celular).
oscuro?.addEventListener("change", () => { if (tema.preferencia === "auto") aplicar(); });
