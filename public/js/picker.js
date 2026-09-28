/* ========================================
   LocationPicker — pemilih koordinat: klik peta, geser marker, input manual, GPS
   Dapat dipakai lebih dari satu kali dalam satu form (mis. lokasi bencana + titik kumpul).
   ======================================== */

const LocationPicker = (() => {
  const DEFAULT_CENTER = [3.5786, 98.6373];

  function pin(color, emoji) {
    return L.divIcon({
      className: 'custom-marker-wrapper',
      html: `<div class="custom-marker" style="background:${color}"><span>${emoji}</span></div>`,
      iconSize: [36, 36], iconAnchor: [18, 36],
    });
  }

  /**
   * root: elemen pembungkus yang berisi [data-role=map|lat|lng|display|gps|apply|status]
   * opts: { lat, lng, color, emoji }
   */
  function mount(root, opts = {}) {
    const q = (r) => root.querySelector(`[data-role="${r}"]`);
    const mapEl = q('map'), latIn = q('lat'), lngIn = q('lng'), disp = q('display');
    const gpsBtn = q('gps'), applyBtn = q('apply'), status = q('status');
    const color = opts.color || '#3b82f6', emoji = opts.emoji || '📍';
    const hasInit = Number.isFinite(opts.lat) && Number.isFinite(opts.lng);

    const map = L.map(mapEl).setView(hasInit ? [opts.lat, opts.lng] : DEFAULT_CENTER, hasInit ? 17 : 14);
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri', maxZoom: 19,
    });
    L.control.layers({ '🗺️ Peta': street, '🛰️ Satelit': sat }, null, { position: 'topright' }).addTo(map);

    let marker = null;
    const show = (lat, lng) => { disp.textContent = `${(+lat).toFixed(6)}, ${(+lng).toFixed(6)}`; disp.classList.add('is-set'); };

    function setPoint(lat, lng, pan) {
      const ll = L.latLng(lat, lng);
      if (marker) marker.setLatLng(ll);
      else {
        marker = L.marker(ll, { draggable: true, icon: pin(color, emoji) }).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          latIn.value = p.lat.toFixed(7); lngIn.value = p.lng.toFixed(7); show(p.lat, p.lng);
        });
      }
      latIn.value = (+lat).toFixed(7); lngIn.value = (+lng).toFixed(7);
      show(lat, lng);
      if (pan) map.setView(ll, Math.max(map.getZoom(), 17));
    }

    if (hasInit) setPoint(opts.lat, opts.lng, false);
    map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng, false));
    setTimeout(() => map.invalidateSize(), 150);

    function fromInputs(notify) {
      const lat = parseFloat(latIn.value), lng = parseFloat(lngIn.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { if (notify) Toast.warning('Isi latitude dan longitude terlebih dahulu.'); return; }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { if (notify) Toast.warning('Koordinat tidak valid.'); return; }
      setPoint(lat, lng, true);
      if (notify) Toast.success('Koordinat diterapkan ke peta.');
    }
    applyBtn.addEventListener('click', () => fromInputs(true));
    [latIn, lngIn].forEach((el) => el.addEventListener('change', () => fromInputs(false)));

    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) { status.textContent = '⚠️ Browser tidak mendukung GPS.'; return; }
      status.className = 'hint mt-1'; status.textContent = '⏳ Mengambil lokasi GPS…';
      gpsBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPoint(pos.coords.latitude, pos.coords.longitude, true);
          status.className = 'hint mt-1 text-success';
          status.textContent = `✅ GPS ditemukan (akurasi ±${Math.round(pos.coords.accuracy)} m). Geser marker bila perlu.`;
          gpsBtn.disabled = false;
        },
        (err) => {
          status.className = 'hint mt-1 text-danger';
          status.textContent = err.code === 1 ? '⚠️ Akses GPS ditolak. Izinkan lokasi di browser.'
            : err.code === 2 ? '⚠️ Lokasi tidak tersedia. Pastikan GPS aktif.' : '⚠️ Waktu habis, coba lagi.';
          gpsBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

    return { map, setPoint, destroy: () => map.remove() };
  }

  // HTML pemilih lokasi (dipakai lewat template di form)
  function html({ title, hint, lat, lng, required, idPrefix, latName, lngName }) {
    const has = Number.isFinite(lat) && Number.isFinite(lng);
    const req = required ? ' required' : '';
    return `
      <div class="picker" id="${idPrefix}">
        ${hint ? `<div class="hint mb-1">${hint}</div>` : ''}
        <div class="location-picker">
          <div class="location-picker-map" data-role="map"></div>
          <div class="location-picker-info">
            <span>📍</span>
            <span data-role="display" class="${has ? 'is-set' : ''}">${has ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Belum ada lokasi dipilih'}</span>
          </div>
        </div>
        <div class="form-row mt-2">
          <div class="form-group">
            <label>Latitude${required ? ' <span class="required">*</span>' : ''}</label>
            <input type="number" step="any" name="${latName}" data-role="lat" value="${has ? lat : ''}" placeholder="Contoh: 3.5786"${req}>
          </div>
          <div class="form-group">
            <label>Longitude${required ? ' <span class="required">*</span>' : ''}</label>
            <input type="number" step="any" name="${lngName}" data-role="lng" value="${has ? lng : ''}" placeholder="Contoh: 98.6373"${req}>
          </div>
        </div>
        <div class="flex gap-1 mt-1 wrap">
          <button type="button" class="btn btn-sm btn-outline" data-role="gps">📡 Gunakan GPS Saya</button>
          <button type="button" class="btn btn-sm btn-secondary" data-role="apply">📍 Terapkan Koordinat ke Peta</button>
        </div>
        <div class="hint mt-1" data-role="status"></div>
      </div>`;
  }

  return { mount, html };
})();

window.LocationPicker = LocationPicker;
