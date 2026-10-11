//! Modo revisión en segundo plano (`--revisar`). El agente diario está en `agente.rs` y el correo en `correo.rs` (solo escritorio).
//!
//! · Agente: ~/Library/LaunchAgents/co.cofre.alertas.plist abre Cofre con `--revisar` a la hora elegida
//!   y al iniciar sesión (si el Mac estaba apagado). En ese modo la ventana no se muestra: la página
//!   revisa, notifica, envía el correo si está activo y cierra la app.
//! · Correo: la clave SMTP vive en el Llavero (misma entrada única que las claves de extractos).

pub const ARG_REVISAR: &str = "--revisar";

/// ¿La app se abrió para la revisión en segundo plano?
pub fn es_revision_proceso() -> bool {
    std::env::args().any(|a| a == ARG_REVISAR)
}

#[tauri::command]
pub fn es_revision() -> bool {
    es_revision_proceso()
}

/// Cierra la app al terminar la revisión en segundo plano.
#[tauri::command]
pub fn salir(app: tauri::AppHandle) {
    app.exit(0);
}
