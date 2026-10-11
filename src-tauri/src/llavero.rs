//! Claves de extractos (y la del correo) en el Llavero del sistema. Solo escritorio.

use std::collections::HashMap;
use std::sync::Mutex;

const SERVICIO: &str = "co.cofre.app";
/// Una sola entrada del llavero con todas las claves ({"bbva_credito": "...", ...}):
/// macOS pide permiso una vez y no una por banco.
const CUENTA_LLAVERO: &str = "claves-extractos";
/// Bancos que en versiones anteriores tenían su propia entrada («extracto:<banco>»).
const ANTIGUAS: [&str; 3] = ["bbva_credito", "bbva_ahorros", "nequi"];

type Claves = HashMap<String, String>;
/// Copia en memoria mientras la app está abierta: el llavero se lee una sola vez por sesión.
static CACHE: Mutex<Option<Claves>> = Mutex::new(None);

fn entrada(cuenta: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICIO, cuenta).map_err(|e| e.to_string())
}

fn leer_todas() -> Result<Claves, String> {
    let mut cache = CACHE.lock().map_err(|e| e.to_string())?;
    if let Some(c) = cache.as_ref() {
        return Ok(c.clone());
    }
    let mut claves: Claves = match entrada(CUENTA_LLAVERO)?.get_password() {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(keyring::Error::NoEntry) => Claves::new(),
        Err(e) => return Err(e.to_string()),
    };
    // Pasar las claves guardadas por banco (versión anterior) a la entrada única, una sola vez.
    let mut migradas = false;
    for banco in ANTIGUAS {
        let vieja = entrada(&format!("extracto:{banco}"))?;
        if let Ok(c) = vieja.get_password() {
            claves.entry(banco.to_string()).or_insert(c);
            let _ = vieja.delete_credential();
            migradas = true;
        }
    }
    if migradas {
        escribir(&claves)?;
    }
    *cache = Some(claves.clone());
    Ok(claves)
}

fn escribir(claves: &Claves) -> Result<(), String> {
    let e = entrada(CUENTA_LLAVERO)?;
    if claves.is_empty() {
        return match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        };
    }
    let json = serde_json::to_string(claves).map_err(|e| e.to_string())?;
    e.set_password(&json).map_err(|e| e.to_string())
}

fn modificar(f: impl FnOnce(&mut Claves)) -> Result<(), String> {
    let mut claves = leer_todas()?;
    f(&mut claves);
    escribir(&claves)?;
    *CACHE.lock().map_err(|e| e.to_string())? = Some(claves);
    Ok(())
}

#[tauri::command]
pub fn clave_guardar(banco: String, clave: String) -> Result<(), String> {
    modificar(|c| { c.insert(banco, clave); })
}

/// Todas las claves de extractos (banco → clave), con un solo acceso al llavero.
/// Las claves internas (p. ej. la del correo) no se devuelven: no son claves de PDF.
#[tauri::command]
pub fn claves_todas() -> Result<Claves, String> {
    let mut c = leer_todas()?;
    c.remove(crate::correo::CLAVE_CORREO);
    c.remove(crate::copias::CLAVE_COPIAS);
    Ok(c)
}

/// Clave interna guardada en la misma entrada del llavero (solo para uso del lado nativo).
pub fn clave_interna(nombre: &str) -> Result<Option<String>, String> {
    Ok(leer_todas()?.get(nombre).cloned())
}

/// Guarda una clave interna (p. ej. la de las copias) en la misma entrada del llavero.
pub fn clave_interna_guardar(nombre: &str, valor: &str) -> Result<(), String> {
    modificar(|c| { c.insert(nombre.to_string(), valor.to_string()); })
}

/// ¿Hay una clave guardada con ese nombre? (sin devolverla a la página)
#[tauri::command]
pub fn clave_existe(nombre: String) -> Result<bool, String> {
    Ok(leer_todas()?.contains_key(&nombre))
}

#[tauri::command]
pub fn clave_borrar(banco: String) -> Result<(), String> {
    modificar(|c| { c.remove(&banco); })
}
