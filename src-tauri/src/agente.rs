//! Agente diario de macOS (LaunchAgent) que abre Cofre con `--revisar`. Solo escritorio.

#[cfg(target_os = "macos")]
use crate::alertas::ARG_REVISAR;
use std::path::PathBuf;

const ETIQUETA: &str = "co.cofre.alertas";

fn ruta_plist() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "No se encontró la carpeta de usuario.".to_string())?;
    Ok(PathBuf::from(home).join("Library/LaunchAgents").join(format!("{ETIQUETA}.plist")))
}

#[cfg(target_os = "macos")]
fn launchctl(args: &[&str]) -> Result<(), String> {
    let salida = std::process::Command::new("launchctl").args(args).output().map_err(|e| e.to_string())?;
    if salida.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&salida.stderr).trim().to_string()) }
}

#[cfg(target_os = "macos")]
fn dominio() -> Result<String, String> {
    let salida = std::process::Command::new("id").arg("-u").output().map_err(|e| e.to_string())?;
    Ok(format!("gui/{}", String::from_utf8_lossy(&salida.stdout).trim()))
}

/// Hora programada ("HH:MM") si el agente está instalado.
#[tauri::command]
pub fn agente_estado() -> Result<Option<String>, String> {
    let ruta = ruta_plist()?;
    let Ok(texto) = std::fs::read_to_string(&ruta) else { return Ok(None) };
    let num = |clave: &str| -> u32 {
        texto.split(&format!("<key>{clave}</key>")).nth(1)
            .and_then(|r| r.split("<integer>").nth(1))
            .and_then(|r| r.split("</integer>").next())
            .and_then(|n| n.trim().parse().ok()).unwrap_or(0)
    };
    Ok(Some(format!("{:02}:{:02}", num("Hour"), num("Minute"))))
}

#[tauri::command]
pub fn agente_activar(hora: u32, minuto: u32) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    { let _ = (hora, minuto); return Err("La revisión diaria por ahora solo funciona en macOS.".into()); }
    #[cfg(target_os = "macos")]
    {
        if hora > 23 || minuto > 59 { return Err("La hora no es válida.".into()); }
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe = exe.to_string_lossy();
        if exe.contains("/target/debug/") {
            return Err("La revisión diaria funciona con la app empaquetada (npm run tauri build), no en modo desarrollo.".into());
        }
        let plist = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{ETIQUETA}</string>
  <key>ProgramArguments</key>
  <array><string>{exe}</string><string>{ARG_REVISAR}</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>{hora}</integer><key>Minute</key><integer>{minuto}</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
"#, exe = escapar(&exe));
        let ruta = ruta_plist()?;
        if let Some(carpeta) = ruta.parent() { std::fs::create_dir_all(carpeta).map_err(|e| e.to_string())?; }
        let dom = dominio()?;
        let r = ruta.to_string_lossy().to_string();
        let _ = launchctl(&["bootout", &dom, &r]); // si ya estaba cargado
        std::fs::write(&ruta, plist).map_err(|e| e.to_string())?;
        launchctl(&["bootstrap", &dom, &r]).map_err(|e| format!("No se pudo activar el agente: {e}"))
    }
}

#[tauri::command]
pub fn agente_desactivar() -> Result<(), String> {
    let ruta = ruta_plist()?;
    #[cfg(target_os = "macos")]
    if let Ok(dom) = dominio() {
        let _ = launchctl(&["bootout", &dom, &ruta.to_string_lossy()]);
    }
    match std::fs::remove_file(&ruta) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(target_os = "macos")]
fn escapar(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}
