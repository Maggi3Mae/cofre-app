# Cofre

**Tus finanzas, en tus manos.** Una app de finanzas personales pensada para Colombia, donde todos los datos viven en tu equipo. No hay cuentas, servidores ni suscripciones.

Funciona en Mac, Windows (en pruebas) y Android (celular y tablet).

## Qué hace

- **Panorama general:** patrimonio, lo que entró y salió en el mes, evolución, categorías y comercios donde más gastas.
- **Cuentas:** débito, tarjetas de crédito (con cupo, corte, pago, tasa y compras a cuotas) y efectivo, en pesos y dólares (TRM).
- **Movimientos:** registro rápido con sugerencias, categorías, etiquetas, foto de la factura y lectura del QR de la DIAN o del texto con OCR.
- **Importar extractos** de BBVA (ahorros y crédito) y Nequi en PDF, Excel o CSV. Detecta transferencias, duplicados y aprende tus categorías. Si tu banco no está en la lista, le enseñas el formato una vez.
- **Presupuestos** por categoría, con avisos al 80, 90 y 100 % y aviso del ritmo de gasto.
- **Inversiones:** CDT con retención en la fuente y cajitas de ahorro con rendimiento diario y metas.
- **Me deben:** préstamos a personas, abonos, cuotas, gastos divididos y una imagen de resumen para compartir.
- **Recurrentes y suscripciones:** arriendo, servicios o nómina se registran solos o te piden confirmación.
- **Simulador** de compras a cuotas y de CDT.
- **Reportes** por año, mes y cuenta, con descarga a Excel.
- **Alertas** en la app, como notificación y, si lo activas, por correo. También un cierre del mes por correo.
- **Copias de seguridad** cifradas con tu propia contraseña.
- **Sincronización por Wi‑Fi** entre el computador y Android, cifrada de punta a punta y sin pasar por internet.
- Tema claro y oscuro.

## Privacidad

- Todo se guarda en un archivo SQLite en tu equipo.
- Cofre se conecta a internet solo en dos casos, y los dos los activas tú: para consultar la TRM oficial en datos.gov.co y para enviar los correos de alertas con tu propio servidor SMTP.
- Las contraseñas (claves de extractos, correo, copias) van al llavero del sistema, nunca a la base de datos.

## Instalar

Las versiones listas para instalar están en **[Releases](../../releases)**.

### Mac

1. Descarga el `.dmg`, ábrelo y arrastra Cofre a Aplicaciones.
2. La app no está firmada con una cuenta de desarrollador de Apple, así que la primera vez macOS la bloquea. Ábrela de una de estas formas:
   - Clic derecho sobre Cofre → **Abrir** → **Abrir**.
   - O ve a **Ajustes del Sistema → Privacidad y seguridad**, baja hasta el aviso de Cofre y pulsa **Abrir igualmente**.

### Android (celular y tablet)

1. Descarga el `.apk` desde Releases en tu celular.
2. Ábrelo y, si Android lo pide, permite **instalar apps de fuentes desconocidas** para tu navegador o administrador de archivos.
3. Cofre no está en Play Store. Android puede mostrar un aviso de Play Protect; elige **Instalar de todas formas**.

Para sincronizar con el computador (Mac o PC): en el computador ve a Ajustes → Equipos → «Emparejar un equipo», y en Android ve a Más → Sincronizar. Los dos equipos tienen que estar en la misma red Wi‑Fi.

### Windows (en pruebas)

1. Descarga el instalador `Cofre_…_x64-setup.exe` desde Releases y ábrelo. Se instala solo para tu usuario y no pide permisos de administrador.
2. Windows SmartScreen puede avisar que la app no es conocida: **Más información → Ejecutar de todas formas**.
3. La primera vez que abras Cofre, el Firewall de Windows pregunta si puede usar la red: elige **Redes privadas → Permitir**. Eso es lo que deja sincronizar con el celular.

La versión de Windows tiene todo lo de Mac (la revisión diaria usa el Programador de tareas y las claves van al Administrador de credenciales), pero todavía se está probando: si algo falla, abre un *issue*.

## Compilar desde el código

### Mac

1. Herramientas de Apple: `xcode-select --install`
2. Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. Node.js LTS desde https://nodejs.org
4. En la carpeta del proyecto: `npm install`
5. Modo desarrollo: `npm run tauri dev`. Para crear el instalador `.dmg`: `npm run tauri build`.

### Windows

1. [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), con la carga de trabajo «Desarrollo para el escritorio con C++».
2. WebView2: ya viene en Windows 10 (actualizado) y 11.
3. Rust desde https://rustup.rs (elige la opción MSVC).
4. Node.js LTS desde https://nodejs.org
5. En la carpeta del proyecto: `npm install` y luego `npm run tauri dev`, o `npm run tauri build` para el instalador.

### Android

Sigue la guía de [ANDROID.md](ANDROID.md): Android Studio, SDK/NDK, APK de depuración y APK firmada.

### Probar con datos de ejemplo

`npm run demo` abre Cofre con seis meses de datos inventados (cuentas, movimientos, presupuestos, CDT, cajitas, préstamos y recurrentes), en una base aparte: tus datos no se tocan y no se sincroniza nada.

- `npm run demo -- --celular`: ventana del tamaño de un celular, con el diseño de celular.
- `npm run demo -- --reiniciar`: borra la base de ejemplo y la vuelve a llenar.
- Cada vez deja `extracto-ejemplo.csv` en la carpeta del proyecto: súbelo en Importar para ver cómo reconoce el banco, la cuenta y las categorías.

### Pruebas

- `npm run prueba:sinc`, `npm run prueba:recurrentes` y `npm run prueba:demo`: usan SQLite real.
- `cargo test --lib`, dentro de `src-tauri`.

## Dónde viven tus datos

| Sistema | Ubicación |
|---|---|
| Mac | `~/Library/Application Support/co.cofre.app/` |
| Windows | `%APPDATA%\co.cofre.app\` |
| Android | Carpeta privada de la app |

Ahí están `cofre.db` (la base de datos) y la carpeta `adjuntos/` (las fotos de las facturas).

## Tecnología

Tauri 2 · SvelteKit + TypeScript · SQLite · ECharts · pdf.js · tesseract.js · jsQR. Todo es de código abierto.

## Estructura

- `src/routes`: pantallas.
- `src/lib`: lógica y componentes. Los datos están en `datos/`, los lectores de extractos en `importar/` y la sincronización en `sinc/`.
- `src-tauri/src`: la parte en Rust (archivos, llavero, correo, sincronización, copias).
- `src-tauri/migrations`: el esquema de la base de datos.
- `design/tokens.json`: el sistema de diseño.

## Aviso

Cofre es un proyecto personal sin relación con BBVA, Nu, Nequi ni ningún otro banco. Sus nombres se usan solo para indicar con qué extractos es compatible. Cofre no da asesoría financiera.

La hizo un humano con ayuda de [Claude](https://claude.ai) (Anthropic).

## Licencia

[GPL-3.0-or-later](LICENSE). Puedes usar, estudiar, modificar y compartir Cofre. Si distribuyes una versión modificada, tiene que ser también de código abierto bajo la misma licencia.
