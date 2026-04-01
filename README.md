# Video Downloader App

Descarga videos de **TikTok** y **Meta Ads Library** sin marca de agua, desde una interfaz web local.

## Requisitos

- Node.js 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado en el sistema
- ffmpeg (para mezclar video+audio en algunos formatos)

## 1. Instalar yt-dlp

### macOS (Homebrew — recomendado)
```bash
brew install yt-dlp ffmpeg
```

### pip (multiplataforma)
```bash
pip install yt-dlp
# ffmpeg: https://ffmpeg.org/download.html
```

### Windows (winget)
```bash
winget install yt-dlp
winget install ffmpeg
```

### Descarga directa
Descarga el binario desde https://github.com/yt-dlp/yt-dlp/releases y ponlo en tu PATH.

## 2. Instalar y correr la app

```bash
npm install
npm start
```

Abre http://localhost:3000 en tu navegador.

## Uso

1. Pega una o varias URLs (una por línea) en el área de texto.
2. Selecciona la fuente: **TikTok** o **Meta Ads Library**.
3. Haz clic en **Descargar Todo**.
4. Espera a que cada video termine — verás el progreso en tiempo real.
5. Haz clic en **Descargar archivo** para guardar el video en tu equipo.

## Notas

- Los archivos se guardan temporalmente en la carpeta `/downloads`.
- Usa el botón **Eliminar** para borrar el archivo del servidor tras descargarlo.
- Timeout por video: 5 minutos.
- Para Meta Ads Library, algunas URLs requieren estar autenticado en Facebook. Si falla, prueba con la URL directa del video del anuncio.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm start` | Inicia el servidor |
| `npm run dev` | Inicia con nodemon (auto-reload) |
