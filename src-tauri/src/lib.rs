use tauri_plugin_sql::{Migration, MigrationKind};

mod adjuntos;
mod alertas;
mod importar;
mod sinc;
// Solo escritorio (Mac): Llavero, agente diario, correo, Excel y TRM desde internet.
#[cfg(desktop)]
mod agente;
#[cfg(desktop)]
mod copias;
#[cfg(desktop)]
mod correo;
#[cfg(desktop)]
mod excel;
#[cfg(desktop)]
mod llavero;
#[cfg(desktop)]
mod trm;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migraciones = || vec![Migration {
        version: 1,
        description: "esquema inicial",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 2,
        description: "indices y categorias por defecto",
        sql: include_str!("../migrations/0002_datos_base.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 3,
        description: "tarjetas, compras a cuotas y ajustes",
        sql: include_str!("../migrations/0003_tarjetas_cuotas.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 4,
        description: "transferencias entre monedas y destinos de inversion",
        sql: include_str!("../migrations/0004_transferencias.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 5,
        description: "importaciones de extractos",
        sql: include_str!("../migrations/0005_importaciones.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 6,
        description: "reglas de categoria y cruce de movimientos",
        sql: include_str!("../migrations/0006_reglas_cruce.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 7,
        description: "facturas: cufe y comercios por nit",
        sql: include_str!("../migrations/0007_facturas.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 8,
        description: "plantillas de extractos de otros bancos",
        sql: include_str!("../migrations/0008_plantillas.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 9,
        description: "presupuestos solo de egreso",
        sql: include_str!("../migrations/0009_presupuestos_alertas.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 10,
        description: "inversiones: cdt y cajitas con transferencias",
        sql: include_str!("../migrations/0010_inversiones.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 11,
        description: "foto adjunta a movimientos",
        sql: include_str!("../migrations/0011_adjuntos.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 12,
        description: "me deben: personas, préstamos, abonos y cuotas",
        sql: include_str!("../migrations/0012_me_deben.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 13,
        description: "gastos grupales",
        sql: include_str!("../migrations/0013_gastos_grupales.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 14,
        description: "sincronizacion",
        sql: include_str!("../migrations/0014_sincronizacion.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 15,
        description: "recurrentes",
        sql: include_str!("../migrations/0015_recurrentes.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        // Notificaciones locales del sistema (alertas de presupuesto y CDT). No usan red.
        .plugin(tauri_plugin_notification::init())
        // Diálogo «Guardar como» para el Excel de Reportes.
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:cofre.db", migraciones())
                // Base aparte para `npm run demo` (datos inventados).
                .add_migrations("sqlite:cofre-demo.db", migraciones())
                .build(),
        )
        .invoke_handler(comandos())
        .setup(|app| {
            use tauri::Manager;
            // Restaurar una copia: se cambia la base antes de que la página la abra.
            #[cfg(desktop)]
            if let Err(e) = copias::aplicar_restauracion(app.handle()) {
                eprintln!("No se pudo aplicar la restauración: {e}");
            }
            // Revisión en segundo plano (agente diario): sin ventana ni ícono en el Dock.
            let revision = alertas::es_revision_proceso();
            #[cfg(target_os = "macos")]
            if revision {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            if let Some(ventana) = app.get_webview_window("main") {
                // `npm run demo -- --celular`: ventana del tamaño de un celular, sin el ancho mínimo.
                if std::env::var("COFRE_DEMO_CELULAR").is_ok_and(|v| v == "1") {
                    let _ = ventana.set_min_size(None::<tauri::LogicalSize<f64>>);
                    let _ = ventana.set_size(tauri::LogicalSize::new(412.0, 915.0));
                    let _ = ventana.center();
                }
                if !revision {
                    let _ = ventana.show();
                }
            }
            // Centro de sincronización: el Mac escucha en la red local mientras Cofre está abierto.
            #[cfg(desktop)]
            if !revision && !std::env::var("COFRE_DEMO").is_ok_and(|v| v == "1") {
                sinc::iniciar_centro(app.handle().clone());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar Cofre");
}

/// Comandos de escritorio: todos.
#[cfg(desktop)]
fn comandos() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        importar::leer_hoja,
        llavero::clave_guardar,
        llavero::claves_todas,
        llavero::clave_borrar,
        llavero::clave_existe,
        alertas::es_revision,
        alertas::salir,
        agente::agente_estado,
        agente::agente_activar,
        agente::agente_desactivar,
        correo::correo_enviar,
        trm::trm_consultar,
        excel::reporte_excel,
        copias::copia_ruta_base,
        copias::copia_hacer,
        copias::copia_listar,
        copias::copia_clave_guardar,
        copias::copia_preparar_restauracion,
        copias::copia_reiniciar,
        adjuntos::adjunto_guardar,
        adjuntos::adjunto_leer,
        adjuntos::adjunto_borrar,
        adjuntos::imagen_guardar,
        sinc::sinc_codigo_nuevo,
        sinc::sinc_codigo_cancelar,
        sinc::sinc_respuesta,
        sinc::sinc_quitar_equipo,
        sinc::sinc_buscar,
        sinc::sinc_emparejar,
        sinc::sinc_enviar,
        sinc::sinc_fotos,
        sinc::sinc_olvidar_centro,
        sinc::sinc_estado,
    ]
}

/// Comandos en Android: sin Llavero, agente, correo, Excel ni TRM (la página los esconde).
#[cfg(mobile)]
fn comandos() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        importar::leer_hoja,
        alertas::es_revision,
        alertas::salir,
        adjuntos::adjunto_guardar,
        adjuntos::adjunto_leer,
        adjuntos::adjunto_borrar,
        sinc::sinc_buscar,
        sinc::sinc_emparejar,
        sinc::sinc_enviar,
        sinc::sinc_fotos,
        sinc::sinc_olvidar_centro,
        sinc::sinc_estado,
    ]
}
