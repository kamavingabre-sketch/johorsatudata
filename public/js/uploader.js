/* ========================================
   Uploader — preview foto, kompres otomatis, lightbox, fallback gambar rusak
   Otomatis aktif untuk setiap blok .file-upload yang muncul di halaman.
   ======================================== */

const Uploader = (() => {
  const MAX_SIDE = 1600;      // sisi terpanjang setelah kompres (px)
  const QUALITY = 0.85;
  const MAX_BYTES = 8 * 1024 * 1024;
  const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const BROKEN_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
        '<rect width="320" height="200" fill="#1f2430"/>' +
        '<g fill="none" stroke="#5b6478" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="112" y="60" width="96" height="70" rx="8"/><circle cx="140" cy="86" r="8"/>' +
        '<path d="M116 122l28-26 22 20 14-12 26 22"/></g>' +
        '<text x="160" y="160" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#8a93a6">Foto tidak dapat dimuat</text></svg>'
    );

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(() => loadViaImg(file));
    }
    return loadViaImg(file);
  }

  function loadViaImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  // Ubah ukuran + konversi ke JPEG. Mengembalikan File baru, atau file asli bila tak perlu/tak bisa.
  async function compress(file) {
    const small = file.size < 1.2 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp');
    let bmp;
    try {
      bmp = await loadBitmap(file);
    } catch {
      return { file, decoded: false };
    }
    const w0 = bmp.width, h0 = bmp.height;
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    if (small && scale === 1) return { file, decoded: true };

    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
    if (!blob) return { file, decoded: true };
    if (blob.size >= file.size && scale === 1 && file.type === 'image/jpeg') return { file, decoded: true };
    const name = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }), decoded: true };
  }

  function setInputFile(input, file) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      return true;
    } catch {
      return false;
    }
  }

  function enhance(box) {
    if (box.dataset.enhanced) return;
    const input = box.querySelector('input[type="file"]');
    if (!input) return;
    box.dataset.enhanced = '1';

    const textEl = box.querySelector('.file-upload-text');
    const originalText = textEl ? textEl.innerHTML : '';
    const wrap = document.createElement('div');
    wrap.className = 'upload-preview';
    wrap.hidden = true;
    box.insertAdjacentElement('afterend', wrap);
    let objectUrl = null;

    function reset() {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      input.value = '';
      wrap.hidden = true;
      wrap.innerHTML = '';
      box.classList.remove('has-file', 'is-busy');
      if (textEl) textEl.innerHTML = originalText;
    }

    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) { reset(); return; }

      box.classList.add('is-busy');
      if (textEl) textEl.innerHTML = '<span class="spinner-inline"></span> Memproses foto…';

      let result;
      try {
        if (!OK_TYPES.includes(f.type)) {
          // mis. HEIC — coba didekode oleh browser (Safari), jika gagal tolak
          result = await compress(f);
          if (!result.decoded) throw new Error('Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.');
          if (result.file === f) throw new Error('Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.');
        } else {
          result = await compress(f);
        }
        if (result.file.size > MAX_BYTES) throw new Error('Foto terlalu besar (maks 8 MB) walau sudah dikompres.');
      } catch (e) {
        reset();
        if (window.Toast) Toast.error(e.message); else alert(e.message);
        return;
      }

      const out = result.file;
      if (out !== f && !setInputFile(input, out)) {
        // browser lama: gunakan file asli
        if (f.size > MAX_BYTES) { reset(); Toast.error('Foto terlalu besar (maks 8 MB).'); return; }
      }
      const finalFile = input.files[0] || f;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(finalFile);
      wrap.innerHTML = `
        <img src="${objectUrl}" alt="Pratinjau foto">
        <div class="upload-preview-info">
          <strong>${(window.App ? App.escapeHtml(finalFile.name) : finalFile.name)}</strong>
          <span>${fmtSize(finalFile.size)}${finalFile !== f ? ` · dikompres dari ${fmtSize(f.size)}` : ''}</span>
          <button type="button" class="btn btn-sm btn-ghost upload-remove">✕ Batalkan pilihan</button>
        </div>`;
      wrap.hidden = false;
      wrap.querySelector('.upload-remove').addEventListener('click', reset);
      box.classList.remove('is-busy');
      box.classList.add('has-file');
      if (textEl) textEl.innerHTML = '✅ Foto siap diunggah<br><small>Klik untuk mengganti foto</small>';
    });
  }

  function scan(root) {
    (root || document).querySelectorAll('.file-upload').forEach(enhance);
  }

  /* ---- Lightbox: klik foto untuk memperbesar ---- */
  function openLightbox(src) {
    const ov = document.createElement('div');
    ov.className = 'lightbox';
    ov.innerHTML = `<img src="${src}" alt="Foto"><button class="lightbox-close" aria-label="Tutup">&times;</button>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
  }

  document.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('.photo-preview img, .detail-images img, .map-popup-img, .upload-preview img, .zoomable');
    if (img && img.src && !img.src.startsWith('data:')) { e.preventDefault(); openLightbox(img.src); }
  });

  /* ---- Gambar gagal dimuat → placeholder ---- */
  document.addEventListener(
    'error',
    (e) => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && !t.dataset.fallback) {
        t.dataset.fallback = '1';
        t.classList.add('img-broken');
        t.src = BROKEN_SVG;
      }
    },
    true
  );

  /* ---- Aktifkan otomatis untuk elemen yang dirender dinamis ---- */
  const start = () => {
    scan(document);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1) {
          if (n.matches && n.matches('.file-upload')) enhance(n);
          else if (n.querySelectorAll) scan(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  return { scan, openLightbox };
})();

window.Uploader = Uploader;
