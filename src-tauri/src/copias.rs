//! Copias de seguridad cifradas (solo Mac).
//!
//! Archivo `Cofre-AAAA-MM-DD-HHmm.cofre`:
//!   «COFRE-COPIA1» (12 bytes) · sal (16) · nonce (12) · contenido cifrado (ChaCha20‑Poly1305).
//!   Llave de 32 bytes derivada de la contraseña con Argon2id (64 MiB, 3 pasadas); el encabezado va
//!   como dato asociado (alterarlo = no descifra).
//!   Contenido: entradas [largo del nombre u32][nombre][largo u64][bytes]: «cofre.db» (copia hecha con
//!   VACUUM INTO desde la página) y «adjuntos/<foto>».
//! La contraseña se guarda en el Llavero (para la copia diaria). Se conservan las últimas 30 copias.
//! Restaurar deja todo listo en <datos>/restaurar/ y la app se reinicia: al arrancar, `aplicar_restauracion`
//! cambia la base y las fotos (las actuales quedan como *.antes-restaurar) y desempareja los equipos.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const MAGIA: &[u8; 12] = b"COFRE-COPIA1";
const PREFIJO: &str = "Cofre-";
const EXTENSION: &str = ".cofre";
pub const MAXIMO: usize = 30;
/// Nombre de la clave en el Llavero (misma entrada única que las de extractos y correo).
pub const CLAVE_COPIAS: &str = "copias";
const BASE: &str = "cofre.db";

// ---------- Cifrado ----------

fn llave(clave: &str, sal: &[u8]) -> Result<[u8; 32], String> {
    let params = argon2::Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let a = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut k = [0u8; 32];
    a.hash_password_into(clave.as_bytes(), sal, &mut k).map_err(|e| e.to_string())?;
    Ok(k)
}

fn aleatorio<const N: usize>() -> Result<[u8; N], String> {
    let mut b = [0u8; N];
    getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
    Ok(b)
}

pub fn cifrar(contenido: &[u8], clave: &str) -> Result<Vec<u8>, String> {
    if clave.is_empty() {
        return Err("Falta la contraseña de las copias.".into());
    }
    let sal = aleatorio::<16>()?;
    let nonce = aleatorio::<12>()?;
    let k = llave(clave, &sal)?;
    let c = ChaCha20Poly1305::new(Key::from_slice(&k));
    let cifrado = c
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: contenido, aad: MAGIA })
        .map_err(|_| "No se pudo cifrar la copia.".to_string())?;
    let mut out = Vec::with_capacity(40 + cifrado.len());
    out.extend_from_slice(MAGIA);
    out.extend_from_slice(&sal);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&cifrado);
    Ok(out)
}

pub fn descifrar(archivo: &[u8], clave: &str) -> Result<Vec<u8>, String> {
    if archivo.len() < 40 + 16 || &archivo[..12] != MAGIA {
        return Err("Este archivo no es una copia de Cofre.".into());
    }
    let k = llave(clave, &archivo[12..28])?;
    let c = ChaCha20Poly1305::new(Key::from_slice(&k));
    c.decrypt(Nonce::from_slice(&archivo[28..40]), Payload { msg: &archivo[40..], aad: MAGIA })
        .map_err(|_| "La contraseña no es correcta o el archivo está dañado.".to_string())
}

// ---------- Contenido (sin dependencias de tar/zip) ----------

pub fn empaquetar(entradas: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut out = Vec::new();
    for (nombre, datos) in entradas {
        out.extend_from_slice(&(nombre.len() as u32).to_le_bytes());
        out.extend_from_slice(nombre.as_bytes());
        out.extend_from_slice(&(datos.len() as u64).to_le_bytes());
        out.extend_from_slice(datos);
    }
    out
}

pub fn desempaquetar(mut b: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let malo = || "La copia está incompleta.".to_string();
    let mut out = Vec::new();
    while !b.is_empty() {
        if b.len() < 4 { return Err(malo()); }
        let n = u32::from_le_bytes(b[..4].try_into().unwrap()) as usize;
        b = &b[4..];
        if b.len() < n + 8 { return Err(malo()); }
        let nombre = String::from_utf8(b[..n].to_vec()).map_err(|_| malo())?;
        b = &b[n..];
        let largo = u64::from_le_bytes(b[..8].try_into().unwrap()) as usize;
        b = &b[8..];
        if b.len() < largo { return Err(malo()); }
        out.push((nombre, b[..largo].to_vec()));
        b = &b[largo..];
    }
    Ok(out)
}

/// Nombres permitidos: «cofre.db» o «adjuntos/<archivo>» sin rutas ni «..».
fn nombre_valido(n: &str) -> bool {
    if n == BASE { return true; }
    match n.strip_prefix("adjuntos/") {
        Some(f) => !f.is_empty() && !f.contains('/') && !f.contains('\\') && !f.starts_with('.'),
        None => false,
    }
}

// ---------- Archivos de la carpeta ----------

fn es_copia(nombre: &str) -> bool {
    nombre.starts_with(PREFIJO) && nombre.ends_with(EXTENSION)
}

/// Copias de la carpeta, de la más nueva a la más vieja (el nombre lleva la fecha).
fn copias_en(carpeta: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(carpeta)
        .map(|r| r.filter_map(|e| e.ok()).map(|e| e.path())
            .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(es_copia)).collect())
        .unwrap_or_default();
    v.sort();
    v.reverse();
    v
}

/// Deja solo las `maximo` más nuevas. Devuelve cuántas borró.
pub fn rotar(carpeta: &Path, maximo: usize) -> usize {
    let mut n = 0;
    for p in copias_en(carpeta).into_iter().skip(maximo) {
        if fs::remove_file(&p).is_ok() { n += 1; }
    }
    n
}

fn escribir_atomico(destino: &Path, datos: &[u8]) -> Result<(), String> {
    let tmp = destino.with_extension("cofre-parcial");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("No se pudo escribir en la carpeta: {e}"))?;
        f.write_all(datos).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, destino).map_err(|e| e.to_string())
}

// ---------- Rutas de la app ----------

fn dir_datos(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}
/// La base vive en la carpeta de configuración (así la abre tauri-plugin-sql).
fn ruta_base(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join(BASE))
}
fn dir_temporal(app: &AppHandle) -> Result<PathBuf, String> {
    let d = dir_datos(app)?.join("copias-tmp");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn contrasena() -> Result<String, String> {
    crate::llavero::clave_interna(CLAVE_COPIAS)?
        .filter(|c| !c.is_empty())
        .ok_or_else(|| "Primero crea la contraseña de las copias en Ajustes.".into())
}

// ---------- Comandos ----------

/// Ruta donde la página hace `VACUUM INTO` (copia consistente de la base). No existe todavía.
#[tauri::command]
pub fn copia_ruta_base(app: AppHandle) -> Result<String, String> {
    let d = dir_temporal(&app)?;
    let p = d.join(format!("base-{}.db", hex(&aleatorio::<6>()?)));
    Ok(p.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct CopiaHecha {
    archivo: String,
    bytes: u64,
    fotos: usize,
    borradas: usize,
}

/// Cifra la copia de la base (`base`, hecha con VACUUM INTO) + las fotos y la guarda en `carpeta`.
#[tauri::command]
pub async fn copia_hacer(app: AppHandle, carpeta: String, base: String, ahora: String) -> Result<CopiaHecha, String> {
    let base = PathBuf::from(base);
    let temporal = dir_temporal(&app)?;
    if base.parent() != Some(temporal.as_path()) {
        return Err("Ruta de la copia no válida.".into());
    }
    let resultado = (|| {
        let clave = contrasena()?;
        let carpeta = PathBuf::from(&carpeta);
        if !carpeta.is_dir() {
            return Err("La carpeta de las copias no existe (¿el disco está conectado?).".into());
        }
        let mut entradas = vec![(BASE.to_string(), fs::read(&base).map_err(|e| e.to_string())?)];
        let fotos = crate::adjuntos::carpeta(&app)?;
        if let Ok(rd) = fs::read_dir(&fotos) {
            for e in rd.filter_map(|e| e.ok()) {
                let n = e.file_name().to_string_lossy().into_owned();
                let nombre = format!("adjuntos/{n}");
                if e.path().is_file() && nombre_valido(&nombre) {
                    entradas.push((nombre, fs::read(e.path()).map_err(|e| e.to_string())?));
                }
            }
        }
        let n_fotos = entradas.len() - 1;
        let datos = cifrar(&empaquetar(&entradas), &clave)?;
        // ahora = «AAAA-MM-DD-HHmm» (hora local, la arma la página)
        if ahora.len() != 15 || !ahora.chars().all(|c| c.is_ascii_digit() || c == '-') {
            return Err("Fecha no válida.".into());
        }
        let destino = carpeta.join(format!("{PREFIJO}{ahora}{EXTENSION}"));
        escribir_atomico(&destino, &datos)?;
        let borradas = rotar(&carpeta, MAXIMO);
        Ok(CopiaHecha { archivo: destino.to_string_lossy().into_owned(), bytes: datos.len() as u64, fotos: n_fotos, borradas })
    })();
    let _ = fs::remove_file(&base);
    resultado
}

#[derive(Serialize)]
pub struct CopiaEnCarpeta {
    nombre: String,
    ruta: String,
    bytes: u64,
}

#[tauri::command]
pub fn copia_listar(carpeta: String) -> Result<Vec<CopiaEnCarpeta>, String> {
    let c = PathBuf::from(carpeta);
    if !c.is_dir() {
        return Err("La carpeta de las copias no existe (¿el disco está conectado?).".into());
    }
    Ok(copias_en(&c).into_iter().map(|p| CopiaEnCarpeta {
        nombre: p.file_name().unwrap().to_string_lossy().into_owned(),
        bytes: fs::metadata(&p).map(|m| m.len()).unwrap_or(0),
        ruta: p.to_string_lossy().into_owned(),
    }).collect())
}

#[tauri::command]
pub fn copia_clave_guardar(clave: String) -> Result<(), String> {
    if clave.chars().count() < 8 {
        return Err("La contraseña debe tener al menos 8 caracteres.".into());
    }
    crate::llavero::clave_interna_guardar(CLAVE_COPIAS, &clave)
}

#[derive(Serialize)]
pub struct Restauracion {
    fotos: usize,
}

/// Descifra y deja la copia lista para el siguiente arranque. No toca los datos actuales todavía.
#[tauri::command]
pub async fn copia_preparar_restauracion(app: AppHandle, archivo: String, clave: String) -> Result<Restauracion, String> {
    let bytes = fs::read(&archivo).map_err(|e| format!("No se pudo leer el archivo: {e}"))?;
    let entradas = desempaquetar(&descifrar(&bytes, &clave)?)?;
    let base = entradas.iter().find(|(n, _)| n == BASE).ok_or("La copia no trae la base de datos.")?;
    if !base.1.starts_with(b"SQLite format 3\0") {
        return Err("La base de la copia no es válida.".into());
    }
    let dir = dir_datos(&app)?.join("restaurar");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("adjuntos")).map_err(|e| e.to_string())?;
    let mut fotos = 0;
    for (n, datos) in &entradas {
        if !nombre_valido(n) { continue; }
        if n != BASE { fotos += 1; }
        fs::write(dir.join(n), datos).map_err(|e| e.to_string())?;
    }
    fs::write(dir.join("LISTA"), b"1").map_err(|e| e.to_string())?;
    Ok(Restauracion { fotos })
}

#[tauri::command]
pub fn copia_reiniciar(app: AppHandle) {
    app.restart();
}

/// Al arrancar (antes de que la página abra la base): si hay una restauración lista, la aplica.
pub fn aplicar_restauracion(app: &AppHandle) -> Result<bool, String> {
    let datos = dir_datos(app)?;
    let dir = datos.join("restaurar");
    if !dir.join("LISTA").exists() {
        return Ok(false);
    }
    let base = ruta_base(app)?;
    if let Some(p) = base.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    // La base actual (con su WAL) queda como «antes-restaurar».
    for suf in ["", "-wal", "-shm"] {
        let actual = PathBuf::from(format!("{}{suf}", base.display()));
        let antes = PathBuf::from(format!("{}.antes-restaurar{suf}", base.display()));
        let _ = fs::remove_file(&antes);
        if actual.exists() { fs::rename(&actual, &antes).map_err(|e| e.to_string())?; }
    }
    fs::rename(dir.join(BASE), &base).map_err(|e| e.to_string())?;
    let fotos = crate::adjuntos::carpeta(app)?;
    let fotos_antes = fotos.with_file_name("adjuntos.antes-restaurar");
    let _ = fs::remove_dir_all(&fotos_antes);
    if fotos.exists() { fs::rename(&fotos, &fotos_antes).map_err(|e| e.to_string())?; }
    fs::rename(dir.join("adjuntos"), &fotos).map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&dir);
    // Los equipos emparejados tenían otros datos: se desemparejan y, al volver, reciben los restaurados.
    let sinc = datos.join("sinc.json");
    if let Ok(t) = fs::read_to_string(&sinc) {
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&t) {
            v["equipos"] = serde_json::json!([]);
            let _ = fs::write(&sinc, v.to_string());
        }
    }
    Ok(true)
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn cifra_y_descifra() {
        let e = vec![("cofre.db".to_string(), b"SQLite format 3\0datos".to_vec()), ("adjuntos/a.webp".to_string(), vec![1, 2, 3])];
        let c = cifrar(&empaquetar(&e), "una clave larga").unwrap();
        assert_eq!(&c[..12], MAGIA);
        assert_eq!(desempaquetar(&descifrar(&c, "una clave larga").unwrap()).unwrap(), e);
    }

    #[test]
    fn clave_mala_o_archivo_alterado_no_descifran() {
        let c = cifrar(b"hola", "correcta123").unwrap();
        assert!(descifrar(&c, "otra-clave").unwrap_err().contains("contraseña"));
        let mut alterado = c.clone();
        let i = alterado.len() - 1;
        alterado[i] ^= 1;
        assert!(descifrar(&alterado, "correcta123").is_err());
        let mut encabezado = c.clone();
        encabezado[13] ^= 1; // la sal
        assert!(descifrar(&encabezado, "correcta123").is_err());
        assert!(descifrar(b"no es una copia", "x").unwrap_err().contains("no es una copia"));
    }

    #[test]
    fn misma_clave_distinto_archivo() {
        assert_ne!(cifrar(b"x", "clave1234").unwrap(), cifrar(b"x", "clave1234").unwrap());
    }

    #[test]
    fn nombres_seguros() {
        assert!(nombre_valido("cofre.db"));
        assert!(nombre_valido("adjuntos/tx-1.webp"));
        for n in ["../cofre.db", "adjuntos/../x", "adjuntos/a/b", "adjuntos/", "otra.db", "adjuntos/.oculto"] {
            assert!(!nombre_valido(n), "{n}");
        }
        assert!(desempaquetar(&[1, 0, 0]).is_err());
    }

    #[test]
    fn rota_a_las_ultimas() {
        let d = std::env::temp_dir().join(format!("cofre-rotar-{}", hex(&aleatorio::<4>().unwrap())));
        fs::create_dir_all(&d).unwrap();
        for dia in 1..=31 { fs::write(d.join(format!("Cofre-2026-10-{dia:02}-0800.cofre")), b"x").unwrap(); }
        for dia in 1..=5 { fs::write(d.join(format!("Cofre-2026-11-{dia:02}-0800.cofre")), b"x").unwrap(); }
        fs::write(d.join("otra-cosa.txt"), b"x").unwrap();
        assert_eq!(rotar(&d, MAXIMO), 6);
        let quedan = copias_en(&d);
        assert_eq!(quedan.len(), 30);
        assert!(quedan[0].ends_with("Cofre-2026-11-05-0800.cofre"));
        assert!(quedan[29].ends_with("Cofre-2026-10-07-0800.cofre"));
        assert!(d.join("otra-cosa.txt").exists());
        fs::remove_dir_all(&d).unwrap();
    }
}
