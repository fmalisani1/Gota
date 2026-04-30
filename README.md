# Gota

Metronomo visual inmersivo para ensayos: una gota cae, impacta en agua y marca el pulso con audio sintetizado por Web Audio.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## APK Android

El repo incluye Capacitor para generar un APK nativo debug desde GitHub Actions.

```bash
npm run android:sync
```

Para compilar local en Windows hace falta Java y Android SDK:

```bash
npm run android:debug
```

En GitHub, ejecutar el workflow `Build Android APK` y descargar el artifact `gota-debug-apk`.

## Primer alcance

- React + TypeScript + Vite.
- Visualizacion fullscreen en canvas.
- Audio de gota con scheduler Web Audio.
- BPM, tema actual, compas, controles de transporte y subdivisiones.
- Panel toggleable de temas y panel toggleable de opciones.
- Manifest y service worker base para instalar en Android como PWA.
