// Plataforma donde corre Cofre. En Android no existen los comandos solo-escritorio
// (Llavero, revisión diaria, correo, Excel y TRM desde internet), así que la página los esconde.
export const esAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
export const esEscritorio = !esAndroid;
