const jwt = require('jsonwebtoken');
const { SECRET } = require('./config');

const COOKIE = 'johor1data';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, nama: user.nama, role: user.role },
    SECRET,
    { expiresIn: '12h' }
  );
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token, req) {
  const secure = !!(req && (req.headers['x-forwarded-proto'] === 'https' || req.secure));
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE_MS / 1000}; SameSite=Lax${secure ? '; Secure' : ''}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali.' });
  }
}

function requireSuper(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin')
    return res.status(403).json({ error: 'Akses khusus Superadmin.' });
  next();
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Izinkan embedding di iframe (untuk preview) + SAMEORIGIN fallback
  res.removeHeader('X-Frame-Options');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  // CSP: izinkan tile dari provider peta + resources lokal
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.arcgisonline.com https://server.arcgisonline.com https://unpkg.com",
      "connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.arcgisonline.com",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      "frame-ancestors 'self' *",
    ].join('; ')
  );
  next();
}

// ---- simple in-memory rate limiter (login) ----
const buckets = new Map();
function rateLimit(key, limit = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count > limit;
}

function cleanPhone(v) {
  return String(v || '').replace(/[^0-9+\-\s]/g, '').trim();
}

function toBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'ya';
}

module.exports = {
  COOKIE,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireSuper,
  clientIp,
  securityHeaders,
  rateLimit,
  cleanPhone,
  toBool,
};
