//! Revisión diaria que abre Cofre con `--revisar`. Solo escritorio.
//! · macOS: LaunchAgent (~/Library/LaunchAgents/co.cofre.alertas.plist), también al iniciar sesión.
//! · Windows: tarea del Programador de tareas «Cofre\Revision diaria», diaria a la hora elegida y,
//!   si el PC estaba apagado, apenas se pueda (StartWhenAvailable). No necesita permisos de administrador.

#[cfg(any(target_os = "macos", windows))]
use crate::alertas::ARG_REVISAR;
#[cfg(not(windows))]
use std::path::PathBuf;

#[cfg(not(windows))]
const ETIQUETA: &str = "co.cofre.alertas";

#[cfg(windows)]
const TAREA: &str = "Cofre\\Revision diaria";

/// El ejecutable empaquetado (no el de `tauri dev`).
#[cfg(any(target_os = "macos", windows))]
fn exe_empaquetado() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = exe.to_string_lossy().to_string();
    if exe.replace('\\', "/").contains("/target/debug/") {
        return Err("La revisión diaria funciona con la app empaquetada (npm run tauri build), no en modo desarrollo.".into());
    }
    Ok(exe)
}

#[cfg(windows)]
fn schtasks(args: &[&str]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const SIN_VENTANA: u32 = 0x0800_0000; // CREATE_NO_WINDOW
    let salida = std::process::Command::new("schtasks").args(args).creation_flags(SIN_VENTANA)
        .output().map_err(|e| e.to_string())?;
    if salida.status.success() { Ok(String::from_utf8_lossy(&salida.stdout).to_string()) }
    else { Err(String::from_utf8_lossy(&salida.stderr).trim().to_string()) }
}

/// XML de la tarea (schtasks lo pide en UTF-16 con BOM).
#[cfg(windows)]
fn xml_tarea(exe: &str, hora: u32, minuto: u32) -> String {
    format!(r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Cofre: revisa presupuestos, CDT y préstamos una vez al día.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T{hora:02}:{minuto:02}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals><Principal id="Autor"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Autor">
    <Exec><Command>{exe}</Command><Arguments>{ARG_REVISAR}</Arguments></Exec>
  </Actions>
</Task>
"#, exe = escapar(exe))
}

#[cfg(not(windows))]
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
    #[cfg(windows)]
    {
        let Ok(xml) = schtasks(&["/Query", "/TN", TAREA, "/XML"]) else { return Ok(None) };
        let xml = xml.replace('\0', ""); // por si llega en UTF-16
        let hora = xml.split("<StartBoundary>").nth(1).and_then(|r| r.split('T').nth(1))
            .map(|r| r.chars().take(5).collect::<String>()).unwrap_or_else(|| "08:00".into());
        return Ok(Some(hora));
    }
    #[cfg(not(windows))]
    {
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
}

#[tauri::command]
pub fn agente_activar(hora: u32, minuto: u32) -> Result<(), String> {
    if hora > 23 || minuto > 59 { return Err("La hora no es válida.".into()); }
    #[cfg(not(any(target_os = "macos", windows)))]
    { let _ = (hora, minuto); return Err("La revisión diaria solo funciona en macOS y Windows.".into()); }
    #[cfg(windows)]
    {
        let exe = exe_empaquetado()?;
        let xml = xml_tarea(&exe, hora, minuto);
        let ruta = std::env::temp_dir().join("cofre-tarea.xml");
        let mut bytes = vec![0xFF, 0xFE];
        for u in xml.encode_utf16() { bytes.extend_from_slice(&u.to_le_bytes()); }
        std::fs::write(&ruta, bytes).map_err(|e| e.to_string())?;
        let r = schtasks(&["/Create", "/TN", TAREA, "/XML", &ruta.to_string_lossy(), "/F"]);
        let _ = std::fs::remove_file(&ruta);
        return r.map(|_| ()).map_err(|e| format!("No se pudo crear la tarea: {e}"));
    }
    #[cfg(target_os = "macos")]
    {
        let exe = exe_empaquetado()?;
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
    #[cfg(windows)]
    {
        let _ = schtasks(&["/Delete", "/TN", TAREA, "/F"]); // si no existe, no pasa nada
        return Ok(());
    }
    #[cfg(not(windows))]
    {
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
}

#[cfg(any(target_os = "macos", windows))]
fn escapar(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}
