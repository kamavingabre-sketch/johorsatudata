const path = require('path');
const express = require('express');
const config = require('./src/config');
const { init, ENUMS, db } = require('./src/db');
const { securityHeaders } = require('./src/util');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));

/* ---------- routes ---------- */
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/fields', require('./src/routes/fields'));
app.use('/api/businesses', require('./src/routes/businesses'));
app.use('/api/disasters', require('./src/routes/disasters'));
app.use('/api/worship', require('./src/routes/worship'));
app.use('/api', require('./src/routes/stats'));
app.use('/api', require('./src/routes/logs'));

app.get('/api/meta', (req, res) => {
  res.json({
    app: { name: config.APP_NAME, tagline: config.APP_TAGLINE },
    enums: {
      jenis: ENUMS.JENIS,
      kategori: ENUMS.KATEGORI,
      keamanan: ENUMS.KEAMANAN,
      jenis_bencana: ENUMS.JENIS_BENCANA,
      jenis_ibadah: ENUMS.JENIS_IBADAH,
    },
    center: [3.5786, 98.6373],
    zoom: 14,
  });
});

app.get('/healthz', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

/* ---------- static ---------- */
app.use('/uploads', express.static(config.UPLOADS_DIR, { maxAge: '7d', immutable: true }));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist'), { maxAge: '30d' }));
app.use(express.static(config.PUBLIC_DIR, { maxAge: '5m', index: 'index.html' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

/* ---------- error handler ---------- */
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Terjadi kesalahan pada server.' });
});

(async () => {
  try {
    await init();
    app.listen(config.PORT, config.HOST, () => {
      console.log(`${config.APP_NAME} berjalan di http://${config.HOST}:${config.PORT}`);
      console.log(`Folder data   : ${config.DATA_DIR}`);
      console.log(`Folder upload : ${config.UPLOADS_DIR}`);
    });
  } catch (e) {
    console.error('Gagal memulai server:', e);
    process.exit(1);
  }
})();
