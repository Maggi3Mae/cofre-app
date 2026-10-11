// TRM oficial (Superfinanciera) desde los datos abiertos de datos.gov.co.
// Es la única consulta a internet de Cofre: un GET anónimo que no envía ningún dato de la usuaria.
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

const URL: &str = "https://www.datos.gov.co/resource/32sa-8pi3.json";

#[derive(Deserialize)]
struct Fila {
    /// Socrata lo manda como texto; se acepta también número.
    valor: serde_json::Value,
    vigenciadesde: String,
    vigenciahasta: String,
}

#[derive(Serialize)]
pub struct Trm {
    valor: f64,
    /// «AAAA-MM-DD»
    desde: String,
    hasta: String,
}

/// Interpreta la respuesta (primera fila = la vigente).
fn leer(texto: &str) -> Result<Trm, String> {
    let filas: Vec<Fila> = serde_json::from_str(texto).map_err(|_| "La respuesta de datos.gov.co no se entendió.")?;
    let f = filas.into_iter().next().ok_or("datos.gov.co no devolvió la TRM.")?;
    let valor = match &f.valor {
        serde_json::Value::String(t) => t.trim().parse::<f64>().ok(),
        v => v.as_f64(),
    }
    .filter(|v| *v > 0.0)
    .ok_or("TRM con formato inesperado.")?;
    Ok(Trm { valor, desde: f.vigenciadesde.chars().take(10).collect(), hasta: f.vigenciahasta.chars().take(10).collect() })
}

/// TRM vigente en `hoy` («AAAA-MM-DD», fecha local de la usuaria).
fn consultar(hoy: &str) -> Result<Trm, String> {
    if hoy.len() != 10 || !hoy.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Fecha inválida.".into());
    }
    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    let agente = ureq::AgentBuilder::new()
        .tls_connector(Arc::new(tls))
        .timeout(Duration::from_secs(15))
        .build();
    let texto = agente
        .get(URL)
        .query("$where", &format!("vigenciadesde <= '{hoy}T23:59:59'"))
        .query("$order", "vigenciadesde DESC")
        .query("$limit", "1")
        .call()
        .map_err(|_| "No se pudo consultar la TRM (¿sin internet?).".to_string())?
        .into_string()
        .map_err(|_| "La respuesta de datos.gov.co no se entendió.".to_string())?;
    leer(&texto)
}

#[tauri::command]
pub async fn trm_consultar(hoy: String) -> Result<Trm, String> {
    tauri::async_runtime::spawn_blocking(move || consultar(&hoy))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod pruebas {
    use super::leer;

    #[test]
    fn lee_texto_y_numero() {
        let t = leer(r#"[{"valor":"3273.49","unidad":"COP","vigenciadesde":"2026-10-03T00:00:00.000","vigenciahasta":"2026-10-05T00:00:00.000"}]"#).unwrap();
        assert_eq!((t.valor, t.desde.as_str(), t.hasta.as_str()), (3273.49, "2026-10-03", "2026-10-05"));
        assert_eq!(leer(r#"[{"valor":4000,"vigenciadesde":"2026-01-01","vigenciahasta":"2026-01-01"}]"#).unwrap().valor, 4000.0);
        assert!(leer("[]").is_err());
        assert!(leer(r#"[{"valor":"x","vigenciadesde":"a","vigenciahasta":"b"}]"#).is_err());
    }
}
