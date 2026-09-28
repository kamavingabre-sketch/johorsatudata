/* ========================================
   App Core Module — API helpers, UI utilities
   ======================================== */

const App = (() => {
  let meta = null;
  let customFields = [];

  async function fetchMeta() {
    if (meta) return meta;
    const res = await fetch('/api/meta');
    meta = await res.json();
    return meta;
  }

  async function fetchFields() {
    const res = await fetch('/api/fields');
    const data = await res.json();
    customFields = (data.fields || []).filter(f => !f.isSystem && f.active);
    return data.fields;
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        Toast.error('Sesi berakhir. Silakan login kembali.');
        setTimeout(() => window.location.href = '/', 1500);
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function parseDate(d) {
    if (!d) return null;
    // SQLite returns "YYYY-MM-DD HH:MM:SS" — replace space with T for ISO format
    const s = String(d);
    if (s.includes('T')) return new Date(s);
    if (s.includes(' ')) return new Date(s.replace(' ', 'T') + 'Z');
    return new Date(s + 'T00:00:00Z');
  }

  function formatDate(d) {
    const date = parseDate(d);
    if (!date || isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateTime(d) {
    const date = parseDate(d);
    if (!date || isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function initials(name) {
    return String(name || '').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function kategoriIcon(kat) {
    const map = {
      'PERDAGANGAN': '🛒',
      'KULINER': '🍽️',
      'JASA PERAWATAN KECANTIKAN': '💄',
      'JASA PERBAIKAN DAN TEKNIK': '🔧',
      'LAUNDRY DAN DOORSMEER': '👔',
      'PRODUKSI DAN INDUSTRI RUMAH TANGGA': '🏭',
      'PERTANIAN': '🌾',
      'PERIKANAN': '🐟',
      'PETERNAKAN': '🐄',
    };
    return map[kat] || '🏪';
  }

  return { fetchMeta, fetchFields, api, formatDate, formatDateTime, escapeHtml, debounce, initials, kategoriIcon, getMeta: () => meta, getFields: () => customFields };
})();

/* ========================================
   Toast Notifications
   ======================================== */

const Toast = (() => {
  const container = () => document.getElementById('toastContainer');

  function show(msg, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container()?.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(100px)';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  return {
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error', 6000),
    warning: (m) => show(m, 'warning'),
    info: (m) => show(m, 'info'),
  };
})();

/* ========================================
   Modal Manager
   ======================================== */

const Modal = (() => {
  let current = null;

  function open(content, opts = {}) {
    close();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${opts.large ? 'modal-lg' : ''}">
        <div class="modal-header">
          <h3>${App.escapeHtml(opts.title || 'Dialog')}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">${content}</div>
        ${opts.footer ? `<div class="modal-footer">${opts.footer}</div>` : ''}
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('modalContainer').appendChild(overlay);
    current = overlay;
    if (opts.onOpen) opts.onOpen(overlay);
    return overlay;
  }

  function close() {
    if (current) { current.remove(); current = null; }
  }

  function confirm(title, message, onConfirm) {
    open(
      `<p>${App.escapeHtml(message)}</p>`,
      {
        title,
        footer: `
          <button class="btn btn-secondary" onclick="Modal.close()">Batal</button>
          <button class="btn btn-danger" id="confirmBtn">Ya, Lanjutkan</button>
        `,
        onOpen: (el) => {
          el.querySelector('#confirmBtn').addEventListener('click', () => {
            close();
            onConfirm();
          });
        },
      }
    );
  }

  return { open, close, confirm };
})();
