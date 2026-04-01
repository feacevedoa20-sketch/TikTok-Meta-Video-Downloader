const express = require('express');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(require('os').tmpdir(), 'video-downloader-files');
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// In-memory job store
const jobs = new Map();

app.use(express.json());

// Optional password protection — set SITE_PASSWORD env variable to enable
const SITE_PASSWORD = process.env.SITE_PASSWORD;
if (SITE_PASSWORD) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Basic ')) {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString();
      const pass = decoded.split(':').slice(1).join(':');
      if (pass === SITE_PASSWORD) return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Video Downloader"');
    res.status(401).send('Acceso no autorizado');
  });
}

app.use(express.static(path.join(__dirname, 'public')));

// Check if yt-dlp is installed
function getYtDlpPath() {
  const candidates = ['yt-dlp', '/usr/local/bin/yt-dlp', '/opt/homebrew/bin/yt-dlp', '/usr/bin/yt-dlp'];
  for (const candidate of candidates) {
    try {
      execSync(`${candidate} --version`, { stdio: 'ignore' });
      return candidate;
    } catch {
      // not found at this path
    }
  }
  return null;
}

// Build yt-dlp args based on source
function buildArgs(url, source, outputTemplate) {
  const baseArgs = [
    '--no-check-certificate',
    '--no-embed-metadata',
    '--no-embed-thumbnail',
    '--no-playlist',
    '-o', outputTemplate,
  ];

  if (source === 'tiktok') {
    return [
      ...baseArgs,
      '-f', 'bestvideo[vcodec^=h264][format_id!*=watermark]+bestaudio/bestvideo[format_id!*=watermark]+bestaudio/best[format_id!*=watermark]/best',
      '--merge-output-format', 'mp4',
      url,
    ];
  }

  if (source === 'meta') {
    return [
      ...baseArgs,
      '-f', 'bestvideo+bestaudio/best',
      '--merge-output-format', 'mp4',
      '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      url,
    ];
  }

  // Generic fallback
  return [...baseArgs, '-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4', url];
}

// POST /api/download — start a download job
app.post('/api/download', (req, res) => {
  const { url, source } = req.body;

  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'URL inválida.' });
  }
  if (!['tiktok', 'meta'].includes(source)) {
    return res.status(400).json({ error: 'Fuente inválida. Usa "tiktok" o "meta".' });
  }

  const ytDlp = getYtDlpPath();
  if (!ytDlp) {
    return res.status(500).json({
      error: 'yt-dlp no está instalado.',
      instructions: 'Instala yt-dlp con: brew install yt-dlp  (macOS)  |  pip install yt-dlp  (pip)  |  winget install yt-dlp  (Windows)',
    });
  }

  const jobId = uuidv4();
  const outputTemplate = path.join(DOWNLOADS_DIR, `${jobId}_%(title).80s.%(ext)s`);

  const job = {
    id: jobId,
    url,
    source,
    status: 'pending',
    progress: '',
    filePath: null,
    fileName: null,
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  const args = buildArgs(url, source, outputTemplate);
  const proc = spawn(ytDlp, args, { timeout: JOB_TIMEOUT_MS });

  job.status = 'downloading';
  job.process = proc;

  let stderr = '';

  proc.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) job.progress = line;
  });

  proc.stderr.on('data', (data) => {
    stderr += data.toString();
    const line = data.toString().trim();
    if (line) job.progress = line;
  });

  proc.on('close', (code) => {
    delete job.process;
    if (code === 0) {
      const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(jobId));
      if (files.length > 0) {
        job.filePath = path.join(DOWNLOADS_DIR, files[0]);
        job.fileName = files[0].replace(`${jobId}_`, '');
        job.status = 'done';
      } else {
        job.status = 'error';
        job.error = 'Archivo no encontrado tras la descarga.';
      }
    } else {
      job.status = 'error';
      const errorLine = stderr.split('\n').find(l => l.includes('ERROR') || l.includes('error')) || stderr.slice(-300);
      job.error = errorLine || `El proceso terminó con código ${code}.`;
    }
  });

  proc.on('error', (err) => {
    delete job.process;
    job.status = 'error';
    job.error = err.message;
  });

  setTimeout(() => {
    if (job.status === 'downloading') {
      if (job.process) job.process.kill();
      job.status = 'error';
      job.error = 'Tiempo de espera agotado (5 minutos).';
    }
  }, JOB_TIMEOUT_MS);

  res.json({ jobId });
});

// GET /api/status/:jobId — poll job status
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job no encontrado.' });

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    fileName: job.fileName,
    error: job.error,
  });
});

// GET /api/file/:jobId — stream file to browser
app.get('/api/file/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.status !== 'done' || !job.filePath) {
    return res.status(404).json({ error: 'Archivo no disponible.' });
  }
  if (!fs.existsSync(job.filePath)) {
    return res.status(404).json({ error: 'El archivo fue eliminado.' });
  }

  const rawName = path.basename(job.fileName || 'video.mp4');
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, '').replace(/["/\\]/g, '_').trim() || 'video.mp4';
  const encodedName = encodeURIComponent(rawName);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(job.filePath);
});

// DELETE /api/cleanup/:jobId — remove temp file and job
app.delete('/api/cleanup/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job no encontrado.' });

  if (job.filePath && fs.existsSync(job.filePath)) {
    fs.unlinkSync(job.filePath);
  }
  jobs.delete(req.params.jobId);
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  const ytDlp = getYtDlpPath();
  console.log(`\n  Video Downloader corriendo en http://localhost:${PORT}`);
  if (!ytDlp) {
    console.warn('\n  ADVERTENCIA: yt-dlp no encontrado.');
    console.warn('  Instala con:  brew install yt-dlp   (macOS)');
    console.warn('                pip install yt-dlp    (pip)\n');
  } else {
    console.log(`  yt-dlp encontrado en: ${ytDlp}\n`);
  }
});
