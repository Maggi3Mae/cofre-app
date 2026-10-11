# Cofre en Android — preparar el Mac

Una sola vez. Al final tendrás una APK de prueba abriendo en el celular.

## 1. Android Studio y SDK
1. Instala Android Studio: `brew install --cask android-studio` (o desde developer.android.com).
2. Ábrelo → **More Actions → SDK Manager**:
   - **SDK Platforms**: Android 15 (API 35).
   - **SDK Tools**: Android SDK Build-Tools, NDK (Side by side), Android SDK Command-line Tools, Android SDK Platform-Tools.
3. Agrega al final de `~/.zshrc` y abre una terminal nueva:
   ```sh
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 "$ANDROID_HOME/ndk" | tail -1)"
   export PATH="$ANDROID_HOME/platform-tools:$PATH"
   ```

## 2. Rust para Android
```sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## 3. Generar el proyecto Android
```sh
cd ~/ruta/a/cofre
git pull
npm install
npm run tauri android init
```
Crea `src-tauri/gen/android` (va al repo; ya trae su propio `.gitignore` para lo compilado).
Copia los íconos: `cp -R src-tauri/icons/android/* src-tauri/gen/android/app/src/main/res/`

## 4. Primera APK (de prueba, firmada con la llave de depuración)
```sh
npm run tauri android build -- --apk --debug --target aarch64
```
Queda en `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.

## 5. Instalar en el celular
- **Con cable**: en el celular, Ajustes → Acerca del teléfono → toca 7 veces «Número de compilación»; luego Opciones de desarrollador → Depuración USB. Conéctalo y:
  `adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- **Sin cable**: pasa la APK al celular y ábrela (permite «instalar apps desconocidas»).

Debe abrir Cofre con la base vacía (los datos llegan con la sincronización, bloque 6).
Para el uso diario, mejor la APK de publicación (más rápida): ver «APK para el uso diario» abajo.

## APK para el uso diario (firmada con tu llave)
Una sola vez, crea la llave (guárdala junto con sus claves en un lugar seguro: sin ella no se puede actualizar la app):
```sh
mkdir -p ~/llaves
keytool -genkeypair -v -keystore ~/llaves/cofre.jks -alias cofre -keyalg RSA -keysize 2048 -validity 10000
```
Crea `src-tauri/gen/android/keystore.properties` (ya está en `.gitignore`, nunca va al repo):
```
storeFile=/Users/TU_USUARIO/llaves/cofre.jks
storePassword=la clave que pusiste
keyAlias=cofre
keyPassword=la clave que pusiste
```
Arma e instala:
```sh
npm run tauri android build -- --apk --target aarch64
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```
**La primera vez**: la APK de depuración tiene otra firma, así que hay que desinstalarla antes (`adb uninstall co.cofre.app`). Se borran los datos del equipo; vuelve a emparejar con el Mac y llegan solos. Desde ahí, `adb install -r` actualiza sin borrar nada.

Cuando termines, haz commit de `src-tauri/gen/android` y avísame si algo falló (copia el error).

## Probar la sincronización (Mac + celular)

1. **Mac**: `git pull`, `npm install` y abre Cofre con `npm run tauri dev`.
   La primera vez macOS pregunta si Cofre puede aceptar conexiones entrantes y usar la red local → **Permitir**.
2. **Celular**: arma e instala la APK nueva:
   ```
   npm run tauri android build -- --apk --debug --target aarch64
   ~/Library/Android/sdk/platform-tools/adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
   ```
3. **Mac** → Ajustes → Equipos → «Emparejar un equipo». Aparece un código de 6 dígitos.
4. **Celular** → Más → Sincronizar con el Mac: elige tu Mac en la lista (o «Escribir la dirección» con la que muestra el Mac), escribe el código en las 6 casillas y «Emparejar». (En la tablet: Ajustes → Sincronizar con el Mac.)
5. Debe traer todos tus datos del Mac. Prueba:
   - Anota un gasto en el celular → en unos segundos aparece en el Mac (Transacciones).
   - Edita algo en el Mac → en el celular, jala hacia abajo (o «Sincronizar ahora»).
   - Borra algo en un lado → desaparece en el otro.
   - Una foto de factura adjunta en el Mac → aparece en el celular.

Si algo falla, copia el mensaje de error que sale en Más → Sincronizar con el Mac.
