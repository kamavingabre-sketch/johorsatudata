/* ========================================
   Map Module — Peta Data: pencarian, filter kelurahan, titik kumpul
   ======================================== */

const MapModule = (() => {
  const esc = (s) => App.escapeHtml(s);
  let map = null;
  let groups = {};
  let items = [];          // semua penanda: { type, name, sub, kel, text, marker, latlng }
  let dynamicCats = [];    // kategori data kustom yang aktif, dimuat saat mount()
  const state = { q: '', kel: '', layers: {} };

  const BASE_TYPES = {
    business:  { label: 'Usaha',         color: '#275e8e', glyph: 'store' },
    disaster:  { label: 'Rawan Bencana', color: '#b23730', glyph: 'warning' },
    gathering: { label: 'Titik Kumpul',  color: '#1e7d46', glyph: 'tent' },
    worship:   { label: 'Rumah Ibadah',  color: '#5e4187', glyph: 'landmark' },
  };
  // Palet warna untuk kategori data kustom (dipakai bergilir)
  const DYNAMIC_PALETTE = ['#c2185b', '#00838f', '#8d6e63', '#5c6bc0', '#558b2f', '#ef6c00', '#6d4c41', '#00695c'];
  let TYPES = { ...BASE_TYPES };

  function dynKey(catId) { return `dyn_${catId}`; }

  async function loadDynamicCategories() {
    dynamicCats = [];
    TYPES = { ...BASE_TYPES };
    try {
      const data = await App.api('/api/categories');
      const active = (data.categories || []).filter((c) => c.active && !c.is_system);
      active.forEach((cat, i) => {
        const key = dynKey(cat.id);
        TYPES[key] = { label: cat.display_name, color: DYNAMIC_PALETTE[i % DYNAMIC_PALETTE.length], glyph: cat.icon || 'info' };
        dynamicCats.push(cat);
      });
    } catch (e) { console.error(e); }
    for (const t of Object.keys(TYPES)) state.layers[t] = true;
  }
  const CATEGORY_COLORS = {
    'PERDAGANGAN': '#1a73e8', 'KULINER': '#ea4335', 'JASA PERAWATAN KECANTIKAN': '#e91e63',
    'JASA PERBAIKAN DAN TEKNIK': '#ff9800', 'LAUNDRY DAN DOORSMEER': '#9c27b0',
    'PRODUKSI DAN INDUSTRI RUMAH TANGGA': '#607d8b', 'PERTANIAN': '#4caf50',
    'PERIKANAN': '#00bcd4', 'PETERNAKAN': '#795548',
  };
  const JOHOR_CENTER = [3.5750, 98.6400];

  function makeIcon(glyph, color, size = 34) {
    return L.divIcon({
      className: 'custom-marker-wrapper',
      html: `<div class="custom-marker" style="background:${color}"><span class="pin-icon">${Icon.i(glyph)}</span></div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size],
    });
  }

  const gmapsDir = (la, ln) => `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}`;
  const photo = (src) => (src ? `<img src="${esc(src)}" class="map-popup-img" alt="Foto" loading="lazy">` : '');
  const kelTag = (k) => (k ? `<span class="tag tag-blue">${esc(k)}</span>` : '');

  /* ---------- popup builders ---------- */
  function popupBusiness(p) {
    return `<div class="map-popup">${photo(p.foto_usaha)}
      <h3>${esc(p.nama_usaha)}</h3>
      <div class="popup-meta">${kelTag(p.kelurahan)}<span class="tag">${esc(p.kategori_usaha)}</span></div>
      <p>${Icon.i('map-pin')} ${esc(p.alamat)}</p>
      <p>${Icon.i('user')} ${esc(p.nama_pic)} — ${esc(p.hp_pic)}</p>
      <div class="popup-meta"><span class="tag">${esc(p.jenis_kepemilikan)}</span>${p.skala_usaha ? `<span class="tag">${App.label('SKALA_USAHA', p.skala_usaha)}</span>` : ''}${p.jumlah_pekerja ? `<span class="tag">${App.label('JUMLAH_PEKERJA', p.jumlah_pekerja)}</span>` : ''}
        ${p.izin_usaha ? '<span class="tag tag-green">Berizin</span>' : '<span class="tag tag-red">Tanpa Izin</span>'}</div>
      <button class="btn btn-primary btn-sm" onclick="window.location.hash='detail/${p.id}'">Lihat Detail</button></div>`;
  }
  function popupDisaster(p) {
    return `<div class="map-popup">${photo(p.foto)}
      <h3>${esc(p.nama_lokasi)}</h3>
      <div class="popup-meta">${kelTag(p.kelurahan)}<span class="tag tag-orange">${esc(p.jenis_bencana)}</span></div>
      <p>${Icon.i('map-pin')} ${esc(p.alamat)}</p>
      <p>${Icon.i('info')} Penyebab: ${esc(p.penyebab)}</p>
      ${p.jumlah_rumah ? `<p>${Icon.i('building')} Rumah terdampak: ${esc(p.jumlah_rumah)}</p>` : ''}
      ${p.jumlah_kk ? `<p>${Icon.i('users')} KK terdampak: ${esc(p.jumlah_kk)}</p>` : ''}
      <button class="btn btn-danger btn-sm" onclick="window.location.hash='detail-bencana/${p.id}'">Lihat Detail</button></div>`;
  }
  function popupGathering(p) {
    return `<div class="map-popup">${photo(p.titik_kumpul_foto)}
      <h3>Titik Kumpul</h3>
      <div class="popup-meta">${kelTag(p.kelurahan)}<span class="tag tag-green">Posko / Evakuasi</span></div>
      <p>${Icon.i('map-pin')} ${esc(p.titik_kumpul || '-')}</p>
      <p>${Icon.i('warning')} Untuk titik rawan: <strong>${esc(p.nama_lokasi)}</strong> (${esc(p.jenis_bencana)})</p>
      <p class="popup-coord">${p.titik_kumpul_lat.toFixed(6)}, ${p.titik_kumpul_lng.toFixed(6)}</p>
      <div class="popup-actions">
        <a class="btn btn-outline btn-sm" href="${gmapsDir(p.titik_kumpul_lat, p.titik_kumpul_lng)}" target="_blank" rel="noopener">${Icon.i('navigation')} Rute</a>
        <button class="btn btn-primary btn-sm" onclick="window.location.hash='detail-bencana/${p.id}'">Detail</button>
      </div></div>`;
  }
  function popupDynamic(cat, fields, p) {
    const nameField = fields.find((f) => f.type === 'text' && (f.name === 'nama' || f.name.startsWith('nama')));
    const photoField = fields.find((f) => f.type === 'photo');
    const otherFields = fields.filter((f) => f !== nameField && f.type !== 'photo' && f.type !== 'location').slice(0, 3);
    const title = nameField ? p[nameField.name] : p.ref;
    return `<div class="map-popup">${photo(photoField ? p[photoField.name] : null)}
      <h3>${esc(title || p.ref)}</h3>
      <div class="popup-meta"><span class="tag">${esc(cat.display_name)}</span></div>
      ${otherFields.map((f) => `<p>${esc(f.label)}: ${esc(p[f.name] != null && p[f.name] !== '' ? String(p[f.name]) : '-')}</p>`).join('')}
      <button class="btn btn-primary btn-sm" onclick="window.location.hash='cat-detail-${cat.id}-${p.id}'">Lihat Detail</button></div>`;
  }
  function popupWorship(p) {
    return `<div class="map-popup">${photo(p.foto)}
      <h3>${esc(p.nama)}</h3>
      <div class="popup-meta">${kelTag(p.kelurahan)}<span class="tag tag-purple">${esc(p.jenis)}</span></div>
      <p>${Icon.i('sparkle')} ${esc(p.agama || '-')}</p>
      <p>${Icon.i('map-pin')} ${esc(p.alamat)}</p>
      ${p.nama_pengelola ? `<p>${Icon.i('user')} ${esc(p.nama_pengelola)}</p>` : ''}
      ${p.hp_pengelola ? `<p>${Icon.i('phone')} ${esc(p.hp_pengelola)}</p>` : ''}
      <button class="btn btn-primary btn-sm" onclick="window.location.hash='detail-ibadah/${p.id}'">Lihat Detail</button></div>`;
  }

  function addItem(type, lat, lng, icon, popupHtml, name, sub, kel, extraText) {
    const marker = L.marker([lat, lng], { icon });
    marker.bindPopup(popupHtml, { maxWidth: 300, minWidth: 240, autoPanPadding: [40, 90] });
    items.push({
      type, name, sub, kel: kel || '', marker, latlng: [lat, lng],
      text: [name, sub, kel, extraText].filter(Boolean).join(' ').toLowerCase(),
    });
  }

  /* ---------- filtering ---------- */
  function isVisible(it) {
    if (!state.layers[it.type]) return false;
    if (state.kel && it.kel !== state.kel) return false;
    if (state.q && !it.text.includes(state.q)) return false;
    return true;
  }

  function applyFilter(fit) {
    const counts = {};
    const pts = [];
    for (const t of Object.keys(TYPES)) counts[t] = { shown: 0, total: 0 };
    for (const it of items) {
      counts[it.type].total++;
      const vis = isVisible(it);
      const g = groups[it.type];
      if (vis) { counts[it.type].shown++; pts.push(it.latlng); if (!g.hasLayer(it.marker)) g.addLayer(it.marker); }
      else if (g.hasLayer(it.marker)) g.removeLayer(it.marker);
    }
    for (const t of Object.keys(TYPES)) {
      const el = document.getElementById('cnt-' + t);
      if (el) el.textContent = state.q || state.kel ? `${counts[t].shown}/${counts[t].total}` : counts[t].total;
    }
    const info = document.getElementById('mapResultInfo');
    if (info) {
      info.textContent = pts.length
        ? `${pts.length} data ditampilkan${state.kel ? ' di Kel. ' + state.kel : ''}`
        : 'Tidak ada data yang cocok';
      info.classList.toggle('is-empty', !pts.length);
    }
    if (fit && pts.length) {
      if (pts.length === 1) map.setView(pts[0], 17);
      else map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 17 });
    }
    renderResults();
  }

  function renderResults() {
    const box = document.getElementById('mapResults');
    if (!box) return;
    if (!state.q) { box.innerHTML = ''; box.hidden = true; return; }
    const hits = items.filter(isVisible).slice(0, 8);
    box.hidden = false;
    box.innerHTML = hits.length
      ? hits.map((it) => `<button type="button" class="map-result" data-i="${items.indexOf(it)}">
          <span class="map-result-ico" style="background:${TYPES[it.type].color}">${Icon.i(TYPES[it.type].glyph)}</span>
          <span class="map-result-txt"><strong>${esc(it.name)}</strong><small>${esc(TYPES[it.type].label)}${it.kel ? ' · ' + esc(it.kel) : ''}${it.sub ? ' · ' + esc(it.sub) : ''}</small></span>
        </button>`).join('')
      : '<div class="map-result-empty">Tidak ada data dengan nama tersebut</div>';
  }

  function focusItem(it) {
    const g = groups[it.type];
    if (!g.hasLayer(it.marker)) g.addLayer(it.marker);
    map.flyTo(it.latlng, Math.max(map.getZoom(), 18), { duration: 0.8 });
    setTimeout(() => it.marker.openPopup(), 850);
  }

  /* ---------- mount ---------- */
  async function mount(container) {
    if (map) { try { map.remove(); } catch {} map = null; }
    items = [];
    state.q = ''; state.kel = '';
    const meta = await App.fetchMeta();
    await loadDynamicCategories();

    container.innerHTML = `
      <div class="map-shell">
        <div class="map-panel" id="mapPanel">
          <div class="map-search">
            <span class="map-search-ico">${Icon.i('search')}</span>
            <input type="search" id="mapSearch" placeholder="Cari nama usaha, lokasi, titik kumpul, rumah ibadah…" autocomplete="off">
            <button type="button" id="mapSearchClear" class="map-search-clear" hidden aria-label="Hapus">${Icon.i('x')}</button>
          </div>
          <div class="map-results" id="mapResults" hidden></div>
          <div class="map-panel-row">
            <select id="mapKel" class="filter-select">
              <option value="">Semua Kelurahan</option>
              ${(meta.enums.kelurahan || []).map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}
            </select>
          </div>
          <div class="map-layers">
            ${Object.entries(TYPES).map(([t, c]) => `
              <label class="map-layer"><input type="checkbox" data-layer="${t}" checked>
                <i style="background:${c.color}"></i><span>${c.label}</span><b id="cnt-${t}">0</b></label>`).join('')}
          </div>
          <div class="map-result-info" id="mapResultInfo"></div>
        </div>
        <div id="mapContainer" class="map-canvas"></div>
      </div>`;

    map = L.map('mapContainer', { center: JOHOR_CENTER, zoom: 14, minZoom: 3, maxZoom: 19, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 19 });
    L.control.layers({ 'Peta Jalan': street, 'Citra Satelit': sat }, null, { position: 'topright' }).addTo(map);
    for (const t of Object.keys(TYPES)) groups[t] = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 150);

    await loadAll();
    bindUi();
    applyFilter(true);
  }

  async function loadAll() {
    const safe = async (url, fn) => { try { fn(await App.api(url)); } catch (e) { console.error(url, e); } };

    await safe('/api/businesses/map/all', (r) => r.places.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      addItem('business', p.lat, p.lng, makeIcon(Icon.kategori(p.kategori_usaha), CATEGORY_COLORS[p.kategori_usaha] || TYPES.business.color),
        popupBusiness(p), p.nama_usaha, p.kategori_usaha, p.kelurahan, [p.alamat, p.nama_pic, p.ref].join(' '));
    }));

    await safe('/api/disasters/map/all', (r) => r.places.forEach((p) => {
      if (p.lat != null && p.lng != null) {
        addItem('disaster', p.lat, p.lng, makeIcon(TYPES.disaster.glyph, TYPES.disaster.color),
          popupDisaster(p), p.nama_lokasi, p.jenis_bencana, p.kelurahan, [p.alamat, p.penyebab, p.ref].join(' '));
      }
      if (p.titik_kumpul_lat != null && p.titik_kumpul_lng != null) {
        addItem('gathering', p.titik_kumpul_lat, p.titik_kumpul_lng, makeIcon(TYPES.gathering.glyph, TYPES.gathering.color),
          popupGathering(p), 'Titik Kumpul — ' + p.nama_lokasi, p.jenis_bencana, p.kelurahan, [p.titik_kumpul, p.alamat, p.ref].join(' '));
      }
    }));

    await safe('/api/worship/map/all', (r) => r.places.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      addItem('worship', p.lat, p.lng, makeIcon(TYPES.worship.glyph, TYPES.worship.color),
        popupWorship(p), p.nama, p.jenis, p.kelurahan, [p.alamat, p.agama, p.nama_pengelola, p.ref].join(' '));
    }));

    for (const cat of dynamicCats) {
      const key = dynKey(cat.id);
      await safe(`/api/categories/${cat.id}/map`, (r) => {
        const fields = r.fields || [];
        (r.places || []).forEach((p) => {
          if (p.lat == null || p.lng == null) return;
          const nameField = fields.find((f) => f.type === 'text' && (f.name === 'nama' || f.name.startsWith('nama')));
          const name = nameField ? (p[nameField.name] || p.ref) : p.ref;
          addItem(key, p.lat, p.lng, makeIcon(TYPES[key].glyph, TYPES[key].color),
            popupDynamic(cat, fields, p), name, cat.display_name, p.kelurahan || '', [p.ref].join(' '));
        });
      });
    }
  }

  function bindUi() {
    const input = document.getElementById('mapSearch');
    const clear = document.getElementById('mapSearchClear');
    const results = document.getElementById('mapResults');

    input.addEventListener('input', App.debounce(() => {
      state.q = input.value.trim().toLowerCase();
      clear.hidden = !state.q;
      applyFilter(false);
    }, 180));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyFilter(true); const f = items.filter(isVisible); if (f.length === 1) focusItem(f[0]); }
      if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); }
    });
    clear.addEventListener('click', () => { input.value = ''; state.q = ''; clear.hidden = true; applyFilter(true); input.focus(); });
    results.addEventListener('click', (e) => {
      const b = e.target.closest('.map-result');
      if (b) focusItem(items[+b.dataset.i]);
    });
    document.getElementById('mapKel').addEventListener('change', (e) => { state.kel = e.target.value; applyFilter(true); });
    document.querySelectorAll('[data-layer]').forEach((cb) =>
      cb.addEventListener('change', () => { state.layers[cb.dataset.layer] = cb.checked; applyFilter(false); }));

    // Jangan geser peta saat scroll/klik di panel
    const panel = document.getElementById('mapPanel');
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
  }

  return { mount };
})();

window.MapModule = MapModule;
