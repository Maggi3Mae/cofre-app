// Hoja «Nuevo movimiento» del celular: se abre con el + de la barra inferior encima de cualquier pantalla.
export const hojaNuevo = $state({ abierta: false });
export const abrirNuevo = () => (hojaNuevo.abierta = true);
