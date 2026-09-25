/* ========================================
   Map Module — Global Map with Filters
   Kecamatan Medan Johor Boundary
   ======================================== */

const MapModule = (() => {
  let map = null;
  let allMarkers = { business: [], disaster: [], worship: [] };
  let layerGroups = { business: null, disaster: null, worship: null };
  let boundaryLayer = null;

  /* ---- Medan Johor Boundary ---- */
  // Approximate polygon for Kecamatan Medan Johor
  const JOHOR_BOUNDS = [
    [3.5965, 98.6130],  // NW
    [3.5980, 98.6350],
    [3.5970, 98.6570],
    [3.5940, 98.6720],  // NE
    [3.5800, 98.6780],
    [3.5650, 98.6750],
    [3.5530, 98.6650],  // SE
    [3.5480, 98.6450],
    [3.5500, 98.6250],
    [3.5570, 98.6130],  // SW
    [3.5750, 98.6090],
    [3.5965, 98.6130],  // close polygon
  ];

  const JOHOR_CENTER = [3.5750, 98.6400];
  const JOHOR_MAX_BOUNDS = L.latLngBounds([3.5350, 98.5950], [3.6100, 98.6950]);

  const CATEGORY_COLORS = {
    'PERDAGANGAN': '#1a73e8', 'KULINER': '#ea4335',
    'JASA PERAWATAN KECANTIKAN': '#e91e63', 'JASA PERBAIKAN DAN TEKNIK': '#ff9800',
    'LAUNDRY DAN DOORSMEER': '#9c27b0', 'PRODUKSI DAN INDUSTRI RUMAH TANGGA': '#607d8b',
    'PERTANIAN': '#4caf50', 'PERIKANAN': '#00bcd4', 'PETERNAKAN': '#795548',
  };

  /* ---- Init ---- */
  async function initDashboardMap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Replace container with layout: filter bar + map
    container.parentElement.innerHTML = `
      <div style="position:relative;">
        <div id="mapFilterBar" style="
          position:absolute; top:12px; left:12px; z-index:1000;
          background:rgba(31,31,31,0.92); backdrop-filter:blur(12px);
          border-radius:12px; padding:12px 16px; border:1px solid rgba(255,255,255,0.1);
          display:flex; gap:16px; flex-wrap:wrap; align-items:center;
          box-shadow:0 8px 32px rgba(0,0,0,0.4); max-width:calc(100% - 24px);
        ">
          <span style="color:#a3a3a3;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Filter:</span>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#fafafa;user-select:none;">
            <input type="checkbox" id="filterBusiness" checked style="accent-color:#1a73e8;width:16px;height:16px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1a73e8;"></span>
            Usaha
            <span id="countBusiness" style="color:#737373;font-size:11px;"></span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#fafafa;user-select:none;">
            <input type="checkbox" id="filterDisaster" checked style="accent-color:#ef4444;width:16px;height:16px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;"></span>
            Rawan Bencana
            <span id="countDisaster" style="color:#737373;font-size:11px;"></span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#fafafa;user-select:none;">
            <input type="checkbox" id="filterWorship" checked style="accent-color:#8b5cf6;width:16px;height:16px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#8b5cf6;"></span>
            Rumah Ibadah
            <span id="countWorship" style="color:#737373;font-size:11px;"></span>
          </label>
          <span style="width:1px;height:20px;background:rgba(255,255,255,0.1);"></span>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#fafafa;user-select:none;">
            <input type="checkbox" id="filterBoundary" checked style="accent-color:#f59e0b;width:16px;height:16px;">
            <span style="color:#f59e0b;">⬡</span>
            Batas Kecamatan
          </label>
          <span style="width:1px;height:20px;background:rgba(255,255,255,0.1);"></span>
          <button id="btnFitBounds" style="
            background:rgba(102,126,234,0.2); border:1px solid rgba(102,126,234,0.3);
            color:#93c5fd; padding:4px 12px; border-radius:6px; font-size:12px;
            font-weight:600; cursor:pointer; transition:all 0.2s;
          " onmouseover="this.style.background='rgba(102,126,234,0.3)'" onmouseout="this.style.background='rgba(102,126,234,0.2)'">
            📍 Fokus Medan Johor
          </button>
        </div>
        <div id="mapContainer" class="map-full"></div>
      </div>
    `;

    // Init Leaflet map
    map = L.map('mapContainer', {
      center: JOHOR_CENTER,
      zoom: 14,
      maxBounds: JOHOR_MAX_BOUNDS,
      maxBoundsViscosity: 0.8,
      minZoom: 12,
      maxZoom: 19,
    });

    // Street view tiles (OpenStreetMap)
    const streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);

    // Satellite view tiles (Esri World Imagery - free, no API key)
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri', maxZoom: 19 }
    );

    // Labels overlay for satellite
    const labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: '', maxZoom: 19, opacity: 0.8 }
    );

    // Layer control (top right)
    const baseMaps = { '🗺️ Peta': streetLayer, '🛰️ Satelit': satelliteLayer };
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

    // Draw boundary polygon
    boundaryLayer = L.polygon(JOHOR_BOUNDS, {
      color: '#f59e0b',
      weight: 2.5,
      opacity: 0.8,
      fillColor: '#f59e0b',
      fillOpacity: 0.04,
      dashArray: '8, 6',
    }).addTo(map);

    // Boundary label
    const boundsCenter = boundaryLayer.getBounds().getCenter();
    L.marker(boundsCenter, {
      icon: L.divIcon({
        className: '',
        html: `<div style="
          background:rgba(245,158,11,0.9); color:white; padding:4px 12px;
          border-radius:6px; font-size:11px; font-weight:700; white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.3); text-transform:uppercase;
          letter-spacing:0.05em; transform:translateX(-50%);
        ">Kecamatan Medan Johor</div>`,
        iconSize: [0, 0], iconAnchor: [0, 0],
      }),
      interactive: false,
    }).addTo(map);

    // Init layer groups
    layerGroups.business = L.layerGroup().addTo(map);
    layerGroups.disaster = L.layerGroup().addTo(map);
    layerGroups.worship = L.layerGroup().addTo(map);

    // Load all data
    await loadAllData();

    // Setup filter handlers
    document.getElementById('filterBusiness').addEventListener('change', (e) => toggleLayer('business', e.target.checked));
    document.getElementById('filterDisaster').addEventListener('change', (e) => toggleLayer('disaster', e.target.checked));
    document.getElementById('filterWorship').addEventListener('change', (e) => toggleLayer('worship', e.target.checked));
    document.getElementById('filterBoundary').addEventListener('change', (e) => {
      if (e.target.checked) boundaryLayer.addTo(map); else map.removeLayer(boundaryLayer);
    });
    document.getElementById('btnFitBounds').addEventListener('click', () => {
      map.fitBounds(boundaryLayer.getBounds(), { padding: [60, 60] });
    });

    // Satellite toggle: also add/remove labels
    map.on('baselayerchange', (e) => {
      if (e.layer === satelliteLayer) labelsLayer.addTo(map);
      else map.removeLayer(labelsLayer);
    });

    // Fit to boundary on first load
    map.fitBounds(boundaryLayer.getBounds(), { padding: [60, 60] });
  }

  function toggleLayer(type, visible) {
    if (visible) {
      if (!map.hasLayer(layerGroups[type])) layerGroups[type].addTo(map);
    } else {
      map.removeLayer(layerGroups[type]);
    }
  }

  async function loadAllData() {
    const allBounds = [];

    // Businesses
    try {
      const biz = await App.api('/api/businesses/map/all');
      document.getElementById('countBusiness').textContent = `(${biz.places.length})`;
      biz.places.forEach(p => {
        if (!p.lat || !p.lng) return;
        const color = CATEGORY_COLORS[p.kategori_usaha] || '#1a73e8';
        const m = addBusinessMarker(p, color);
        if (m) { layerGroups.business.addLayer(m); allBounds.push([p.lat, p.lng]); }
      });
    } catch (e) { console.error('Error loading businesses:', e); }

    // Disasters
    try {
      const dis = await App.api('/api/disasters/map/all');
      document.getElementById('countDisaster').textContent = `(${dis.places.length})`;
      dis.places.forEach(p => {
        if (!p.lat || !p.lng) return;
        const m = addDisasterMarker(p);
        if (m) { layerGroups.disaster.addLayer(m); allBounds.push([p.lat, p.lng]); }
      });
    } catch (e) { console.error('Error loading disasters:', e); }

    // Worship places
    try {
      const wor = await App.api('/api/worship/map/all');
      document.getElementById('countWorship').textContent = `(${wor.places.length})`;
      wor.places.forEach(p => {
        if (!p.lat || !p.lng) return;
        const m = addWorshipMarker(p);
        if (m) { layerGroups.worship.addLayer(m); allBounds.push([p.lat, p.lng]); }
      });
    } catch (e) { console.error('Error loading worship places:', e); }
  }

  /* ---- Marker Builders ---- */

  function makeIcon(emoji, color, size = 32) {
    return L.divIcon({
      className: 'custom-marker-wrapper',
      html: `<div class="custom-marker" style="background:${color}"><span>${emoji}</span></div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size],
    });
  }

  function addBusinessMarker(place, color) {
    const marker = L.marker([place.lat, place.lng], { icon: makeIcon(App.kategoriIcon(place.kategori_usaha), color) });
    marker.bindPopup(`
      <div class="map-popup">
        ${place.foto_usaha ? `<img src="${place.foto_usaha}" class="map-popup-img">` : ''}
        <h3>${App.escapeHtml(place.nama_usaha)}</h3>
        <p><strong>🏪 ${App.escapeHtml(place.kategori_usaha)}</strong></p>
        <p>📍 ${App.escapeHtml(place.alamat)}</p>
        <p>👤 ${App.escapeHtml(place.nama_pic)} — ${App.escapeHtml(place.hp_pic)}</p>
        <div class="popup-meta">
          <span class="tag">${App.escapeHtml(place.jenis_kepemilikan)}</span>
          ${place.izin_usaha ? '<span class="tag tag-green">Berizin</span>' : '<span class="tag tag-red">Tanpa Izin</span>'}
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.location.hash='detail/${place.id}'">Lihat Detail</button>
      </div>
    `, { maxWidth: 320 });
    return marker;
  }

  function addDisasterMarker(place) {
    const marker = L.marker([place.lat, place.lng], { icon: makeIcon('🌊', '#ef4444') });
    marker.bindPopup(`
      <div class="map-popup">
        ${place.foto ? `<img src="${place.foto}" class="map-popup-img">` : ''}
        <h3>⚠️ ${App.escapeHtml(place.nama_lokasi)}</h3>
        <p><strong style="color:#ef4444">🌊 ${App.escapeHtml(place.jenis_bencana)}</strong></p>
        <p>📍 ${App.escapeHtml(place.alamat)}</p>
        <p>⚡ Penyebab: ${App.escapeHtml(place.penyebab)}</p>
        ${place.jumlah_rumah ? `<p>🏠 Rumah terdampak: ${App.escapeHtml(place.jumlah_rumah)}</p>` : ''}
        ${place.jumlah_kk ? `<p>👨‍👩‍👧‍👦 KK terdampak: ${App.escapeHtml(place.jumlah_kk)}</p>` : ''}
        ${place.titik_kumpul ? `<p>🏕️ Titik kumpul: ${App.escapeHtml(place.titik_kumpul)}</p>` : ''}
        <button class="btn btn-danger btn-sm" onclick="window.location.hash='detail-bencana/${place.id}'">Lihat Detail</button>
      </div>
    `, { maxWidth: 320 });
    return marker;
  }

  function addWorshipMarker(place) {
    const marker = L.marker([place.lat, place.lng], { icon: makeIcon('🏛️', '#8b5cf6') });
    marker.bindPopup(`
      <div class="map-popup">
        ${place.foto ? `<img src="${place.foto}" class="map-popup-img">` : ''}
        <h3>${App.escapeHtml(place.nama)}</h3>
        <p><strong style="color:#8b5cf6">🏛️ ${App.escapeHtml(place.jenis)}</strong></p>
        <p>🕊️ ${App.escapeHtml(place.agama || '-')}</p>
        <p>📍 ${App.escapeHtml(place.alamat)}</p>
        ${place.nama_pengelola ? `<p>👤 ${App.escapeHtml(place.nama_pengelola)}</p>` : ''}
        ${place.hp_pengelola ? `<p>📞 ${App.escapeHtml(place.hp_pengelola)}</p>` : ''}
        <button class="btn btn-primary btn-sm" onclick="window.location.hash='detail-ibadah/${place.id}'">Lihat Detail</button>
      </div>
    `, { maxWidth: 320 });
    return marker;
  }

  return { initDashboardMap };
})();

window.MapModule = MapModule;
