//! Fase 5B · Sincronización por Wi‑Fi: red, emparejamiento y cifrado.
//!
//! · El Mac es el centro: mientras Cofre está abierto escucha en la red local (HTTP en el puerto
//!   47613 o el que esté libre) y se anuncia con mDNS como `_cofre._tcp`.
//! · Emparejar: el Mac muestra un código de 6 dígitos (5 minutos, 3 intentos). Con SPAKE2 los dos
//!   equipos sacan del código una llave de 32 bytes sin que viaje; quien escuche la red no puede
//!   adivinar el código. Esa llave queda guardada en la carpeta privada de la app (sinc.json).
//! · Cada mensaje va cifrado con ChaCha20‑Poly1305 (la llave del equipo; el id del equipo como dato
//!   asociado) y con un nonce que no se puede repetir.
//! · Los datos los resuelve la página (lib/sinc/motor.ts): el servidor le pasa la solicitud con el
//!   evento `sinc-solicitud` y espera `sinc_respuesta`. Las fotos las mueve Rust directamente.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use spake2::{Ed25519Group, Identity, Password, Spake2};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const SERVICIO: &str = "_cofre._tcp.local.";
const ID_EQUIPO: &[u8] = b"cofre-equipo";
const ID_CENTRO: &[u8] = b"cofre-centro";
const CONFIRMA: &[u8] = b"cofre-emparejado";
const MAX_CUERPO: u64 = 40 * 1024 * 1024;

// ---------- Configuración guardada (sinc.json, nunca sale del equipo) ----------

#[derive(Serialize, Deserialize, Clone)]
struct Equipo {
    id: String,
    nombre: String,
    llave: String,
    emparejado_en: String,
    visto_en: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Centro {
    id: String,
    nombre: String,
    direccion: String,
    puerto: u16,
    llave: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Config {
    id: String,
    #[serde(default)]
    equipos: Vec<Equipo>,
    centro: Option<Centro>,
}

static CONFIG: Mutex<Option<Config>> = Mutex::new(None);

fn ruta_config(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("sinc.json"))
}

fn con_config<T>(app: &AppHandle, f: impl FnOnce(&mut Config) -> Result<T, String>) -> Result<T, String> {
    let mut g = CONFIG.lock().map_err(|e| e.to_string())?;
    if g.is_none() {
        let ruta = ruta_config(app)?;
        let mut c: Config = std::fs::read_to_string(&ruta).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        if c.id.is_empty() {
            c.id = hex(&aleatorio::<16>()?);
        }
        *g = Some(c);
    }
    let c = g.as_mut().unwrap();
    let r = f(c)?;
    guardar(app, c)?;
    Ok(r)
}

fn guardar(app: &AppHandle, c: &Config) -> Result<(), String> {
    let ruta = ruta_config(app)?;
    let texto = serde_json::to_string_pretty(c).map_err(|e| e.to_string())?;
    std::fs::write(&ruta, texto).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&ruta, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// ---------- Cifrado ----------

fn aleatorio<const N: usize>() -> Result<[u8; N], String> {
    let mut b = [0u8; N];
    getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
    Ok(b)
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn ahora_iso() -> String {
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0) as i64;
    // AAAA-MM-DDTHH:MM:SS.mmmZ sin dependencias de fechas.
    let (dias, resto) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    let (a, m, d) = civil(dias);
    format!("{a:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", resto / 3_600_000, resto / 60_000 % 60, resto / 1000 % 60, resto % 1000)
}

/// Días desde 1970-01-01 → (año, mes, día). Algoritmo de Howard Hinnant.
fn civil(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn llave_de(b64: &str) -> Result<[u8; 32], String> {
    let v = B64.decode(b64).map_err(|_| "Llave dañada.".to_string())?;
    v.try_into().map_err(|_| "Llave dañada.".to_string())
}

/// Sobre cifrado: { n: nonce, c: datos cifrados } (base64).
fn cifrar(llave: &[u8; 32], asociado: &str, datos: &[u8]) -> Result<Value, String> {
    let n = aleatorio::<12>()?;
    let c = ChaCha20Poly1305::new(Key::from_slice(llave))
        .encrypt(Nonce::from_slice(&n), Payload { msg: datos, aad: asociado.as_bytes() })
        .map_err(|_| "No se pudo cifrar.".to_string())?;
    Ok(json!({ "n": B64.encode(n), "c": B64.encode(c) }))
}

fn descifrar(llave: &[u8; 32], asociado: &str, sobre: &Value) -> Result<Vec<u8>, String> {
    let campo = |k: &str| sobre.get(k).and_then(Value::as_str).and_then(|s| B64.decode(s).ok()).ok_or("Mensaje incompleto.");
    let n = campo("n")?;
    let c = campo("c")?;
    if n.len() != 12 {
        return Err("Mensaje incompleto.".into());
    }
    ChaCha20Poly1305::new(Key::from_slice(llave))
        .decrypt(Nonce::from_slice(&n), Payload { msg: &c, aad: asociado.as_bytes() })
        .map_err(|_| "No se pudo descifrar (¿equipo no emparejado?).".to_string())
}

/// Lado del centro (B): con el mensaje del equipo saca la llave y el mensaje de respuesta.
#[cfg(desktop)]
fn llave_spake_centro(codigo: &str, entrante: &[u8]) -> Result<(Vec<u8>, [u8; 32]), String> {
    let (s, saliente) =
        Spake2::<Ed25519Group>::start_b(&Password::new(codigo.as_bytes()), &Identity::new(ID_EQUIPO), &Identity::new(ID_CENTRO));
    let llave = s.finish(entrante).map_err(|_| "El emparejamiento falló.".to_string())?
        .try_into().map_err(|_| "El emparejamiento falló.".to_string())?;
    Ok((saliente, llave))
}

// ---------- Fotos (carpeta de adjuntos) ----------

fn fotos_locales(app: &AppHandle) -> Result<Vec<String>, String> {
    let dir = crate::adjuntos::carpeta(app)?;
    Ok(std::fs::read_dir(dir).map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| n.ends_with(".webp"))
        .collect())
}

fn es_webp(b: &[u8]) -> bool {
    b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP"
}

// =====================================================================
// Centro (Mac): servidor
// =====================================================================

#[cfg(desktop)]
mod centro {
    use super::*;
    use std::collections::{HashMap, HashSet};
    use std::io::Read;
    use std::sync::mpsc;
    use std::time::Instant;
    use tauri::Emitter;

    pub const PUERTO: u16 = 47613;

    pub struct Emparejando {
        pub codigo: String,
        pub nombre_centro: String,
        vence: Instant,
        intentos: u8,
        pendientes: HashMap<String, ([u8; 32], String)>,
    }

    pub static EMPAREJANDO: Mutex<Option<Emparejando>> = Mutex::new(None);
    pub static PUERTO_ACTIVO: Mutex<Option<u16>> = Mutex::new(None);
    static ESPERAS: Mutex<Option<HashMap<u64, mpsc::Sender<Result<Value, String>>>>> = Mutex::new(None);
    static VISTOS: Mutex<Option<HashSet<String>>> = Mutex::new(None);
    static SIGUIENTE: Mutex<u64> = Mutex::new(1);
    static MDNS: Mutex<Option<mdns_sd::ServiceDaemon>> = Mutex::new(None);

    pub fn nuevo_codigo(nombre_centro: String) -> Result<String, String> {
        let n = u32::from_le_bytes(aleatorio::<4>()?) % 1_000_000;
        let codigo = format!("{n:06}");
        *EMPAREJANDO.lock().map_err(|e| e.to_string())? = Some(Emparejando {
            codigo: codigo.clone(),
            nombre_centro,
            vence: Instant::now() + Duration::from_secs(300),
            intentos: 0,
            pendientes: HashMap::new(),
        });
        Ok(codigo)
    }

    pub fn iniciar(app: AppHandle) {
        if PUERTO_ACTIVO.lock().map(|p| p.is_some()).unwrap_or(true) {
            return;
        }
        let server = tiny_http::Server::http(("0.0.0.0", PUERTO)).or_else(|_| tiny_http::Server::http(("0.0.0.0", 0)));
        let Ok(server) = server else { return };
        let Some(puerto) = server.server_addr().to_ip().map(|a| a.port()) else { return };
        if let Ok(mut p) = PUERTO_ACTIVO.lock() {
            *p = Some(puerto);
        }
        anunciar(&app, puerto);
        std::thread::spawn(move || {
            for req in server.incoming_requests() {
                let app = app.clone();
                std::thread::spawn(move || atender(&app, req));
            }
        });
    }

    fn anunciar(app: &AppHandle, puerto: u16) {
        let Ok(id) = con_config(app, |c| Ok(c.id.clone())) else { return };
        let Ok(daemon) = mdns_sd::ServiceDaemon::new() else { return };
        let corto = &id[..8];
        let props = [("id", id.as_str()), ("v", "1")];
        if let Ok(info) = mdns_sd::ServiceInfo::new(SERVICIO, &format!("Cofre {corto}"), &format!("cofre-{corto}.local."), "", puerto, &props[..]) {
            if daemon.register(info.enable_addr_auto()).is_ok() {
                if let Ok(mut m) = MDNS.lock() {
                    *m = Some(daemon);
                }
            }
        }
    }

    fn responder_json(req: tiny_http::Request, codigo: u16, v: &Value) {
        let cab = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
        let _ = req.respond(tiny_http::Response::from_string(v.to_string()).with_status_code(codigo).with_header(cab));
    }

    fn atender(app: &AppHandle, mut req: tiny_http::Request) {
        let mut cuerpo = Vec::new();
        if req.as_reader().take(MAX_CUERPO).read_to_end(&mut cuerpo).is_err() {
            return responder_json(req, 400, &json!({ "error": "Cuerpo inválido." }));
        }
        let entrada: Value = serde_json::from_slice(&cuerpo).unwrap_or(Value::Null);
        let ruta = req.url().to_string();
        let r = match (req.method(), ruta.as_str()) {
            (tiny_http::Method::Post, "/emparejar/1") => emparejar_1(&entrada),
            (tiny_http::Method::Post, "/emparejar/2") => emparejar_2(app, &entrada),
            (tiny_http::Method::Post, "/c") => cifrado(app, &entrada),
            (tiny_http::Method::Get, "/") => Ok(json!({ "app": "cofre" })),
            _ => Err((404, "No existe.".to_string())),
        };
        match r {
            Ok(v) => responder_json(req, 200, &v),
            Err((codigo, msj)) => responder_json(req, codigo, &json!({ "error": msj })),
        }
    }

    type Http<T> = Result<T, (u16, String)>;
    fn e400<E: ToString>(e: E) -> (u16, String) {
        (400, e.to_string())
    }

    fn texto<'a>(v: &'a Value, k: &str) -> Http<&'a str> {
        v.get(k).and_then(Value::as_str).ok_or((400, format!("Falta «{k}».")))
    }

    /// Paso 1: el equipo manda su mensaje SPAKE2; el centro responde con el suyo.
    fn emparejar_1(v: &Value) -> Http<Value> {
        let id = texto(v, "id")?.to_string();
        let nombre: String = texto(v, "nombre")?.chars().take(40).collect();
        let a = B64.decode(texto(v, "a")?).map_err(e400)?;
        let mut g = EMPAREJANDO.lock().map_err(|e| (500, e.to_string()))?;
        let Some(emp) = g.as_mut().filter(|e| e.vence > Instant::now()) else {
            *g = None;
            return Err((410, "No hay un código activo en el computador. Genera uno nuevo en Ajustes → Equipos.".into()));
        };
        let (b, llave) = llave_spake_centro(&emp.codigo, &a).map_err(e400)?;
        emp.pendientes.insert(id, (llave, nombre));
        Ok(json!({ "b": B64.encode(b), "nombre": emp.nombre_centro }))
    }

    /// Paso 2: el equipo prueba que tiene la misma llave (si el código estaba mal, no la tiene).
    fn emparejar_2(app: &AppHandle, v: &Value) -> Http<Value> {
        let id = texto(v, "id")?.to_string();
        let mut g = EMPAREJANDO.lock().map_err(|e| (500, e.to_string()))?;
        let Some(emp) = g.as_mut() else { return Err((410, "El código ya no es válido.".into())) };
        let Some((llave, nombre)) = emp.pendientes.get(&id).cloned() else { return Err((400, "Empieza de nuevo.".into())) };
        let ok = descifrar(&llave, &id, v).map(|d| d == CONFIRMA).unwrap_or(false);
        if !ok {
            emp.intentos += 1;
            emp.pendientes.remove(&id);
            if emp.intentos >= 3 {
                *g = None;
                return Err((403, "Código incorrecto. Genera uno nuevo en el computador.".into()));
            }
            return Err((403, "Código incorrecto.".into()));
        }
        let (centro_id, ahora) = (con_config(app, |c| Ok(c.id.clone())).map_err(|e| (500, e))?, ahora_iso());
        con_config(app, |c| {
            c.equipos.retain(|e| e.id != id);
            c.equipos.push(Equipo { id: id.clone(), nombre, llave: B64.encode(llave), emparejado_en: ahora, visto_en: None });
            Ok(())
        }).map_err(|e| (500, e))?;
        *g = None; // un código, un equipo
        let _ = app.emit("sinc-equipos", ());
        cifrar(&llave, &id, json!({ "ok": true, "centro": centro_id }).to_string().as_bytes()).map_err(|e| (500, e))
    }

    /// Mensaje cifrado de un equipo emparejado.
    fn cifrado(app: &AppHandle, sobre: &Value) -> Http<Value> {
        let id = texto(sobre, "id")?.to_string();
        let equipo = con_config(app, |c| Ok(c.equipos.iter().find(|e| e.id == id).cloned())).map_err(|e| (500, e))?
            .ok_or((401, "Este equipo no está emparejado con este computador.".to_string()))?;
        let llave = llave_de(&equipo.llave).map_err(|e| (500, e))?;
        // Un nonce no se acepta dos veces (nadie puede repetir un mensaje grabado).
        let nonce = texto(sobre, "n")?.to_string();
        {
            let mut v = VISTOS.lock().map_err(|e| (500, e.to_string()))?;
            let set = v.get_or_insert_with(HashSet::new);
            if set.len() > 20_000 {
                set.clear();
            }
            if !set.insert(nonce) {
                return Err((409, "Mensaje repetido.".into()));
            }
        }
        let datos = descifrar(&llave, &id, sobre).map_err(|e| (401, e))?;
        let msj: Value = serde_json::from_slice(&datos).map_err(e400)?;
        let ahora = ahora_iso();
        let _ = con_config(app, |c| {
            if let Some(e) = c.equipos.iter_mut().find(|e| e.id == id) {
                e.visto_en = Some(ahora);
            }
            Ok(())
        });
        let salida = match texto(&msj, "tipo")? {
            "sinc" => preguntar_pagina(app, &equipo.nombre, msj.get("solicitud").cloned().unwrap_or(Value::Null))?,
            "fotos" => json!({ "nombres": fotos_locales(app).map_err(|e| (500, e))? }),
            "foto_bajar" => {
                let ruta = crate::adjuntos::ruta(app, texto(&msj, "nombre")?).map_err(e400)?;
                let b = std::fs::read(ruta).map_err(|_| (404, "No está esa foto.".to_string()))?;
                json!({ "datos": B64.encode(b) })
            }
            "foto_subir" => {
                let ruta = crate::adjuntos::ruta(app, texto(&msj, "nombre")?).map_err(e400)?;
                let b = B64.decode(texto(&msj, "datos")?).map_err(e400)?;
                if !es_webp(&b) {
                    return Err((400, "La foto no es WebP.".into()));
                }
                if !ruta.exists() {
                    std::fs::write(ruta, b).map_err(|e| (500, e.to_string()))?;
                }
                json!({ "ok": true })
            }
            _ => return Err((400, "Tipo desconocido.".into())),
        };
        cifrar(&llave, &id, salida.to_string().as_bytes()).map_err(|e| (500, e))
    }

    /// Le pasa la solicitud a la página (motor.ts) y espera su respuesta (máx. 90 s).
    fn preguntar_pagina(app: &AppHandle, equipo: &str, solicitud: Value) -> Http<Value> {
        let (tx, rx) = mpsc::channel();
        let n = {
            let mut s = SIGUIENTE.lock().map_err(|e| (500, e.to_string()))?;
            *s += 1;
            *s
        };
        ESPERAS.lock().map_err(|e| (500, e.to_string()))?.get_or_insert_with(HashMap::new).insert(n, tx);
        app.emit("sinc-solicitud", json!({ "req": n, "equipo": equipo, "solicitud": solicitud })).map_err(|e| (500, e.to_string()))?;
        let r = rx.recv_timeout(Duration::from_secs(90));
        if let Ok(mut m) = ESPERAS.lock() {
            m.get_or_insert_with(HashMap::new).remove(&n);
        }
        match r {
            Ok(Ok(v)) => Ok(json!({ "respuesta": v })),
            Ok(Err(e)) => Err((500, e)),
            Err(_) => Err((504, "El computador no respondió a tiempo.".into())),
        }
    }

    pub fn entregar(req: u64, r: Result<Value, String>) {
        if let Ok(mut m) = ESPERAS.lock() {
            if let Some(tx) = m.get_or_insert_with(HashMap::new).remove(&req) {
                let _ = tx.send(r);
            }
        }
    }
}

/// Arranca el servidor del Mac (desde `setup`, salvo en la revisión diaria).
#[cfg(desktop)]
pub fn iniciar_centro(app: AppHandle) {
    centro::iniciar(app);
}

#[cfg(desktop)]
#[tauri::command]
pub fn sinc_codigo_nuevo(nombre: String) -> Result<String, String> {
    centro::nuevo_codigo(if nombre.trim().is_empty() { "Computador".into() } else { nombre.trim().chars().take(40).collect() })
}

#[cfg(desktop)]
#[tauri::command]
pub fn sinc_codigo_cancelar() {
    if let Ok(mut g) = centro::EMPAREJANDO.lock() {
        *g = None;
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn sinc_respuesta(req: u64, respuesta: Option<Value>, error: Option<String>) {
    centro::entregar(req, match (respuesta, error) {
        (Some(v), None) => Ok(v),
        (_, e) => Err(e.unwrap_or_else(|| "Error en el computador.".into())),
    });
}

#[cfg(desktop)]
#[tauri::command]
pub fn sinc_quitar_equipo(app: AppHandle, id: String) -> Result<(), String> {
    con_config(&app, |c| {
        c.equipos.retain(|e| e.id != id);
        Ok(())
    })
}

// =====================================================================
// Equipo (celular / tablet): cliente
// =====================================================================

#[derive(Serialize)]
pub struct Encontrado {
    id: String,
    nombre: String,
    direccion: String,
    puerto: u16,
}

/// Busca el Mac en la red con mDNS durante unos segundos.
fn buscar(segundos: u64) -> Vec<Encontrado> {
    multicast::con_candado(|| {
        let mut out: Vec<Encontrado> = Vec::new();
        let Ok(daemon) = mdns_sd::ServiceDaemon::new() else { return out };
        let Ok(rx) = daemon.browse(SERVICIO) else { return out };
        let fin = std::time::Instant::now() + Duration::from_secs(segundos);
        while let Some(resto) = fin.checked_duration_since(std::time::Instant::now()) {
            match rx.recv_timeout(resto) {
                Ok(mdns_sd::ServiceEvent::ServiceResolved(s)) => {
                    let id = s.get_property_val_str("id").unwrap_or_default().to_string();
                    let Some(ip) = s.get_addresses_v4().into_iter().next() else { continue };
                    if !out.iter().any(|e| e.id == id) {
                        out.push(Encontrado { id, nombre: s.get_fullname().split("._").next().unwrap_or("Computador").to_string(), direccion: ip.to_string(), puerto: s.get_port() });
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = daemon.shutdown();
        out
    })
}

fn agente() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(4)).timeout(Duration::from_secs(120)).build()
}

fn post(direccion: &str, puerto: u16, ruta: &str, cuerpo: &Value) -> Result<Value, String> {
    let url = format!("http://{direccion}:{puerto}{ruta}");
    match agente().post(&url).send_json(cuerpo.clone()) {
        Ok(r) => r.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(_, r)) => {
            let v: Value = r.into_json().unwrap_or(Value::Null);
            Err(v.get("error").and_then(Value::as_str).unwrap_or("El computador rechazó la solicitud.").to_string())
        }
        Err(_) => Err("SIN_CONEXION".into()),
    }
}

const SIN_MAC: &str = "No se encontró el computador (Mac o PC). Revisa que Cofre esté abierto allí y que los dos estén en la misma red Wi‑Fi.";

/// Manda un mensaje cifrado al Mac emparejado. Si la dirección cambió, lo busca con mDNS y reintenta.
fn al_centro(app: &AppHandle, msj: Value) -> Result<Value, String> {
    let (yo, centro) = con_config(app, |c| Ok((c.id.clone(), c.centro.clone())))?;
    let centro = centro.ok_or("Este equipo no está emparejado con un computador.")?;
    let llave = llave_de(&centro.llave)?;
    let enviar = |dir: &str, puerto: u16| -> Result<Value, String> {
        let mut sobre = cifrar(&llave, &yo, msj.to_string().as_bytes())?;
        sobre["id"] = json!(yo);
        let r = post(dir, puerto, "/c", &sobre)?;
        serde_json::from_slice(&descifrar(&llave, &yo, &r)?).map_err(|e| e.to_string())
    };
    match enviar(&centro.direccion, centro.puerto) {
        Err(e) if e == "SIN_CONEXION" => {
            let Some(nuevo) = buscar(3).into_iter().find(|e| e.id == centro.id) else { return Err(SIN_MAC.into()) };
            con_config(app, |c| {
                if let Some(ce) = c.centro.as_mut() {
                    ce.direccion = nuevo.direccion.clone();
                    ce.puerto = nuevo.puerto;
                }
                Ok(())
            })?;
            enviar(&nuevo.direccion, nuevo.puerto).map_err(|e| if e == "SIN_CONEXION" { SIN_MAC.into() } else { e })
        }
        r => r,
    }
}

#[tauri::command]
pub async fn sinc_buscar() -> Vec<Encontrado> {
    tauri::async_runtime::spawn_blocking(|| buscar(4)).await.unwrap_or_default()
}

/// Empareja este equipo con el Mac usando el código que muestra el Mac. Devuelve el nombre del Mac.
#[tauri::command]
pub async fn sinc_emparejar(app: AppHandle, direccion: String, puerto: u16, codigo: String, nombre: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let codigo: String = codigo.chars().filter(char::is_ascii_digit).collect();
        if codigo.len() != 6 {
            return Err("El código tiene 6 números.".to_string());
        }
        let direccion = direccion.trim().to_string();
        let yo = con_config(&app, |c| Ok(c.id.clone()))?;
        let (s, a) = Spake2::<Ed25519Group>::start_a(&Password::new(codigo.as_bytes()), &Identity::new(ID_EQUIPO), &Identity::new(ID_CENTRO));
        let sin = |e: String| if e == "SIN_CONEXION" { format!("No se pudo conectar con {direccion}:{puerto}.") } else { e };
        let r1 = post(&direccion, puerto, "/emparejar/1", &json!({ "id": yo, "nombre": nombre, "a": B64.encode(a) })).map_err(sin)?;
        let b = B64.decode(r1.get("b").and_then(Value::as_str).ok_or("Respuesta inválida del computador.")?).map_err(|e| e.to_string())?;
        let llave: [u8; 32] = s.finish(&b).map_err(|_| "El emparejamiento falló.".to_string())?
            .try_into().map_err(|_| "El emparejamiento falló.".to_string())?;
        let mut sobre = cifrar(&llave, &yo, CONFIRMA)?;
        sobre["id"] = json!(yo);
        let r2 = post(&direccion, puerto, "/emparejar/2", &sobre).map_err(sin)?;
        let ok: Value = serde_json::from_slice(&descifrar(&llave, &yo, &r2)?).map_err(|e| e.to_string())?;
        let centro_id = ok.get("centro").and_then(Value::as_str).unwrap_or_default().to_string();
        let nombre_centro = r1.get("nombre").and_then(Value::as_str).unwrap_or("Computador").to_string();
        con_config(&app, |c| {
            c.centro = Some(Centro { id: centro_id, nombre: nombre_centro.clone(), direccion: direccion.clone(), puerto, llave: B64.encode(llave) });
            Ok(())
        })?;
        Ok(nombre_centro)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Manda la solicitud del motor y devuelve la respuesta del Mac.
#[tauri::command]
pub async fn sinc_enviar(app: AppHandle, solicitud: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = al_centro(&app, json!({ "tipo": "sinc", "solicitud": solicitud }))?;
        r.get("respuesta").cloned().ok_or_else(|| "Respuesta inválida del computador.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct ResultadoFotos {
    bajadas: u32,
    subidas: u32,
}

/// Fotos: baja las que usa este equipo y no tiene; sube las que tiene y el Mac no.
#[tauri::command]
pub async fn sinc_fotos(app: AppHandle, nombres: Vec<String>) -> Result<ResultadoFotos, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = al_centro(&app, json!({ "tipo": "fotos" }))?;
        let del_mac: std::collections::HashSet<String> =
            r.get("nombres").and_then(Value::as_array).into_iter().flatten().filter_map(|v| v.as_str().map(String::from)).collect();
        let mias: std::collections::HashSet<String> = fotos_locales(&app)?.into_iter().collect();
        let mut res = ResultadoFotos { bajadas: 0, subidas: 0 };
        for n in nombres.iter().filter(|n| !mias.contains(*n) && del_mac.contains(*n)) {
            let ruta = crate::adjuntos::ruta(&app, n)?;
            let r = al_centro(&app, json!({ "tipo": "foto_bajar", "nombre": n }))?;
            let b = B64.decode(r.get("datos").and_then(Value::as_str).unwrap_or_default()).map_err(|e| e.to_string())?;
            if es_webp(&b) {
                std::fs::write(ruta, b).map_err(|e| e.to_string())?;
                res.bajadas += 1;
            }
        }
        for n in nombres.iter().filter(|n| mias.contains(*n) && !del_mac.contains(*n)) {
            let b = std::fs::read(crate::adjuntos::ruta(&app, n)?).map_err(|e| e.to_string())?;
            al_centro(&app, json!({ "tipo": "foto_subir", "nombre": n, "datos": B64.encode(b) }))?;
            res.subidas += 1;
        }
        Ok(res)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn sinc_olvidar_centro(app: AppHandle) -> Result<(), String> {
    con_config(&app, |c| {
        c.centro = None;
        Ok(())
    })
}

/// Estado para Ajustes (sin llaves): este equipo, su Mac, y en el Mac los equipos y su dirección.
#[tauri::command]
pub fn sinc_estado(app: AppHandle) -> Result<Value, String> {
    let (id, centro, equipos) = con_config(&app, |c| Ok((c.id.clone(), c.centro.clone(), c.equipos.clone())))?;
    #[cfg(desktop)]
    let (puerto, codigo) = (
        centro::PUERTO_ACTIVO.lock().ok().and_then(|p| *p),
        centro::EMPAREJANDO.lock().ok().and_then(|g| g.as_ref().map(|e| e.codigo.clone())),
    );
    #[cfg(mobile)]
    let (puerto, codigo): (Option<u16>, Option<String>) = (None, None);
    let ips: Vec<String> = if_addrs::get_if_addrs().unwrap_or_default().into_iter()
        .filter(|i| !i.is_loopback() && i.ip().is_ipv4())
        .map(|i| i.ip().to_string())
        .collect();
    Ok(json!({
        "id": id,
        "centro": centro.map(|c| json!({ "nombre": c.nombre, "direccion": c.direccion, "puerto": c.puerto })),
        "equipos": equipos.iter().map(|e| json!({ "id": e.id, "nombre": e.nombre, "emparejado_en": e.emparejado_en, "visto_en": e.visto_en })).collect::<Vec<_>>(),
        "servidor": puerto.map(|p| json!({ "puerto": p, "ips": ips })),
        "codigo": codigo,
    }))
}

// ---------- Android: candado de multicast (sin él, muchos celulares no reciben mDNS) ----------

mod multicast {
    #[cfg(target_os = "android")]
    pub fn con_candado<T>(f: impl FnOnce() -> T) -> T {
        let candado = adquirir().ok();
        let r = f();
        if let Some((vm, lock)) = candado {
            if let Ok(mut env) = vm.attach_current_thread() {
                let _ = env.call_method(lock.as_obj(), "release", "()V", &[]);
            }
        }
        r
    }

    #[cfg(target_os = "android")]
    fn adquirir() -> Result<(jni::JavaVM, jni::objects::GlobalRef), jni::errors::Error> {
        use jni::objects::{JObject, JValue};
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }?;
        let lock = {
            let mut env = vm.attach_current_thread()?;
            let actividad = unsafe { JObject::from_raw(ctx.context().cast()) };
            let app = env.call_method(&actividad, "getApplicationContext", "()Landroid/content/Context;", &[])?.l()?;
            let nombre = env.new_string("wifi")?;
            let wifi = env.call_method(&app, "getSystemService", "(Ljava/lang/String;)Ljava/lang/Object;", &[JValue::Object(&nombre)])?.l()?;
            let etiqueta = env.new_string("cofre-sinc")?;
            let lock = env
                .call_method(&wifi, "createMulticastLock", "(Ljava/lang/String;)Landroid/net/wifi/WifiManager$MulticastLock;", &[JValue::Object(&etiqueta)])?
                .l()?;
            env.call_method(&lock, "acquire", "()V", &[])?;
            env.new_global_ref(lock)?
        };
        Ok((vm, lock))
    }

    #[cfg(not(target_os = "android"))]
    pub fn con_candado<T>(f: impl FnOnce() -> T) -> T {
        f()
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn equipo(codigo: &str) -> (Spake2<Ed25519Group>, Vec<u8>) {
        Spake2::<Ed25519Group>::start_a(&Password::new(codigo.as_bytes()), &Identity::new(ID_EQUIPO), &Identity::new(ID_CENTRO))
    }

    #[test]
    fn emparejar_con_el_codigo_correcto_da_la_misma_llave() {
        let (s, a) = equipo("123456");
        let (b, llave_centro) = llave_spake_centro("123456", &a).unwrap();
        let llave_equipo: [u8; 32] = s.finish(&b).unwrap().try_into().unwrap();
        assert_eq!(llave_equipo, llave_centro);
        // La confirmación del paso 2 se descifra en el centro.
        let sobre = cifrar(&llave_equipo, "equipo-1", CONFIRMA).unwrap();
        assert_eq!(descifrar(&llave_centro, "equipo-1", &sobre).unwrap(), CONFIRMA);
    }

    #[test]
    fn codigo_equivocado_no_pasa_la_confirmacion() {
        let (s, a) = equipo("123457");
        let (b, llave_centro) = llave_spake_centro("123456", &a).unwrap();
        let llave_equipo: [u8; 32] = s.finish(&b).unwrap().try_into().unwrap();
        assert_ne!(llave_equipo, llave_centro);
        let sobre = cifrar(&llave_equipo, "equipo-1", CONFIRMA).unwrap();
        assert!(descifrar(&llave_centro, "equipo-1", &sobre).is_err());
    }

    #[test]
    fn mensaje_alterado_u_otro_equipo_no_se_descifra() {
        let llave = [7u8; 32];
        let mut sobre = cifrar(&llave, "equipo-1", b"{\"tipo\":\"sinc\"}").unwrap();
        assert!(descifrar(&llave, "equipo-2", &sobre).is_err(), "el id del equipo va atado al mensaje");
        let mut c = B64.decode(sobre["c"].as_str().unwrap()).unwrap();
        c[0] ^= 1;
        sobre["c"] = json!(B64.encode(c));
        assert!(descifrar(&llave, "equipo-1", &sobre).is_err());
    }

    #[test]
    fn nonces_distintos_en_cada_mensaje() {
        let llave = [1u8; 32];
        assert_ne!(cifrar(&llave, "x", b"hola").unwrap()["n"], cifrar(&llave, "x", b"hola").unwrap()["n"]);
    }

    #[test]
    fn fecha_iso_como_la_de_la_pagina() {
        assert_eq!(civil(0), (1970, 1, 1));
        assert_eq!(civil(20_734), (2026, 10, 8));
        let f = ahora_iso();
        assert_eq!(f.len(), 24);
        assert!(f.ends_with('Z') && &f[10..11] == "T");
    }
}
