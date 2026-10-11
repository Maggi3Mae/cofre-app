//! Correo opcional de alertas por SMTP; la clave vive en el Llavero. Solo escritorio.

use serde::Deserialize;

pub const CLAVE_CORREO: &str = "correo_smtp";

#[derive(Deserialize)]
pub struct ConfigCorreo {
    pub servidor: String,
    pub puerto: u16,
    pub usuario: String,
    pub destino: String,
}

/// Envía un correo de texto, o HTML + texto si llega `html`. STARTTLS en 587; TLS directo en 465.
#[tauri::command]
pub async fn correo_enviar(config: ConfigCorreo, asunto: String, cuerpo: String, html: Option<String>) -> Result<(), String> {
    let clave = crate::llavero::clave_interna(CLAVE_CORREO)?
        .ok_or("Falta la clave del correo: guárdala en Ajustes.")?;
    tauri::async_runtime::spawn_blocking(move || enviar(config, clave, asunto, cuerpo, html))
        .await
        .map_err(|e| e.to_string())?
}

fn enviar(c: ConfigCorreo, clave: String, asunto: String, cuerpo: String, html: Option<String>) -> Result<(), String> {
    use lettre::message::{header::ContentType, MultiPart};
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};

    let de = format!("Cofre <{}>", c.usuario).parse().map_err(|_| "El usuario del correo no es una dirección válida.")?;
    let para = c.destino.parse().map_err(|_| "El correo de destino no es válido.")?;
    let base = Message::builder().from(de).to(para).subject(asunto);
    let correo = match html {
        // Dos versiones: cada cliente de correo muestra la que puede.
        Some(h) => base.multipart(MultiPart::alternative_plain_html(cuerpo, h)),
        None => base.header(ContentType::TEXT_PLAIN).body(cuerpo),
    }
    .map_err(|e| e.to_string())?;
    let constructor = if c.puerto == 465 { SmtpTransport::relay(&c.servidor) } else { SmtpTransport::starttls_relay(&c.servidor) }
        .map_err(|e| format!("Servidor no válido: {e}"))?;
    let transporte = constructor
        .port(c.puerto)
        .credentials(Credentials::new(c.usuario.clone(), clave))
        .timeout(Some(std::time::Duration::from_secs(20)))
        .build();
    transporte.send(&correo).map(|_| ()).map_err(|e| format!("No se pudo enviar: {e}"))
}
