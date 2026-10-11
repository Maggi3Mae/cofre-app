// Exporta un reporte a Excel (.xlsx) con rust_xlsxwriter. Los datos llegan ya calculados desde la
// página (las mismas consultas que se ven en Reportes); aquí solo se escribe el archivo.
use rust_xlsxwriter::{Color, ExcelDateTime, Format, FormatAlign, FormatBorder, Workbook, Worksheet, XlsxError};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Kpi { nombre: String, valor: f64, anterior: f64 }

#[derive(Deserialize)]
pub struct Mes { mes: String, ingresos: f64, egresos: f64 }

#[derive(Deserialize)]
pub struct Categoria { tipo: String, nombre: String, total: f64, porcentaje: f64 }

#[derive(Deserialize)]
pub struct Comercio { comercio: String, veces: u32, total: f64, porcentaje: f64 }

#[derive(Deserialize)]
pub struct Movimiento {
    fecha: String,
    tipo: String,
    cuenta: String,
    categoria: Option<String>,
    comercio: Option<String>,
    notas: Option<String>,
    moneda: String,
    monto: f64,
    pesos: f64,
}

/// Montos en pesos (no centavos). Porcentajes 0–1.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reporte {
    titulo: String,
    filtro: Vec<(String, String)>,
    nombre_anterior: String,
    kpis: Vec<Kpi>,
    tasa_ahorro: Option<f64>,
    ano: i32,
    mensual: Vec<Mes>,
    categorias: Vec<Categoria>,
    comercios: Vec<Comercio>,
    movimientos: Vec<Movimiento>,
    trm: Option<f64>,
}

const VIOLETA: u32 = 0x6D3FE0;
const VIOLETA_SUAVE: u32 = 0xF1ECFE;

struct Formatos { titulo: Format, cab: Format, pesos: Format, usd: Format, pct: Format, fecha: Format, total: Format, etiqueta: Format }

fn formatos() -> Formatos {
    let pesos = "[$$-240A] #,##0;[Red]-[$$-240A] #,##0";
    Formatos {
        titulo: Format::new().set_bold().set_font_size(16).set_font_color(Color::RGB(VIOLETA)),
        cab: Format::new().set_bold().set_font_color(Color::White).set_background_color(Color::RGB(VIOLETA))
            .set_align(FormatAlign::VerticalCenter),
        pesos: Format::new().set_num_format(pesos),
        usd: Format::new().set_num_format("#,##0.00"),
        pct: Format::new().set_num_format("0.0%"),
        fecha: Format::new().set_num_format("dd/mm/yyyy"),
        total: Format::new().set_bold().set_num_format(pesos).set_background_color(Color::RGB(VIOLETA_SUAVE))
            .set_border_top(FormatBorder::Thin),
        etiqueta: Format::new().set_bold(),
    }
}

/// Fila de encabezado, panel congelado y anchos.
fn encabezado(h: &mut Worksheet, fila: u32, columnas: &[(&str, f64)], f: &Formatos) -> Result<(), XlsxError> {
    for (i, (nombre, ancho)) in columnas.iter().enumerate() {
        h.write_with_format(fila, i as u16, *nombre, &f.cab)?;
        h.set_column_width(i as u16, *ancho)?;
    }
    h.set_row_height(fila, 22)?;
    h.set_freeze_panes(fila + 1, 0)?;
    Ok(())
}

fn escribir(r: &Reporte, ruta: &str) -> Result<(), XlsxError> {
    let f = formatos();
    let mut libro = Workbook::new();

    // ---------- Resumen ----------
    let h = libro.add_worksheet().set_name("Resumen")?;
    h.write_with_format(0, 0, &r.titulo, &f.titulo)?;
    let mut fila = 2;
    for (k, v) in &r.filtro {
        h.write_with_format(fila, 0, k, &f.etiqueta)?;
        h.write(fila, 1, v)?;
        fila += 1;
    }
    fila += 1;
    encabezado(h, fila, &[("Concepto", 22.0), ("Período", 18.0), (&r.nombre_anterior, 22.0), ("Variación", 12.0)], &f)?;
    h.set_freeze_panes(0, 0)?;
    for k in &r.kpis {
        fila += 1;
        h.write(fila, 0, &k.nombre)?;
        h.write_with_format(fila, 1, k.valor, &f.pesos)?;
        h.write_with_format(fila, 2, k.anterior, &f.pesos)?;
        if k.anterior != 0.0 {
            h.write_with_format(fila, 3, (k.valor - k.anterior) / k.anterior.abs(), &f.pct)?;
        }
    }
    if let Some(t) = r.tasa_ahorro {
        fila += 2;
        h.write_with_format(fila, 0, "Tasa de ahorro", &f.etiqueta)?;
        h.write_with_format(fila, 1, t, &f.pct)?;
    }
    fila += 2;
    let nota = match r.trm {
        Some(t) => format!("Montos en pesos. Dólares convertidos con TRM {t:.2}. Sin transferencias entre cuentas."),
        None => "Montos en pesos. Sin TRM: los dólares no se suman. Sin transferencias entre cuentas.".into(),
    };
    h.write(fila, 0, nota)?;

    // ---------- Mensual ----------
    let h = libro.add_worksheet().set_name(format!("Mensual {}", r.ano))?;
    encabezado(h, 0, &[("Mes", 14.0), ("Ingresos", 18.0), ("Egresos", 18.0), ("Balance", 18.0)], &f)?;
    for (i, m) in r.mensual.iter().enumerate() {
        let fi = i as u32 + 1;
        h.write(fi, 0, &m.mes)?;
        h.write_with_format(fi, 1, m.ingresos, &f.pesos)?;
        h.write_with_format(fi, 2, m.egresos, &f.pesos)?;
        h.write_formula_with_format(fi, 3, format!("=B{0}-C{0}", fi + 1).as_str(), &f.pesos)?;
    }
    let ft = r.mensual.len() as u32 + 1;
    h.write_with_format(ft, 0, "Total", &f.total)?;
    for (c, l) in [(1u16, 'B'), (2, 'C'), (3, 'D')] {
        h.write_formula_with_format(ft, c, format!("=SUM({l}2:{l}{ft})").as_str(), &f.total)?;
    }

    // ---------- Categorías ----------
    let h = libro.add_worksheet().set_name("Categorías")?;
    encabezado(h, 0, &[("Tipo", 10.0), ("Categoría", 28.0), ("Total", 18.0), ("% del tipo", 12.0)], &f)?;
    for (i, c) in r.categorias.iter().enumerate() {
        let fi = i as u32 + 1;
        h.write(fi, 0, &c.tipo)?;
        h.write(fi, 1, &c.nombre)?;
        h.write_with_format(fi, 2, c.total, &f.pesos)?;
        h.write_with_format(fi, 3, c.porcentaje, &f.pct)?;
    }

    // ---------- Comercios ----------
    let h = libro.add_worksheet().set_name("Comercios")?;
    encabezado(h, 0, &[("#", 5.0), ("Comercio", 32.0), ("Veces", 8.0), ("Total", 18.0), ("% de egresos", 13.0)], &f)?;
    for (i, c) in r.comercios.iter().enumerate() {
        let fi = i as u32 + 1;
        h.write(fi, 0, fi)?;
        h.write(fi, 1, &c.comercio)?;
        h.write(fi, 2, c.veces)?;
        h.write_with_format(fi, 3, c.total, &f.pesos)?;
        h.write_with_format(fi, 4, c.porcentaje, &f.pct)?;
    }

    // ---------- Movimientos ----------
    let h = libro.add_worksheet().set_name("Movimientos")?;
    encabezado(h, 0, &[("Fecha", 12.0), ("Tipo", 10.0), ("Cuenta", 18.0), ("Categoría", 20.0), ("Comercio", 28.0),
        ("Notas", 30.0), ("Moneda", 9.0), ("Monto", 16.0), ("Monto en pesos", 18.0)], &f)?;
    for (i, m) in r.movimientos.iter().enumerate() {
        let fi = i as u32 + 1;
        match ExcelDateTime::parse_from_str(&m.fecha) {
            Ok(d) => h.write_datetime_with_format(fi, 0, &d, &f.fecha)?,
            Err(_) => h.write(fi, 0, &m.fecha)?,
        };
        h.write(fi, 1, &m.tipo)?;
        h.write(fi, 2, &m.cuenta)?;
        h.write(fi, 3, m.categoria.as_deref().unwrap_or("Sin categoría"))?;
        h.write(fi, 4, m.comercio.as_deref().unwrap_or(""))?;
        h.write(fi, 5, m.notas.as_deref().unwrap_or(""))?;
        h.write(fi, 6, &m.moneda)?;
        // Egresos en negativo para que sumar la columna dé el balance.
        let signo = if m.tipo == "Egreso" { -1.0 } else { 1.0 };
        h.write_with_format(fi, 7, signo * m.monto, if m.moneda == "USD" { &f.usd } else { &f.pesos })?;
        h.write_with_format(fi, 8, signo * m.pesos, &f.pesos)?;
    }
    if !r.movimientos.is_empty() {
        h.autofilter(0, 0, r.movimientos.len() as u32, 8)?;
    }

    libro.save(ruta)
}

#[tauri::command]
pub async fn reporte_excel(ruta: String, reporte: Reporte) -> Result<(), String> {
    if !ruta.to_lowercase().ends_with(".xlsx") {
        return Err("El archivo debe terminar en .xlsx".into());
    }
    tauri::async_runtime::spawn_blocking(move || escribir(&reporte, &ruta))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("No se pudo guardar el Excel: {e}"))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn crea_el_archivo() {
        let json = r#"{"titulo":"Reporte octubre de 2026","filtro":[["Período","Octubre de 2026"],["Cuenta","Todas"]],
          "nombreAnterior":"Septiembre de 2026","kpis":[{"nombre":"Ingresos","valor":5000,"anterior":0},{"nombre":"Egresos","valor":1900,"anterior":800}],
          "tasaAhorro":0.62,"ano":2026,"mensual":[{"mes":"ene","ingresos":0,"egresos":0},{"mes":"oct","ingresos":5000,"egresos":1900}],
          "categorias":[{"tipo":"Egreso","nombre":"Comida","total":1500,"porcentaje":0.79}],
          "comercios":[{"comercio":"D1","veces":2,"total":1500,"porcentaje":0.79}],
          "movimientos":[{"fecha":"2026-10-02","tipo":"Egreso","cuenta":"BBVA","categoria":"Comida","comercio":"D1","notas":null,"moneda":"COP","monto":1000,"pesos":1000},
                         {"fecha":"2026-10-03","tipo":"Egreso","cuenta":"Visa","categoria":null,"comercio":"Netflix","notas":"x","moneda":"USD","monto":0.1,"pesos":400}],
          "trm":4000}"#;
        let r: Reporte = serde_json::from_str(json).unwrap();
        let ruta = std::env::temp_dir().join("cofre-prueba.xlsx");
        escribir(&r, ruta.to_str().unwrap()).unwrap();
        assert!(std::fs::metadata(&ruta).unwrap().len() > 3000);
    }
}
