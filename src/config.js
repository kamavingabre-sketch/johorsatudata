const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(SECRET_FILE)) {
  fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
}
const SECRET = (process.env.JWT_SECRET || fs.readFileSync(SECRET_FILE, 'utf8')).trim();

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOADS_DIR,
  PUBLIC_DIR,
  SECRET,
  PORT: parseInt(process.env.PORT || '4000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  APP_NAME: 'JohorSatuData',
  APP_TAGLINE: 'Pendataan Usaha Kecamatan Medan Johor',
};
