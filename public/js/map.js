/* ========================================
   Map Module — All data types
   ======================================== */

const MapModule = (() => {
  let map = null;
  let allMarkers = [];

  const MARKER_COLORS = {
    business: {
      'PERDAGANGAN': '#1a73e8', 'KULINER': '#ea4335',
      'JASA PERAWATAN KECANTIKAN': '#e91e63', 'JASA PERBAIKAN DAN TEKNIK': '#ff9800',
      'LAUNDRY DAN DOORSMEER': '#9c27b0', 'PRODUKSI DAN INDUSTRI RUMAH TANGGA': '#607d8b',
      'PERTANIAN': '#4caf50', 'PERIKANAN': '#00bcd4', 'PETERNAKAN': '#795548',
    },
    disaster: '#ef4444',
    worship: '#8b5cf6',
  };

  const MARKER_ICONS = {
    disaster: '🌊',
    worship: { MASJID: '🕌', MUSHOLLA: '🕌', GEREJA: '⛪', PURA: '🛕', VIHARA: '☸️', KLENTENG: '🏯' },
  };

  async function initDashboardMap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    map = L.map(containerId).setView([3.5786, 98.6373], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);

    // Legend
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <strong style="font-size:12px;display:block;margin-bottom:8px;">Legenda</strong>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#1a73e8"></div> Usaha</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ef4444"></div> Rawan Bencana</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#8b5cf6"></div> Rumah Ibadah</div>
      `;
      return div;
    };
    legend.addTo(map);

    const allBounds = [];

    // Load businesses
    try {
      const biz = await App.api('/api/businesses/map/all');
      biz.places.forEach(p => {
        if (!p.lat || !p.lng) return;
        const color = MARKER_COLORS.business[p.kategori_usaha] || '#1a73e8';
        addBusinessMarker(p, color);
        allBounds.push([p.lat, p.lng]);
      });
    } catch (e) { console.error('Error loading businesses:', e); }

    // Load disasters
    try {
      const dis = await App.api('/api/disasters/map/all');
      dis.places.forEach(p => {
        if (!p.lat || !p.lng) return;
        addDisasterMarker(p);
        allBounds.push([p.lat, p.lng]);
      });
    } catch (e) { console.error('Error loading disasters:', e); }

    // Load worship places
    try {
      const wor = await App.api('/api/worship/map/all');
      wor.places.forEach(p => {
        if (!p.lat || !p.lng) return;
        addWorshipMarker(p);
        allBounds.push([p.lat, p.lng]);
      });
    } catch (e) { console.error('Error loading worship places:', e); }

    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
    }
  }

  function addBusinessMarker(place, color) {
    const icon = L.divIcon({
      className: 'custom-marker-wrapper',
      html: `<div class="custom-marker" style="background:${color}"><span>${App.kategoriIcon(place.kategori_usaha)}</span></div>`,
      iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
    });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
    marker.bindPopup(`
      <div class="map-popup">
        ${place.foto_usaha ? `<img src="${place.foto_usaha}" class="map-popup-img">` : ''}
        <h3>${App.escapeHtml(place.nama_usaha)}</h3>
        <p><strong>🏪 ${App.escapeHtml(place.kategori_usaha)}</strong></p>
        <p>📍 ${App.escapeHtml(place.alamat)}</p>
        <p>👤 ${App.escapeHtml(place.nama_pic)}</p>
        <div class="popup-meta">
          <span class="tag">${App.escapeHtml(place.jenis_kepemilikan)}</span>
          ${place.izin_usaha ? '<span class="tag tag-green">Berizin</span>' : '<span class="tag tag-red">Tanpa Izin</span>'}
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.location.hash='detail/${place.id}'">Lihat Detail</button>
      </div>
    `, { maxWidth: 320 });
    allMarkers.push(marker);
  }

  function addDisasterMarker(place) {
    const icon = L.divIcon({
      className: 'custom-marker-wrapper',
      html: `<div class="custom-marker" style="background:#ef4444"><span>🌊</span></div>`,
      iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
    });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
    marker.bindPopup(`
      <div class="map-popup">
        ${place.foto ? `<img src="${place.foto}" class="map-popup-img">` : ''}
        <h3>${App.escapeHtml(place.nama_lokasi)}</h3>
        <p><strong>🌊 ${App.escapeHtml(place.jenis_bencana)}</strong></p>
        <p>📍 ${App.escapeHtml(place.alamat)}</p>
        <p>⚠️ ${App.escapeHtml(place.penyebab)}</p>
        ${place.jumlah_rumah ? `<p>🏠 ${App.escapeHtml(place.jumlah_rumah)}</p>` : ''}
        ${place.jumlah_kk ? `<p>👨‍👩‍👧‍👦 ${App.escapeHtml(place.jumlah_kk)}</p>` : ''}
        <button class="btn btn-danger btn-sm" onclick="window.location.hash='detail-bencana/${place.id}'">Lihat Detail</button>
      </div>
    `, { maxWidth: 320 });
    allMarkers.push(marker);
  }

  function addWorshipMarker(place) {
    const emoji = (MARKER_ICONS.worship && MARKER_ICONS.worship[place.jenis]) || '🏛️';
    const icon = L.divIcon({
      className: 'custom-marker-wrapper',
      html: `<div class="custom-marker" style="background:#8b5cf6"><span>${emoji}</span></div>`,
      iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
    });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
    marker.bindPopup(`
      <div class="map-popup">
        ${place.foto ? `<img src="${place.foto}" class="map-popup-img">` : ''}
        <h3>${App.escapeHtml(place.nama)}</h3>
        <p><strong>${emoji} ${App.escapeHtml(place.jenis)}</strong></p>
        <p>📍 ${App.escapeHtml(place.alamat)}</p>
        ${place.nama_pengelola ? `<p>👤 ${App.escapeHtml(place.nama_pengelola)}</p>` : ''}
        ${place.kapasitas ? `<p>👥 Kapasitas: ${place.kapasitas} jemaah</p>` : ''}
        <button class="btn btn-primary btn-sm" onclick="window.location.hash='detail-ibadah/${place.id}'">Lihat Detail</button>
      </div>
    `, { maxWidth: 320 });
    allMarkers.push(marker);
  }

  return { initDashboardMap };
})();

window.MapModule = MapModule;
