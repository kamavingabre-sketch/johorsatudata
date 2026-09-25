/* ========================================
   Landing Page Module
   ======================================== */

(async () => {
  try {
    const res = await fetch('/api/public/summary');
    const data = await res.json();

    // Update stats
    document.getElementById('totalUsaha').textContent = data.totals.total;
    document.getElementById('usahaBerizin').textContent = data.totals.izin;
    document.getElementById('usahaAman').textContent = data.totals.aman_lengkap;

    // Render recent businesses
    const grid = document.getElementById('recentGrid');
    if (data.recent.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Belum ada data usaha yang terdaftar.</p></div>';
    } else {
      grid.innerHTML = data.recent.map(b => `
        <div class="recent-card">
          <div class="recent-card-img" style="${b.foto_usaha ? `background-image:url(${b.foto_usaha})` : ''}">
            <div class="recent-card-badge">${escapeHtml(b.kategori_usaha)}</div>
          </div>
          <div class="recent-card-body">
            <h4>${escapeHtml(b.nama_usaha)}</h4>
            <p>${escapeHtml(b.alamat)}</p>
            <div class="recent-card-meta">
              <span class="tag">${escapeHtml(b.jenis_kepemilikan)}</span>
              ${b.izin_usaha ? '<span class="tag tag-green">Berizin</span>' : '<span class="tag tag-red">Tanpa Izin</span>'}
            </div>
          </div>
        </div>
      `).join('');
    }

    // Render map
    if (data.places.length > 0) {
      const map = L.map('map').setView([3.5786, 98.6373], 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: 'osm-tiles'
      }).addTo(map);

      data.places.forEach(place => {
        if (place.lat && place.lng) {
          const marker = L.marker([place.lat, place.lng]).addTo(map);
          marker.bindPopup(`
            <div class="map-popup">
              ${place.foto_usaha ? `<img src="${place.foto_usaha}" class="map-popup-img">` : ''}
              <h3>${escapeHtml(place.nama_usaha)}</h3>
              <p><strong>${escapeHtml(place.kategori_usaha)}</strong></p>
              <p>📍 ${escapeHtml(place.alamat)}</p>
              <p>👤 ${escapeHtml(place.nama_pic)}</p>
            </div>
          `, { maxWidth: 300 });
        }
      });

      const bounds = L.latLngBounds(data.places.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  } catch (e) {
    console.error('Error loading landing data:', e);
  }
})();

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
