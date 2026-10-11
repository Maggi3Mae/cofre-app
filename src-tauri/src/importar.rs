//! Fase 2 · Importar: lectura de Excel/CSV con calamine (las claves de extractos viven en `llavero.rs`).
//! Todo ocurre en el equipo: los bytes llegan desde la ventana y nada sale a la red.

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use serde::Serialize;
use std::io::Cursor;
use tauri::ipc::Request;

#[derive(Serialize)]
pub struct Hoja {
    nombre: String,
    filas: Vec<Vec<String>>,
}

fn celda(d: &Data) -> String {
    match d {
        Data::Empty => String::new(),
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => {
            if f.fract() == 0.0 && f.abs() < 1e15 { format!("{}", *f as i64) } else { f.to_string() }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => dt
            .as_datetime()
            .map(|x| x.to_string().chars().take(10).collect())
            .unwrap_or_else(|| dt.to_string()),
        Data::DateTimeIso(s) => s.chars().take(10).collect(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(_) => String::new(),
    }
}

/// Lee todas las hojas de un .xlsx/.xls/.ods enviado como bytes crudos.
#[tauri::command]
pub fn leer_hoja(request: Request<'_>) -> Result<Vec<Hoja>, String> {
    let Some(bytes) = crate::adjuntos::bytes_cuerpo(request.body()) else {
        return Err("Se esperaba el archivo en bytes.".into());
    };
    let mut libro = open_workbook_auto_from_rs(Cursor::new(bytes))
        .map_err(|e| format!("No se pudo abrir la hoja de cálculo: {e}"))?;
    let mut hojas = Vec::new();
    for nombre in libro.sheet_names() {
        let Ok(rango) = libro.worksheet_range(&nombre) else { continue };
        let filas = rango
            .rows()
            .map(|f| f.iter().map(celda).collect::<Vec<_>>())
            .filter(|f| f.iter().any(|c| !c.is_empty()))
            .collect();
        hojas.push(Hoja { nombre, filas });
    }
    Ok(hojas)
}
