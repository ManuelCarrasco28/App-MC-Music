<div align="center">

  <img src="public/logo.png" alt="MC-Music Logo" width="160" height="160" style="border-radius: 50%; boxShadow: 0 0 20px rgba(0, 242, 254, 0.4);" />

  # 🎵 MC-Music (v1.0.0)

  **Descargador Inteligente de Videos y Música Multiplataforma para Windows PC y Android**

  [![Versión](https://img.shields.io/badge/Versión-v1.0.0-00f2fe?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ManuelCarrasco28/App-MC-Music/releases)
  [![Plataformas](https://img.shields.io/badge/Plataformas-Windows%20PC%20%7C%20Android-10b981?style=for-the-badge&logo=android&logoColor=white)](https://github.com/ManuelCarrasco28/App-MC-Music/releases)
  [![Licencia](https://img.shields.io/badge/Licencia-MIT-purple?style=for-the-badge)](LICENSE)

  <p align="center">
    MC-Music es una potente aplicación multiplataforma diseñada para descargar y convertir vídeos en <b>MP4</b> y audio en <b>MP3 (hasta 320 kbps)</b> de alta calidad desde <b>YouTube, TikTok, Facebook e Instagram</b>.
  </p>

</div>

---

## ✨ Novedades y Características Destacadas

| Característica | Descripción |
| :--- | :--- |
| 🎬 **Guardado Automático en Galería (Android)** | Los videos descargados en Android se guardan e indexan en la carpeta de sistema **`Movies/MC-Music`** para aparecer al instante en tu aplicación de **Galería / Fotos**. |
| 🎵 **Indexación en Audios y Música (Android)** | Los archivos MP3 se organizan e indexan en **`Music/MC-Music`** para reproducirse en apps como Samsung Music, Xiaomi Música o YT Music. |
| 🖥️ **Aplicación de Escritorio Windows** | Instalador oficial de Windows `.exe` con almacenamiento persistente de configuración en `%APPDATA%\MC-Music\config.json`. |
| ⚡ **Extracción Ultra-Rápida** | Búsqueda acelerada de metadatos con preselección inteligente de resolución recomendada (**1080p Full HD** / **720p HD**) y audio MP3 en **320 kbps**. |
| 🔄 **Sistema de Actualización Inteligente** | Botón discreto `🔄` en la cabecera que consulta lanzamientos nuevos con respaldo directo vía GitHub API. |
| 🎨 **Diseño Moderno & Glassmorphism** | Interfaz oscura premium con vidrio esmerilado, animaciones de alto rendimiento e indicador de estado de servicio en tiempo real. |

---

## 📲 Plataformas y Compatibilidad

- 🔴 **YouTube:** Descarga de videos en resoluciones seleccionables (1080p, 720p, 480p) y conversión directa a audio MP3 (320kbps).
- 🎵 **TikTok:** Extracción directa de videos en calidad HD sin marca de agua y pistas de audio.
- 🔵 **Facebook:** Procesamiento rápido de Reels y publicaciones de video públicas.
- 📸 **Instagram:** Reels y contenidos multimedia HD en la aplicación de escritorio.

---

## 📥 Descarga de Instaladores

| Plataforma | Archivo Instalador | Ubicación en Repositorio |
| :--- | :--- | :--- |
| 💻 **Windows PC** | **[MC-Music-1.0.0.exe](file:///d:/PROYECTOS/Proyectos_Propios/MC-Music/Instaladores/Windows_PC/MC-Music-1.0.0.exe)** | `Instaladores/Windows_PC/MC-Music-1.0.0.exe` |
| 📱 **Android Móvil** | **[MC-Music-1.0.0.apk](file:///d:/PROYECTOS/Proyectos_Propios/MC-Music/Instaladores/Android_Movil/MC-Music-1.0.0.apk)** | `Instaladores/Android_Movil/MC-Music-1.0.0.apk` |

---

## 🧰 Tecnologías Utilizadas

- **Frontend:** React 19 + Vite 6 + Framer Motion + Lucide Icons
- **Estilos:** Vanilla CSS (Glassmorphism + Tokens Tailored + Responsive Layout)
- **Motor Escritorio (Windows):** Electron 43 + Node.js Express Server + `yt-dlp` Bundled Engine
- **Motor Móvil (Android):** Capacitor 8 + Plugin Nativo Java `MediaDownloaderPlugin` (Scoped Storage & MediaStore API)

---

## 🛠️ Guía para Desarrolladores

### 1. Clonar el repositorio
```bash
git clone https://github.com/ManuelCarrasco28/App-MC-Music.git
cd App-MC-Music
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Ejecutar en desarrollo

- **Modo Web / Servidor:**
  ```bash
  npm run dev
  ```
- **Modo Escritorio (Electron):**
  ```bash
  npm run desktop:dev
  ```

---

## 📦 Comandos de Compilación

- **Generar Ejecutable de Windows (`MC-Music-1.0.0.exe`):**
  ```bash
  npm run desktop:build
  ```

- **Generar APK para Android (`MC-Music-1.0.0.apk`):**
  ```bash
  npm run build
  npx cap copy android
  cd android && gradlew.bat assembleRelease
  ```

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**.

<div align="center">
  <sub>Desarrollado con ❤️ por <b>Manuel Carrasco</b> para la mejor experiencia de descarga multimedia en Windows y Android.</sub>
</div>
