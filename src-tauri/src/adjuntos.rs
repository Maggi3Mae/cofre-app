//! Fotos adjuntas a movimientos (WebP), en <datos de la app>/adjuntos/. Nunca van al repo.
//! La página envía los bytes crudos (sin JSON) y la base solo guarda el nombre del archivo.

use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

/// Bytes del cuerpo de una solicitud: crudos (escritorio) o, en Android, donde el canal los
/// convierte a JSON, como lista de números (`[82, 73, …]`).
pub(crate) fn bytes_cuerpo(body: &InvokeBody) -> Option<Vec<u8>> {
    match body {
        InvokeBody::Raw(b) => Some(b.clone()),
        InvokeBody::Json(serde_json::Value::Array(v)) => {
            v.iter().map(|x| x.as_u64().filter(|n| *n <= 255).map(|n| n as u8)).collect()
        }
        _ => None,
    }
}

pub(crate) fn carpeta(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("adjuntos");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Solo nombres que esta app genera: evita rutas fuera de la carpeta.
pub(crate) fn ruta(app: &AppHandle, nombre: &str) -> Result<PathBuf, String> {
    let valido = nombre.len() <= 64
        && nombre.ends_with(".webp")
        && nombre.trim_end_matches(".webp").chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !valido {
        return Err("Nombre de adjunto no válido.".into());
    }
    Ok(carpeta(app)?.join(nombre))
}

#[tauri::command]
pub fn adjunto_guardar(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let Some(bytes) = bytes_cuerpo(request.body()) else {
        return Err("Se esperaban los bytes de la imagen.".into());
    };
    // Cabecera WebP: «RIFF» … «WEBP».
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err("La imagen no es WebP.".into());
    }
    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let nombre = format!("{}-{:08x}.webp", ahora.as_millis(), ahora.subsec_nanos() ^ (bytes.len() as u32).rotate_left(13));
    std::fs::write(ruta(&app, &nombre)?, &bytes).map_err(|e| e.to_string())?;
    Ok(nombre)
}

#[tauri::command]
pub fn adjunto_leer(app: AppHandle, nombre: String) -> Result<Response, String> {
    let datos = std::fs::read(ruta(&app, &nombre)?).map_err(|_| "No se encontró la foto.".to_string())?;
    Ok(Response::new(datos))
}

#[tauri::command]
pub fn adjunto_borrar(app: AppHandle, nombre: String) -> Result<(), String> {
    match std::fs::remove_file(ruta(&app, &nombre)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod pruebas {
    use super::bytes_cuerpo;
    use tauri::ipc::InvokeBody;

    #[test]
    fn bytes_crudos_o_lista_json() {
        assert_eq!(bytes_cuerpo(&InvokeBody::Raw(vec![82, 73])), Some(vec![82, 73]));
        assert_eq!(bytes_cuerpo(&InvokeBody::Json(serde_json::json!([82, 73, 255]))), Some(vec![82, 73, 255]));
        assert_eq!(bytes_cuerpo(&InvokeBody::Json(serde_json::json!([82, 300]))), None);
        assert_eq!(bytes_cuerpo(&InvokeBody::Json(serde_json::json!({ "a": 1 }))), None);
    }
}

/// Guarda la imagen del resumen de «Me deben» donde la persona eligió en «Guardar como» (solo escritorio).
/// La ruta llega en la cabecera `x-ruta` (codificada); solo PNG.
#[cfg(desktop)]
#[tauri::command]
pub fn imagen_guardar(request: Request<'_>) -> Result<(), String> {
    let ruta = request
        .headers()
        .get("x-ruta")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode(v))
        .ok_or("Falta la ruta.")?;
    if !ruta.to_lowercase().ends_with(".png") {
        return Err("La imagen se guarda como .png.".into());
    }
    let bytes = bytes_cuerpo(request.body()).ok_or("Se esperaban los bytes de la imagen.")?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("La imagen no es PNG.".into());
    }
    std::fs::write(&ruta, &bytes).map_err(|e| format!("No se pudo guardar: {e}"))
}

/// «%C3%A1» → «á» (encodeURIComponent desde la página).
#[cfg(desktop)]
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
