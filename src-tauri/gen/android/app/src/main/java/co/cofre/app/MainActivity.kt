package co.cofre.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // Barras del sistema en dp, para el área segura de la página (pantalla.svelte.ts).
  @Volatile private var arriba = 0f
  @Volatile private var abajo = 0f
  private var vista: WebView? = null
  // Foto compartida desde otra app (menú «Compartir» → Cofre), en base64, hasta que la página la tome.
  @Volatile private var compartida: String? = null
  @Volatile private var tipoCompartida: String = "image/jpeg"
  // Atajo del ícono pendiente para la página («nuevo»), hasta que lo tome.
  @Volatile private var atajo: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // Celular: solo vertical. La tablet (ancho mínimo ≥ 600 dp) gira libre.
    if (resources.configuration.smallestScreenWidthDp < 600) {
      requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { v, insets ->
      val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val d = resources.displayMetrics.density
      arriba = b.top / d
      abajo = b.bottom / d
      // Si la página ya cargó, que vuelva a leerlas.
      vista?.post { vista?.evaluateJavascript("dispatchEvent(new Event('cofre-area'))", null) }
      ViewCompat.onApplyWindowInsets(v, insets)
    }
    leerCompartida(intent)
    leerAtajo(intent)

    // «Atrás»: primero la página (cierra la hoja o vuelve de pantalla, lib/atras.ts); solo si
    // no hace nada (estás en Inicio) Android sigue con lo suyo y sale de la app.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val w = vista
        if (w == null) { salir(); return }
        w.evaluateJavascript("(window.cofreAtras ? window.cofreAtras() : false)") { r ->
          if (r != "true") salir()
        }
      }
      private fun salir() {
        isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        isEnabled = true
      }
    })
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    leerCompartida(intent)
    leerAtajo(intent)
  }

  /** Atajos del ícono (res/xml/shortcuts.xml). «Factura» abre aquí mismo cámara o galería. */
  private fun leerAtajo(intent: Intent?) {
    when (intent?.action) {
      "co.cofre.app.NUEVO_GASTO" -> {
        intent.action = null
        atajo = "nuevo"
        vista?.post { vista?.evaluateJavascript("dispatchEvent(new Event('cofre-atajo'))", null) }
      }
      "co.cofre.app.FACTURA" -> {
        intent.action = null
        // Con Cofre cerrado, el selector se abría sobre la pantalla de inicio: se espera a que la página
        // esté lista (ella toma el atajo «factura» y llama a CofreAtajo.factura()).
        if (vista == null) atajo = "factura" else elegirFactura()
      }
    }
  }

  /** Selector de Android: «Elegir de la galería» y, si se puede, la cámara. La foto sigue el camino de «Compartir». */
  private fun elegirFactura() {
    val galeria = Intent(Intent.ACTION_GET_CONTENT).apply { type = "image/*"; addCategory(Intent.CATEGORY_OPENABLE) }
    val elegir = Intent.createChooser(galeria, "Foto de la factura")
    var fotoCamara: Uri? = null
    if (puedeUsarCamara()) {
      try {
        val dir = File(cacheDir, "facturas").apply { mkdirs() }
        val archivo = File.createTempFile("factura_", ".jpg", dir)
        fotoCamara = FileProvider.getUriForFile(this, "$packageName.fileprovider", archivo)
        val camara = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
          putExtra(MediaStore.EXTRA_OUTPUT, fotoCamara)
          addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        if (camara.resolveActivity(packageManager) != null) elegir.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camara))
        else fotoCamara = null
      } catch (_: Exception) { fotoCamara = null }
    }
    val camaraUri = fotoCamara
    try {
      launchActivityForResult(elegir) { r ->
        if (r?.resultCode != Activity.RESULT_OK) return@launchActivityForResult
        val uri = r.data?.data ?: camaraUri ?: return@launchActivityForResult
        leerFoto(uri)
      }
    } catch (_: Exception) { }
  }

  /** Resumen de «Me deben»: escribe la imagen (JPEG o PNG) en cache/compartir y abre el menú «Compartir». */
  private fun compartirImagen(base64: String, nombre: String): Boolean = try {
    val dir = File(cacheDir, "compartir").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
    val seguro = nombre.replace(Regex("[^A-Za-z0-9._-]"), "-").ifBlank { "Cofre.jpg" }
    val png = seguro.endsWith(".png")
    val archivo = File(dir, if (png || seguro.endsWith(".jpg")) seguro else "$seguro.jpg")
    archivo.writeBytes(Base64.decode(base64, Base64.DEFAULT))
    val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", archivo)
    val enviar = Intent(Intent.ACTION_SEND).apply {
      type = if (png) "image/png" else "image/jpeg"
      putExtra(Intent.EXTRA_STREAM, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    runOnUiThread { startActivity(Intent.createChooser(enviar, "Compartir resumen")) }
    true
  } catch (_: Exception) { false }

  /** Si la app declara el permiso de cámara (algún complemento), solo se usa con permiso concedido. */
  private fun puedeUsarCamara(): Boolean {
    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) return true
    return try {
      val pedidos = packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS).requestedPermissions
      pedidos?.contains(Manifest.permission.CAMERA) != true
    } catch (_: Exception) { false }
  }

  /** «Compartir → Cofre» con una imagen: la lee y avisa a la página (evento `cofre-compartido`). */
  private fun leerCompartida(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("image/") != true) return
    val uri: Uri = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      else @Suppress("DEPRECATION") intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)) ?: return
    intent.action = null // que no se vuelva a leer al girar o volver
    leerFoto(uri)
  }

  /** Lee la foto (compartida o elegida con el atajo) y avisa a la página (evento `cofre-compartido`). */
  private fun leerFoto(uri: Uri) {
    Thread {
      try {
        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@Thread
        tipoCompartida = contentResolver.getType(uri) ?: "image/jpeg"
        compartida = Base64.encodeToString(bytes, Base64.NO_WRAP)
        vista?.post { vista?.evaluateJavascript("dispatchEvent(new Event('cofre-compartido'))", null) }
      } catch (_: Exception) { }
    }.start()
  }

  override fun onWebViewCreate(webView: WebView) {
    vista = webView
    // Sin zoom con los dedos ni doble toque: la app ya respeta el tamaño de letra de Android.
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun arriba(): Float = this@MainActivity.arriba
      @JavascriptInterface fun abajo(): Float = this@MainActivity.abajo
    }, "CofreAreaSegura")
    webView.addJavascriptInterface(object {
      /** Devuelve la foto compartida (base64) una sola vez, o null. */
      @JavascriptInterface fun tomar(): String? { val f = compartida; compartida = null; return f }
      @JavascriptInterface fun tipo(): String = this@MainActivity.tipoCompartida
    }, "CofreCompartido")
    webView.addJavascriptInterface(object {
      /** Comparte una imagen PNG (base64) con el menú «Compartir» de Android (WhatsApp, etc.). */
      @JavascriptInterface fun imagen(base64: String, nombre: String): Boolean = compartirImagen(base64, nombre)
    }, "CofreCompartir")
    webView.addJavascriptInterface(object {
      /** Devuelve el atajo pendiente («nuevo») una sola vez, o null. */
      @JavascriptInterface fun tomar(): String? { val a = atajo; atajo = null; return a }
      /** La página ya cargó: abre el selector de foto de la factura. */
      @JavascriptInterface fun factura() { runOnUiThread { elegirFactura() } }
    }, "CofreAtajo")
  }
}
