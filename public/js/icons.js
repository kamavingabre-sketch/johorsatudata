/* ========================================
   Icon System — inline SVG garis 1.8px, mewarisi warna teks (currentColor).
   Pemakaian: Icon.i('nama') → string <svg>. Ukuran diatur CSS (class .icon).
   ======================================== */

const Icon = (() => {
  const P = {
    /* navigasi */
    dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
    map: '<path d="M9 4.5 3.5 6.3v13.2L9 17.7l6 1.8 5.5-1.8V4.5L15 6.3l-6-1.8z"/><path d="M9 4.5v13.2M15 6.3v13.2"/>',
    rows: '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><rect x="3.5" y="10" width="17" height="4" rx="1"/><rect x="3.5" y="15.5" width="17" height="4" rx="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    warning: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.9" r="0.4" fill="currentColor"/>',
    landmark: '<path d="M4 21h16M5.5 18h13M6.5 18v-7M10 18v-7M14 18v-7M17.5 18v-7M3.5 11 12 4l8.5 7h-17z"/>',
    scroll: '<path d="M7 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7"/><path d="M7 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2"/><path d="M9.5 8.5h7M9.5 12h7M9.5 15.5h4.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.7a3.2 3.2 0 0 1 0 5.6M17.6 14.9c1.6.8 2.6 2.3 2.9 4.6"/>',
    logout: '<path d="M14.5 8V5.5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V16"/><path d="M9.5 12h11M17.5 8.5 21 12l-3.5 3.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    key: '<circle cx="8" cy="14.5" r="4"/><path d="M10.9 11.6 20 3M15.5 7.5l3 3M18 5l3 3"/>',

    /* statistik */
    store: '<path d="M4 9.5 5.4 4h13.2L20 9.5"/><path d="M4 9.5a2.4 2.4 0 0 0 4.8.3 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 1.6-.3"/><path d="M5.2 12.5v7.5h13.6v-7.5"/><path d="M9.5 20v-5h5v5"/>',
    badge: '<path d="M12 3 13.8 5l2.7-.5.6 2.6 2.5 1.1-1.1 2.5 1.7 2.1-2.1 1.7.2 2.7-2.7.3L14.3 20 12 18.6 9.7 20l-1.3-2.5-2.7-.3.2-2.7-2.1-1.7 1.7-2.1-1.1-2.5 2.5-1.1.6-2.6L10.2 5 12 3z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
    shield: '<path d="M12 3.5 5 6v5.4c0 4.4 2.9 7.6 7 9.1 4.1-1.5 7-4.7 7-9.1V6l-7-2.5z"/><path d="m9.2 11.8 2 2 3.8-4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M7.5 13h3M7.5 16.5h6"/>',
    waves: '<path d="M3 8c2.2 0 2.2 1.6 4.5 1.6S9.8 8 12 8s2.2 1.6 4.5 1.6S18.8 8 21 8"/><path d="M3 12.7c2.2 0 2.2 1.6 4.5 1.6s2.3-1.6 4.5-1.6 2.2 1.6 4.5 1.6 2.3-1.6 4.5-1.6"/><path d="M3 17.4c2.2 0 2.2 1.6 4.5 1.6s2.3-1.6 4.5-1.6 2.2 1.6 4.5 1.6 2.3-1.6 4.5-1.6"/>',

    /* aksi */
    eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    pencil: '<path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5z"/><path d="m12.5 7.5 4 4"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5 7.3 19a1.8 1.8 0 0 0 1.8 1.7h5.8A1.8 1.8 0 0 0 16.7 19l.8-12.5"/><path d="M10 10.5v6M14 10.5v6"/>',
    download: '<path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 5 5"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
    'x-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>',
    'alert-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8V13"/><circle cx="12" cy="16.2" r="0.4" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle cx="12" cy="7.8" r="0.4" fill="currentColor"/>',
    'chevron-left': '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    'chevron-right': '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    'arrow-left': '<path d="M19.5 12h-15M10 5.5 3.5 12l6.5 6.5"/>',
    'map-pin': '<path d="M12 21.5s7-6.2 7-11.5a7 7 0 1 0-14 0c0 5.3 7 11.5 7 11.5z"/><circle cx="12" cy="9.8" r="2.6"/>',
    crosshair: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5"/>',
    navigation: '<path d="M12 3 5 20.5l7-3.5 7 3.5L12 3z"/>',
    camera: '<path d="M8.5 6.5 10 4h4l1.5 2.5H19a1.8 1.8 0 0 1 1.8 1.8v10A1.8 1.8 0 0 1 19 20H5a1.8 1.8 0 0 1-1.8-1.7v-10A1.8 1.8 0 0 1 5 6.5h3.5z"/><circle cx="12" cy="12.6" r="3.4"/>',
    phone: '<path d="M5.4 3.5h2.7a1.5 1.5 0 0 1 1.5 1.3c.1 1 .4 2 .8 2.9a1.5 1.5 0 0 1-.4 1.7l-1.2 1a12.6 12.6 0 0 0 5.4 5.4l1-1.2a1.5 1.5 0 0 1 1.7-.4c.9.4 1.9.7 2.9.8a1.5 1.5 0 0 1 1.3 1.5v2.7a1.8 1.8 0 0 1-2 1.8C10.3 20.4 3.6 13.7 3.6 5.5a1.8 1.8 0 0 1 1.8-2z"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.8-3.9 3.7-6 7.5-6s6.7 2.1 7.5 6"/>',
    filter: '<path d="M4 5.5h16l-6.2 7.3v5.7l-3.6 1.5v-7.2L4 5.5z"/>',
    external: '<path d="M10 5.5H5.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14"/><path d="M14 3.5h6.5V10M20 4l-8.5 8.5"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>',
    building: '<rect x="5.5" y="3.5" width="13" height="17" rx="1.2"/><path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2M10 20.5V17h4v3.5"/>',
    tent: '<path d="M12 4.5 3 19.5h6l3-5.4 3 5.4h6L12 4.5z"/><path d="M9.8 19.5 12 15M14.2 19.5 12 15"/>',
    'tenda-kumpul': '<path d="M12 4.5 3 19.5h6l3-5.4 3 5.4h6L12 4.5z"/><path d="M9.8 19.5 12 15M14.2 19.5 12 15"/>',
    print: '<path d="M7 8V3.5h10V8"/><rect x="4" y="8" width="16" height="8.5" rx="1.5"/><path d="M7 13.5h10V21H7v-7.5z"/>',
    inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4z"/><path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5"/>',

    /* kategori (dipakai di marker peta) */
    cart: '<circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M3 4h2.4l2.5 11h9.8l2.3-8H6.1"/>',
    'utensils': '<path d="M6 3.5v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-7M8 3.5v17"/><path d="M17.5 3.5c-1.7 1-2.7 3-2.7 5.4 0 1.8.9 3.1 2.7 3.4v8.2"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 1 5-3.9l-2.6 2.6 2.4 2.4L21.9 5a4 4 0 0 1-5.3 4.9L7.5 19a2.1 2.1 0 0 1-3-3l9.1-9.1a4 4 0 0 1 .9-.4z"/>',
    shirt: '<path d="m9 4-5 3 1.8 3.6L8 9.8V20h8V9.8l2.2.8L20 7l-5-3a3 3 0 0 1-6 0z"/>',
    factory: '<path d="M3.5 20.5v-9l5 3v-3l5 3v-7l7-3.5v16.5h-17z"/><path d="M6.5 17h2M11 17h2M15.5 17h2"/>',
    plant: '<path d="M12 21v-8"/><path d="M12 13c0-4 2.5-6.5 7-6.5-.3 4.2-2.8 6.5-7 6.5z"/><path d="M12 10.5C12 7 9.8 4.8 5.5 4.8c.3 3.8 2.5 5.7 6.5 5.7"/><path d="M7 21h10"/>',
    fish: '<path d="M3 12c2.8-4 6.4-6 10.5-6 3.2 0 5.8 1.9 7.5 6-1.7 4.1-4.3 6-7.5 6C9.4 18 5.8 16 3 12z"/><path d="M3 12h4"/><circle cx="16.5" cy="10.8" r="0.5" fill="currentColor"/>',
    cow: '<path d="M5 6 3.5 4M19 6l1.5-2"/><path d="M5.5 6a3.5 3.5 0 0 1 6 -1.5h1a3.5 3.5 0 0 1 6 1.5c.8 1.2 1.3 2.7 1.3 4.5 0 2.3-.9 4.2-2.3 5.4l.5 4.6h-2.5l-.6-3h-5.8l-.6 3H6l.5-4.6C5.1 14.7 4.2 12.8 4.2 10.5c0-1.8.5-3.3 1.3-4.5z"/><circle cx="9.5" cy="10" r="0.5" fill="currentColor"/><circle cx="14.5" cy="10" r="0.5" fill="currentColor"/>',
    sparkle: '<path d="M12 3.5c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/>',
  };

  function i(name, cls) {
    const p = P[name] || P.info;
    return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
  }

  /* Ikon usaha per kategori → nama ikon SVG */
  const KATEGORI = {
    'PERDAGANGAN': 'cart',
    'KULINER': 'utensils',
    'JASA PERAWATAN KECANTIKAN': 'sparkle',
    'JASA PERBAIKAN DAN TEKNIK': 'wrench',
    'LAUNDRY DAN DOORSMEER': 'shirt',
    'PRODUKSI DAN INDUSTRI RUMAH TANGGA': 'factory',
    'PERTANIAN': 'plant',
    'PERIKANAN': 'fish',
    'PETERNAKAN': 'cow',
  };

  return { i, KATEGORI, kategori: (k) => KATEGORI[k] || 'store' };
})();

window.Icon = Icon;
