/* ========================================
   App Core Module — API helpers, UI utilities
   ======================================== */

const App = (() => {
  let meta = null;
  let categoriesCache = null;

  async function fetchMeta() {
    if (meta) return meta;
    const res = await fetch('/api/meta');
    meta = await res.json();
    return meta;
  }

  // Daftar kategori data (sistem + buatan Superadmin), di-cache untuk menghindari
  // pemanggilan berulang saat membangun tautan ekspor.
  async function fetchCategories() {
    if (categoriesCache) return categoriesCache;
    const data = await api('/api/categories');
    categoriesCache = data.categories || [];
    return categoriesCache;
  }

  async function categoryIdByName(name) {
    const cats = await fetchCategories();
    const found = cats.find((c) => c.name === name);
    return found ? found.id : null;
  }

  // Bangun URL unduhan ekspor (CSV/Excel) untuk satu kategori, dengan filter opsional.
  function exportUrl(categoryId, format, params = {}) {
    const qs = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    }
    return `/api/export/${categoryId}?${qs.toString()}`;
  }

  function triggerDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Markup tombol ekspor CSV/Excel yang dipakai berulang di berbagai halaman daftar data.
  function exportButtonsHtml(prefix) {
    return `
      <button type="button" class="btn btn-outline btn-sm" id="${prefix}ExportCsv" title="Unduh sebagai CSV">${Icon.i('download')} CSV</button>
      <button type="button" class="btn btn-outline btn-sm" id="${prefix}ExportXlsx" title="Unduh sebagai Excel">${Icon.i('download')} Excel</button>
    `;
  }

  // Buka dialog pemilih kolom sebelum mengunduh ekspor. Kolom foto tidak pernah
  // ditampilkan di sini karena data foto tidak dapat diekspor.
  async function openExportFieldPicker(catId, format, params) {
    let data;
    try {
      data = await api(`/api/export/${catId}/fields`);
    } catch (e) {
      Toast.error(e.message || 'Gagal memuat daftar kolom ekspor.');
      return;
    }
    const meta = data.meta || [];
    const fields = data.fields || [];
    const photoNote = data.photo_excluded_count
      ? `<p class="export-photo-note">${Icon.i('info')} ${data.photo_excluded_count} kolom foto tidak disertakan karena data foto tidak dapat diekspor.</p>`
      : '';

    const row = (key, label, checked) => `
      <label class="export-field-row">
        <input type="checkbox" class="export-field-check" value="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
        <span>${escapeHtml(label)}</span>
      </label>`;

    const content = `
      <div class="export-field-picker">
        <p>Pilih data yang ingin disertakan pada file ekspor.</p>
        ${photoNote}
        <div class="export-field-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="expFieldAll">Pilih Semua</button>
          <button type="button" class="btn btn-ghost btn-sm" id="expFieldNone">Kosongkan</button>
        </div>
        <div class="export-field-list">
          ${meta.map((m) => row(m.key, m.label, true)).join('')}
          ${fields.length ? '<hr class="export-field-sep">' : ''}
          ${fields.map((f) => row(f.key, f.label, true)).join('')}
        </div>
      </div>`;

    Modal.open(content, {
      title: `Pilih Kolom — Unduh ${format === 'csv' ? 'CSV' : 'Excel'}`,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Batal</button>
        <button class="btn btn-primary" id="expFieldConfirm">Unduh</button>
      `,
      onOpen: (el) => {
        const checks = () => [...el.querySelectorAll('.export-field-check')];
        el.querySelector('#expFieldAll').addEventListener('click', () => checks().forEach((c) => { c.checked = true; }));
        el.querySelector('#expFieldNone').addEventListener('click', () => checks().forEach((c) => { c.checked = false; }));
        el.querySelector('#expFieldConfirm').addEventListener('click', () => {
          const selected = checks().filter((c) => c.checked).map((c) => c.value);
          if (!selected.length) { Toast.error('Pilih minimal satu kolom untuk diekspor.'); return; }
          Modal.close();
          triggerDownload(exportUrl(catId, format, { ...params, fields: selected.join(',') }));
        });
      },
    });
  }

  // Pasang klik-handler untuk tombol dari exportButtonsHtml(prefix). Menampilkan
  // dialog pemilih kolom sebelum mengunduh.
  // resolveCategoryId: () => Promise<number|null>
  // collectParams: () => object (filter saat ini, opsional)
  function wireExportButtons(prefix, resolveCategoryId, collectParams) {
    const csvBtn = document.getElementById(`${prefix}ExportCsv`);
    const xlsxBtn = document.getElementById(`${prefix}ExportXlsx`);
    async function run(format) {
      try {
        const catId = await resolveCategoryId();
        if (!catId) { Toast.error('Kategori ekspor tidak ditemukan.'); return; }
        const params = collectParams ? collectParams() : {};
        await openExportFieldPicker(catId, format, params);
      } catch (e) {
        Toast.error(e.message || 'Gagal memulai ekspor.');
      }
    }
    if (csvBtn) csvBtn.addEventListener('click', () => run('csv'));
    if (xlsxBtn) xlsxBtn.addEventListener('click', () => run('xlsx'));
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
        setTimeout(() => window.location.href = '/login.html', 1500);
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function parseDate(d) {
    if (!d) return null;
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

  // Ubah nilai enum tersimpan (UPPERCASE) menjadi label tampilan, mis. 'USAHA MIKRO' -> 'Usaha Mikro'
  function label(group, value) {
    if (!value) return '-';
    const l = meta && meta.labels && meta.labels[group] && meta.labels[group][value];
    return escapeHtml(l || value);
  }

  return {
    fetchMeta, label, api, formatDate, formatDateTime, escapeHtml, debounce, initials, getMeta: () => meta,
    fetchCategories, categoryIdByName, exportUrl, triggerDownload, exportButtonsHtml, wireExportButtons,
  };
})();

/* ========================================
   Toast Notifications
   ======================================== */

const Toast = (() => {
  const ICONS = { success: 'check-circle', error: 'x-circle', warning: 'alert-circle', info: 'info' };

  function show(msg, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${Icon.i(ICONS[type] || 'info')}<span></span>`;
    el.querySelector('span').textContent = msg;
    const c = document.getElementById('toastContainer');
    if (c) c.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
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
  let returnFocus = null;
  let previousOverflow = '';

  function open(content, opts = {}) {
    close();
    returnFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Modal yang tidak bisa ditutup (mis. wajib ganti password) tidak boleh
    // menampilkan tombol X yang mati: render hanya bila modal bisa ditutup.
    const dismissible = opts.dismissible !== false;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${opts.large ? 'modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-header">
          <h3 id="modalTitle">${App.escapeHtml(opts.title || 'Dialog')}</h3>
          ${dismissible ? `<button type="button" class="modal-close" aria-label="Tutup">${Icon.i('x')}</button>` : ''}
        </div>
        <div class="modal-body">${content}</div>
        ${opts.footer ? `<div class="modal-footer">${opts.footer}</div>` : ''}
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && dismissible) close();
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        close();
      }
      if (e.key === 'Tab') {
        const focusable = [...overlay.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), a[href]:not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    const closeButton = overlay.querySelector('.modal-close');
    if (closeButton) closeButton.addEventListener('click', close);
    document.getElementById('modalContainer').appendChild(overlay);
    current = overlay;
    if (opts.onOpen) opts.onOpen(overlay);
    // Prioritas: [autofocus] > field pertama > tombol (bukan urutan dokumen,
    // jika tidak fokus mendarat di tombol X di header).
    const initialFocus = overlay.querySelector('[autofocus]')
      || overlay.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      || overlay.querySelector('button:not([disabled])');
    const focusTarget = initialFocus || closeButton;
    if (focusTarget) focusTarget.focus();
    return overlay;
  }

  function close() {
    if (!current) return;
    current.remove();
    current = null;
    document.body.style.overflow = previousOverflow;
    if (returnFocus && typeof returnFocus.focus === 'function' && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
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
