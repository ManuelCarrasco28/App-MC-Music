<div align="center">

  <img src="public/logo.png" alt="MC-Music Logo" width="160" height="160" style="border-radius: 50%;" />

  # 🎵 MC-Music

  **Descargador Inteligente de Videos y Música Multiplataforma para Android y Windows**

  [![Plataformas](https://img.shields.io/badge/Plataformas-Android%20%7C%20Windows-00f2fe?style=for-the-badge&logo=android&logoColor=white)](https://github.com/)
  [![Estado](https://img.shields.io/badge/Estado-100%25%20Aut%C3%B3nomo-10b981?style=for-the-badge&logo=checkmarx&logoColor=white)](https://github.com/)
  [![Licencia](https://img.shields.io/badge/Licencia-MIT-purple?style=for-the-badge)](LICENSE)

  <p align="center">
    MC-Music es una potente aplicación multiplataforma diseñada para extraer y descargar vídeos en <b>MP4</b> y audio en <b>MP3 (320kbps)</b> de alta calidad desde <b>TikTok, YouTube, Instagram y Facebook</b>.
  </p>

</div>

---

## ✨ Características Destacadas

| Característica | Descripción |
| :--- | :--- |
| 📱 **100% Autónomo en Android** | Funciona de manera independiente en tu teléfono sin requerir servidores ni servicios remotos. |
| 🖼️ **Guardado Automático en Galería** | Los videos descargados se insertan de forma instantánea en tu aplicación de **Galería / Fotos** en la carpeta `DCIM/MC-Music`. |
| 🎵 **Extracción de Audio HD** | Convierte y descarga canciones en MP3 de 320kbps con metadatos completos y carátulas. |
| 🎬 **Soporte TikTok Sin Marca de Agua** | Descarga reels y vídeos de TikTok en resolución HD sin marcas de agua molestas. |
| 🎨 **Interfaz Ultra Moderna** | Diseño oscuro premium, vidrio esmerilado (Glassmorphism), animaciones fluidas y previsualización de contenidos. |
| 💻 **App de Escritorio para Windows** | Incluye un instalador `.exe` independiente para tu PC con menú integrado y accesos directos. |

---

## 📲 Redes Sociales Soportadas

- 🎵 **TikTok:** Extracción directa de vídeos HD sin marca de agua y audio MP3.
- 🔴 **YouTube:** Descarga de vídeos en distintas resoluciones (1080p, 720p, 480p) y audio en alta fidelidad.
- 📸 **Instagram:** Reels y publicaciones descargables en máxima resolución.
- 🔵 **Facebook:** Extracción rápida de Reels y vídeos compartidos.

---

## 📥 Instalación Rápida

### 📱 Android (Móvil)
1. Descarga el archivo de instalación **[MC-Music-1.0.apk](Instaladores/Android_Movil/MC-Music-1.0.apk)** en tu teléfono.
2. Ábrelo e instálalo (si tu teléfono solicita permisos para instalar aplicaciones de fuentes desconocidas, concédelos).
3. ¡Listo! Abre la app y descarga tu música y videos directamente a tu Galería.

### 💻 Windows (PC)
1. Descarga el archivo de instalación **[MC-Music-1.0.exe](Instaladores/Windows_PC/MC-Music-1.0.exe)**.
2. Haz doble clic sobre `MC-Music-1.0.exe` para iniciar el asistente de instalación.
3. Al finalizar, la aplicación creará un acceso directo en tu escritorio listo para usar.

---

## 🧰 Tecnologías Utilizadas

- **Frontend Core:** React 19 + Vite 6
- **Animaciones & UI:** Framer Motion + Lucide React Icons + Custom Vanilla CSS
- **Motor Móvil (Android):** Capacitor 8 + Plugin Nativo Java `MediaDownloaderPlugin` (Scoped Storage & MediaStore API)
- **Motor de Escritorio (Windows):** Electron 43 + Electron Builder + Node.js Express Server
- **Extracción Autónomo:** OpenGraph + TikWM + oEmbed Converters Client Engine

---

## 🛠️ Guía para Desarrolladores

Si deseas clonar y ejecutar el proyecto localmente en tu máquina:

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/MC-Music.git
cd MC-Music
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Modo Desarrollo

- **Modo Web & Servidor Local:**
  ```bash
  npm run dev
  ```
- **Modo Escritorio (Electron):**
  ```bash
  npm run desktop:dev
  ```

---

## 📦 Comandos para Compilar Instaladores

- **Generar APK para Android (`MC-Music-1.0.apk`):**
  ```bash
  npm run android:debug
  ```

- **Generar Ejecutable para Windows (`MC-Music-1.0.exe`):**
  ```bash
  npm run desktop:build
  ```

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Puedes usarlo, modificarlo y distribuirlo libremente.

<div align="center">
  <sub>Desarrollado con ❤️ para brindar la mejor experiencia de descarga en Android y Windows.</sub>
</div>
