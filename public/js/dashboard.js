/* ========================================
   Dashboard Module — Main app routing
   ======================================== */

const Dashboard = (() => {
  let user = null;

  async function init() {
    user = await Auth.me();
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    document.getElementById('loadingOverlay').classList.add('hidden');

    // Set user info
    document.getElementById('userName').textContent = user.nama;
    document.getElementById('userRole').textContent = user.role;
    document.getElementById('userAvatar').textContent = App.initials(user.nama);

    // Show/hide superadmin-only nav items
    if (!Auth.isSuperadmin()) {
      document.querySelectorAll('.superadmin-only').forEach(el => el.classList.add('hidden'));
    }

    setupNavigation();
    setupLogout();
    setupSidebar();
    setupChangePassword();

    if (user.mustReset) {
      showChangePasswordModal(true);
    }

    // Muat nav item kategori dinamis
    await refreshDynamicNav();

    const hash = window.location.hash.slice(1) || 'dashboard';
    navigateTo(hash);
  }

  function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (window.location.hash.slice(1) === page) {
          navigateTo(page);
        } else {
          window.location.hash = page;
        }
      });
    });
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'dashboard';
      navigateTo(hash);
    });
  }

  function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const open = () => { sidebar.classList.add('open'); backdrop.classList.add('show'); document.body.style.overflow = 'hidden'; };
    const close = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); document.body.style.overflow = ''; };

    document.getElementById('menuToggle').addEventListener('click', open);
    document.getElementById('sidebarClose').addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window._closeSidebar = close;
  }

  function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
      Modal.confirm('Keluar', 'Apakah Anda yakin ingin keluar?', () => Auth.logout());
    });
  }

  function setupChangePassword() {
    document.getElementById('changePasswordBtn').addEventListener('click', () => {
      showChangePasswordModal(false);
    });
  }

  function showChangePasswordModal(mustReset) {
    const html = `
      <form id="changePasswordForm">
        <div class="form-group">
          <label for="cpCurrent">Password Lama</label>
          <input id="cpCurrent" type="password" name="current" required autocomplete="current-password">
        </div>
        <div class="form-group">
          <label for="cpNext">Password Baru (minimal 8 karakter)</label>
          <input id="cpNext" type="password" name="next" required minlength="8" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label for="cpConfirm">Konfirmasi Password Baru</label>
          <input id="cpConfirm" type="password" name="confirm" required minlength="8" autocomplete="new-password">
        </div>
        <div class="form-error" id="cpError" role="alert"></div>
        ${mustReset ? '<p class="text-muted mb-2">Anda wajib mengubah password sebelum melanjutkan. Bila belum siap, Anda bisa keluar dan login kembali kapan saja.</p>' : ''}
      </form>
    `;
    Modal.open(html, {
      title: 'Ganti Password',
      dismissible: !mustReset,
      footer: `
        ${!mustReset ? '<button type="button" class="btn btn-secondary" onclick="Modal.close()">Batal</button>' : ''}
        ${mustReset ? '<button type="button" class="btn btn-secondary" id="cpLogout">Keluar</button>' : ''}
        <button type="submit" class="btn btn-primary" id="cpSubmit" form="changePasswordForm">Simpan</button>
      `,
      onOpen: (el) => {
        const form = el.querySelector('#changePasswordForm');
        const errBox = el.querySelector('#cpError');
        const submitBtn = el.querySelector('#cpSubmit');
        // Modal wajib-ganti tidak bisa ditutup, jadi sediakan jalan keluar via tombol Keluar.
        const logoutBtn = el.querySelector('#cpLogout');
        if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

        // Tombol submit berada di luar <form>, jadi andalkan submit (Enter pun tetap jalan).
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          errBox.textContent = '';
          if (form.next.value !== form.confirm.value) {
            errBox.textContent = 'Konfirmasi password tidak cocok.';
            form.confirm.focus();
            return;
          }
          submitBtn.disabled = true;
          const label = submitBtn.textContent;
          submitBtn.textContent = 'Menyimpan…';
          try {
            await Auth.changePassword(form.current.value, form.next.value);
            Toast.success('Password berhasil diubah.');
            Modal.close();
          } catch (err) {
            errBox.textContent = err.message;
            submitBtn.disabled = false;
            submitBtn.textContent = label;
          }
        });
      },
    });
  }

  async function navigateTo(page) {
    if ((page === 'logs' || page === 'users') && !Auth.isSuperadmin()) {
      Toast.error('Halaman ini hanya tersedia untuk Superadmin.');
      window.history.replaceState(null, '', '#dashboard');
      page = 'dashboard';
    }
    window.scrollTo(0, 0);
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page || (page.startsWith('cat-') && el.dataset.page === page));
    });
    const container = document.getElementById('pageContainer');
    const title = document.getElementById('pageTitle');

    switch (page) {
      case 'dashboard':
        title.textContent = 'Dashboard';
        await renderDashboard(container);
        break;
      case 'peta':
        title.textContent = 'Peta Data';
        await renderMapPage(container);
        break;
      case 'data':
        title.textContent = 'Data Usaha';
        await renderDataPage(container);
        break;
      case 'tambah':
        title.textContent = 'Tambah Data Usaha';
        await Form.renderAdd(container);
        break;
      case 'logs':
        title.textContent = 'Log Aktivitas';
        if (Auth.isSuperadmin()) await renderLogsPage(container);
        break;
      case 'users':
        title.textContent = 'Kelola Admin';
        if (Auth.isSuperadmin()) await Admin.renderUsers(container);
        break;
      case 'bencana':
        title.textContent = 'Titik Rawan Bencana';
        await Disaster.renderList(container);
        break;
      case 'tambah-bencana':
        title.textContent = 'Tambah Titik Rawan Bencana';
        await Disaster.renderForm(container);
        break;
      case 'ibadah':
        title.textContent = 'Rumah Ibadah';
        await Worship.renderList(container);
        break;
      case 'tambah-ibadah':
        title.textContent = 'Tambah Rumah Ibadah';
        await Worship.renderForm(container);
        break;
      case 'categories':
        title.textContent = 'Kategori Data';
        if (Auth.isSuperadmin()) await CategoryManager.renderPage(container);
        break;
      default:
        if (page.startsWith('cat-data-')) {
          // Halaman list data kategori dinamis: cat-data-{catId}
          const catId = parseInt(page.split('-')[2], 10);
          if (catId) { await CategoryManager.renderDataPage(container, catId); }
          else { window.location.hash = 'dashboard'; }
        } else if (page.startsWith('cat-add-')) {
          // Halaman tambah data kategori dinamis: cat-add-{catId}
          const catId = parseInt(page.split('-')[2], 10);
          if (catId) { await CategoryManager.renderAddForm(container, catId); }
          else { window.location.hash = 'dashboard'; }
        } else if (page.startsWith('cat-edit-')) {
          // Halaman edit data kategori dinamis: cat-edit-{catId}-{dataId}
          const parts = page.split('-');
          const catId = parseInt(parts[2], 10), dataId = parseInt(parts[3], 10);
          title.textContent = 'Edit Data';
          if (catId && dataId) { await CategoryManager.renderEditForm(container, catId, dataId); }
          else { window.location.hash = 'dashboard'; }
        } else if (page.startsWith('cat-detail-')) {
          // Halaman detail data kategori dinamis: cat-detail-{catId}-{dataId}
          const parts = page.split('-');
          const catId = parseInt(parts[2], 10), dataId = parseInt(parts[3], 10);
          title.textContent = 'Detail Data';
          if (catId && dataId) { await CategoryManager.renderDetail(container, catId, dataId); }
          else { window.location.hash = 'dashboard'; }
        } else if (page.startsWith('edit/')) {
          const id = page.split('/')[1];
          title.textContent = 'Edit Data Usaha';
          await Form.renderEdit(container, id);
        } else if (page.startsWith('detail/')) {
          const id = page.split('/')[1];
          title.textContent = 'Detail Usaha';
          await renderDetail(container, id);
        } else if (page.startsWith('edit-bencana/')) {
          const id = page.split('/')[1];
          title.textContent = 'Edit Titik Rawan Bencana';
          await Disaster.renderForm(container, id);
        } else if (page.startsWith('detail-bencana/')) {
          const id = page.split('/')[1];
          title.textContent = 'Detail Titik Rawan Bencana';
          await Disaster.renderDetail(container, id);
        } else if (page.startsWith('edit-ibadah/')) {
          const id = page.split('/')[1];
          title.textContent = 'Edit Rumah Ibadah';
          await Worship.renderForm(container, id);
        } else if (page.startsWith('detail-ibadah/')) {
          const id = page.split('/')[1];
          title.textContent = 'Detail Rumah Ibadah';
          await Worship.renderDetail(container, id);
        } else {
          // Halaman tidak dikenal (mis. bookmark lama) → kembali ke dashboard
          window.location.hash = 'dashboard';
          return;
        }
    }
    if (window._closeSidebar) window._closeSidebar();
  }

  /* ---------------- Dashboard ringkasan ---------------- */

  async function renderDashboard(container) {
    container.innerHTML = '<div class="loading">Memuat…</div>';
    try {
      const data = await App.api('/api/stats');
      container.innerHTML = `
        <div class="dashboard-intro">
          <div><span class="intro-kicker">Kecamatan Medan Johor</span><h2>Ringkasan data wilayah</h2><p>Pantau data usaha, kebencanaan, dan rumah ibadah dalam satu tampilan.</p></div>
          <div class="intro-date">${new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</div>
        </div>
        <div class="stats-grid">
          ${statBox('store', 'blue', data.totals.total, 'Total Usaha')}
          ${statBox('badge', 'green', data.totals.izin, 'Usaha Berizin')}
          ${statBox('shield', 'orange', data.totals.aman_lengkap, 'Kelengkapan Aman')}
          ${statBox('calendar', 'purple', data.totals.bulan_ini, 'Ditambahkan Bulan Ini')}
          ${statBox('user', 'blue', data.mine, 'Data Saya')}
          ${statBox('waves', 'orange', data.disasterTotals.total, 'Titik Rawan Bencana')}
          ${statBox('landmark', 'purple', data.worshipTotals.total, 'Rumah Ibadah')}
        </div>

        <div class="dashboard-grid">
          <div class="dashboard-card">
            <div class="card-header"><h3>Per Kategori Usaha</h3></div>
            <div class="card-body">${renderChart(data.byKategori, 'kategori_usaha')}</div>
          </div>
          <div class="dashboard-card">
            <div class="card-header"><h3>Per Jenis Kepemilikan</h3></div>
            <div class="card-body">${renderChart(data.byJenis, 'jenis_kepemilikan')}</div>
          </div>
          <div class="dashboard-card">
            <div class="card-header"><h3>Per Skala Usaha</h3></div>
            <div class="card-body">${renderChart(data.bySkala, 'skala_usaha')}</div>
          </div>
          <div class="dashboard-card">
            <div class="card-header"><h3>Per Jumlah Pekerja</h3></div>
            <div class="card-body">${renderChart(data.byPekerja, 'jumlah_pekerja')}</div>
          </div>
          <div class="dashboard-card">
            <div class="card-header"><h3>Jenis Bencana</h3></div>
            <div class="card-body">${renderChart(data.byBencana, 'jenis_bencana')}</div>
          </div>
          <div class="dashboard-card">
            <div class="card-header"><h3>Rumah Ibadah per Agama</h3></div>
            <div class="card-body">${renderChart(data.byIbadah, 'agama')}</div>
          </div>
          <div class="dashboard-card">
            <div class="card-header"><h3>Kelengkapan Keselamatan</h3></div>
            <div class="card-body">${renderChart(data.byKeamanan, 'kelengkapan_keamanan')}</div>
          </div>
          <div class="dashboard-card">
            <div class="card-header"><h3>Aktivitas Terbaru</h3></div>
            <div class="card-body">${renderLogsList(data.recentLogs)}</div>
          </div>
          <div class="dashboard-card full-width">
            <div class="card-header">
              <h3>Data Terbaru</h3>
              <a href="#data" class="btn btn-sm btn-outline">Lihat Semua</a>
            </div>
            <div class="card-body">${renderRecentCards(data.recent)}</div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = errorState(e.message);
    }
  }

  function statBox(icon, color, value, label) {
    return `
      <div class="stat-box">
        <div class="stat-box-icon ${color}">${Icon.i(icon)}</div>
        <div class="stat-box-info">
          <h3>${value}</h3>
          <p>${label}</p>
        </div>
      </div>`;
  }

  function errorState(msg) {
    return `<div class="empty-state"><div class="empty-state-icon">${Icon.i('alert-circle')}</div><h3>Terjadi Kesalahan</h3><p>${App.escapeHtml(msg)}</p></div>`;
  }

  function renderChart(items, key) {
    if (!items.length) return '<p class="text-muted">Belum ada data.</p>';
    const max = Math.max(...items.map(i => i.count));
    return items.map(i => {
      const pct = max > 0 ? (i.count / max * 100) : 0;
      const name = key === 'skala_usaha' ? App.label('SKALA_USAHA', i.name)
        : key === 'jumlah_pekerja' ? App.label('JUMLAH_PEKERJA', i.name)
        : App.escapeHtml(i.name);
      return `
        <div class="bar-row">
          <div class="bar-head">
            <span class="bar-name">${name}</span>
            <span class="bar-val">${i.count}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
  }

  function renderLogsList(logs) {
    if (!logs.length) return '<p class="text-muted">Belum ada aktivitas.</p>';
    const ICON_FOR = { create: 'plus', update: 'pencil', delete: 'trash', auth: 'key' };
    return logs.map(log => {
      const icon = log.action.includes('baru') ? 'create' : log.action.includes('ubah') ? 'update' : log.action.includes('hapus') ? 'delete' : 'auth';
      return `
        <div class="log-item">
          <div class="log-icon ${icon}">${Icon.i(ICON_FOR[icon] || 'info')}</div>
          <div class="log-content">
            <strong>${App.escapeHtml(log.user_nama || log.username || 'Sistem')}</strong>
            <p>${App.escapeHtml(log.detail || log.action)}</p>
            <time>${App.formatDateTime(log.created_at)}</time>
          </div>
        </div>`;
    }).join('');
  }

  function renderRecentCards(items) {
    if (!items.length) return '<p class="text-muted">Belum ada data.</p>';
    return `<div class="recent-grid">${items.map(i => {
      const type = i._type || 'usaha';
      let foto, displayName, subtitle, badge, hash, iconEl;
      if (type === 'ibadah') {
        foto = i._foto; displayName = i._display_name; subtitle = i._subtitle;
        badge = i._badge; hash = i._hash || ('detail-ibadah/' + i.id);
        iconEl = Icon.i('landmark');
      } else if (type === 'bencana') {
        foto = i._foto; displayName = i._display_name; subtitle = i._subtitle;
        badge = i._badge; hash = i._hash || ('detail-bencana/' + i.id);
        iconEl = Icon.i('warning');
      } else if (type === 'dynamic') {
        foto = null; displayName = i._display_name; subtitle = i._subtitle;
        badge = i._badge; hash = i._hash || ('cat-detail-' + i._cat_id + '-' + i.id);
        iconEl = Icon.i('info');
      } else {
        foto = i.foto_usaha; displayName = i.nama_usaha || i._display_name;
        subtitle = i.alamat || i._subtitle; badge = i.kategori_usaha || i._badge;
        hash = 'detail/' + i.id; iconEl = Icon.i('store');
      }
      return `
      <div class="recent-card" onclick="window.location.hash='${App.escapeHtml(hash)}'">
        <div class="recent-card-img" style="${foto ? 'background-image:url(' + foto + ')' : ''}">
          ${foto ? '' : iconEl}
          <div class="recent-card-badge">${App.escapeHtml(badge || '-')}</div>
        </div>
        <div class="recent-card-body">
          <h4>${App.escapeHtml(displayName || '-')}</h4>
          <p>${App.escapeHtml(subtitle || '')}</p>
          <div class="recent-card-meta">
            ${type === 'usaha' ? '<span class="tag">' + App.escapeHtml(i.jenis_kepemilikan || '') + '</span>' + (i.izin_usaha ? '<span class="tag tag-green">Berizin</span>' : '<span class="tag tag-red">Tanpa Izin</span>') : '<span class="tag">' + App.escapeHtml(type === 'ibadah' ? 'Rumah Ibadah' : type === 'bencana' ? 'Titik Rawan Bencana' : (i._subtitle || 'Data Kategori')) + '</span>'}
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  /* ---------------- Daftar data usaha ---------------- */

  async function renderDataPage(container) {
    const meta = await App.fetchMeta();
    container.innerHTML = `
      <div class="data-toolbar">
        <input type="text" class="search-input" id="searchInput" placeholder="Cari nama usaha, alamat, penanggung jawab…">
        <select class="filter-select" id="filterKel">
          <option value="">Semua Kelurahan</option>
          ${(meta.enums.kelurahan || []).map(k => `<option value="${App.escapeHtml(k)}">${App.escapeHtml(k)}</option>`).join('')}
          <option value="__kosong">— Belum diisi —</option>
        </select>
        <select class="filter-select" id="filterKategori">
          <option value="">Semua Kategori</option>
          ${meta.enums.kategori.map(k => `<option value="${k}">${k}</option>`).join('')}
        </select>
        <select class="filter-select" id="filterSkala">
          <option value="">Semua Skala</option>
          ${(meta.enums.skala_usaha || []).map(k => `<option value="${k}">${App.label('SKALA_USAHA', k)}</option>`).join('')}
        </select>
        <select class="filter-select" id="filterPekerja">
          <option value="">Jumlah Pekerja</option>
          ${(meta.enums.jumlah_pekerja || []).map(k => `<option value="${k}">${App.label('JUMLAH_PEKERJA', k)}</option>`).join('')}
        </select>
        <select class="filter-select" id="filterJenis">
          <option value="">Semua Jenis</option>
          ${meta.enums.jenis.map(k => `<option value="${k}">${k}</option>`).join('')}
        </select>
        <select class="filter-select" id="filterIzin">
          <option value="">Izin</option>
          <option value="1">Ada Izin</option>
          <option value="0">Tanpa Izin</option>
        </select>
        ${Auth.isSuperadmin() ? '<button class="btn btn-outline btn-sm" id="filterMine">Hanya Data Saya</button>' : ''}
        ${App.exportButtonsHtml('biz')}
        <a href="#tambah" class="btn btn-primary btn-sm">${Icon.i('plus')} Tambah Data</a>
      </div>
      <div id="dataTableContainer">
        <div class="loading">Memuat…</div>
      </div>
    `;

    let page = 1;
    let mineOnly = false;

    App.wireExportButtons('biz', () => App.categoryIdByName('business'), () => {
      const params = {};
      const search = document.getElementById('searchInput').value;
      const kategori = document.getElementById('filterKategori').value;
      const jenis = document.getElementById('filterJenis').value;
      const izin = document.getElementById('filterIzin').value;
      const kel = document.getElementById('filterKel').value;
      const skala = document.getElementById('filterSkala').value;
      const pekerja = document.getElementById('filterPekerja').value;
      if (search) params.search = search;
      if (kategori) params.kategori_usaha = kategori;
      if (jenis) params.jenis_kepemilikan = jenis;
      if (izin !== '') params.izin_usaha = izin;
      if (kel && kel !== '__kosong') params.kelurahan = kel;
      if (skala) params.skala_usaha = skala;
      if (pekerja) params.jumlah_pekerja = pekerja;
      if (mineOnly) params.mine = '1';
      return params;
    });

    async function loadData() {
      const search = document.getElementById('searchInput').value;
      const kategori = document.getElementById('filterKategori').value;
      const jenis = document.getElementById('filterJenis').value;
      const izin = document.getElementById('filterIzin').value;
      const params = new URLSearchParams({ page, per: 15 });
      if (search) params.set('search', search);
      if (kategori) params.set('kategori', kategori);
      const kel = document.getElementById('filterKel').value;
      if (kel) params.set('kelurahan', kel);
      if (jenis) params.set('jenis', jenis);
      const skala = document.getElementById('filterSkala').value;
      const pekerja = document.getElementById('filterPekerja').value;
      if (skala) params.set('skala', skala);
      if (pekerja) params.set('pekerja', pekerja);
      if (izin !== '') params.set('izin', izin);
      if (mineOnly) params.set('mine', '1');

      try {
        const data = await App.api(`/api/businesses?${params}`);
        document.getElementById('dataTableContainer').innerHTML = renderTable(data);
      } catch (e) {
        document.getElementById('dataTableContainer').innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
      }
    }

    const debouncedLoad = App.debounce(() => { page = 1; loadData(); }, 300);
    document.getElementById('searchInput').addEventListener('input', debouncedLoad);
    ['filterKategori', 'filterKel', 'filterJenis', 'filterSkala', 'filterPekerja', 'filterIzin'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => { page = 1; loadData(); });
    });
    const mineBtn = document.getElementById('filterMine');
    if (mineBtn) {
      mineBtn.addEventListener('click', () => {
        mineOnly = !mineOnly;
        mineBtn.classList.toggle('btn-primary', mineOnly);
        mineBtn.classList.toggle('btn-outline', !mineOnly);
        page = 1;
        loadData();
      });
    }

    window._loadData = loadData;
    window._setPage = (p) => { page = p; loadData(); };

    await loadData();
  }

  function renderTable(data) {
    if (!data.rows.length) {
      return `<div class="empty-state"><div class="empty-state-icon">${Icon.i('inbox')}</div><h3>Belum ada data</h3><p>Mulai tambahkan data usaha baru.</p></div>`;
    }

    let html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr>
        <th>Kode</th><th>Nama Usaha</th><th>Kelurahan</th><th>Kategori</th><th>Skala</th><th>Pekerja</th><th>Jenis</th>
        <th>Izin</th><th>Keselamatan</th><th>PIC</th><th>Alamat</th><th>Tanggal</th><th>Pendata</th><th>Aksi</th>
      </tr></thead><tbody>`;

    for (const r of data.rows) {
      const canEdit = Auth.isSuperadmin() || r.owner_id === user.id;
      html += `<tr>
        <td data-label="Kode"><code>${App.escapeHtml(r.ref)}</code></td>
        <td data-label="Nama Usaha"><a href="#detail/${r.id}">${App.escapeHtml(r.nama_usaha)}</a></td>
        <td data-label="Kelurahan">${r.kelurahan ? `<span class="tag tag-blue">${App.escapeHtml(r.kelurahan)}</span>` : '<span class="text-muted">-</span>'}</td>
        <td data-label="Kategori"><span class="tag">${Icon.i(Icon.kategori(r.kategori_usaha))} ${App.escapeHtml(r.kategori_usaha)}</span></td>
        <td data-label="Skala">${r.skala_usaha ? `<span class="tag">${App.label('SKALA_USAHA', r.skala_usaha)}</span>` : '<span class="text-muted">-</span>'}</td>
        <td data-label="Pekerja">${App.label('JUMLAH_PEKERJA', r.jumlah_pekerja)}</td>
        <td data-label="Jenis">${App.escapeHtml(r.jenis_kepemilikan)}</td>
        <td data-label="Izin">${r.izin_usaha ? '<span class="tag tag-green">Ada</span>' : '<span class="tag tag-red">Tidak</span>'}</td>
        <td data-label="Keselamatan">${renderKeamanan(r.kelengkapan_keamanan)}</td>
        <td data-label="Penanggung Jawab">${App.escapeHtml(r.nama_pic)}</td>
        <td data-label="Alamat" title="${App.escapeHtml(r.alamat)}">${App.escapeHtml(r.alamat.substring(0, 30))}${r.alamat.length > 30 ? '…' : ''}</td>
        <td data-label="Tanggal">${App.formatDate(r.created_at)}</td>
        <td data-label="Pendata"><small>${App.escapeHtml(r.owner_nama || '-')}</small></td>
        <td class="actions" data-label="Aksi">
          <button class="btn-icon" onclick="window.location.hash='detail/${r.id}'" title="Detail" aria-label="Detail">${Icon.i('eye')}</button>
          ${canEdit ? `<button class="btn-icon" onclick="window.location.hash='edit/${r.id}'" title="Edit" aria-label="Edit">${Icon.i('pencil')}</button>
          <button class="btn-icon is-danger" onclick="Dashboard.deleteBusiness(${r.id},'${App.escapeHtml(r.nama_usaha)}')" title="Hapus" aria-label="Hapus">${Icon.i('trash')}</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table></div>';

    const totalPages = Math.ceil(data.total / data.per);
    if (totalPages > 1) {
      html += '<div class="pagination">';
      html += `<button ${data.page <= 1 ? 'disabled' : ''} onclick="window._setPage(${data.page - 1})">‹ Sebelumnya</button>`;
      for (let i = 1; i <= totalPages && i <= 7; i++) {
        html += `<button class="${i === data.page ? 'active' : ''}" onclick="window._setPage(${i})">${i}</button>`;
      }
      if (totalPages > 7) html += `<button disabled>… ${totalPages}</button>`;
      html += `<button ${data.page >= totalPages ? 'disabled' : ''} onclick="window._setPage(${data.page + 1})">Berikutnya ›</button>`;
      html += '</div>';
    }
    return html;
  }

  function renderKeamanan(k) {
    if (k === 'LENGKAP') return '<span class="tag tag-green">Lengkap</span>';
    if (k === 'KURANG LENGKAP') return '<span class="tag tag-orange">Kurang Lengkap</span>';
    return '<span class="tag tag-red">Tidak Lengkap</span>';
  }

  /* ---------------- Detail usaha ---------------- */

  async function renderDetail(container, id) {
    container.innerHTML = '<div class="loading">Memuat…</div>';
    try {
      const data = await App.api(`/api/businesses/${id}`);
      const b = data.business;
      const canEdit = Auth.isSuperadmin() || b.owner_id === user.id;

      container.innerHTML = `
        <div class="dashboard-card">
          <div class="card-header">
            <h3>${App.escapeHtml(b.ref)} — ${App.escapeHtml(b.nama_usaha)}</h3>
            <div class="flex gap-1 wrap">
              ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="window.location.hash='edit/${b.id}'">${Icon.i('pencil')} Edit</button>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="window.location.hash='data'">${Icon.i('arrow-left')} Kembali</button>
            </div>
          </div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail-images">
                ${b.foto_usaha ? `<figure><figcaption>Foto Usaha</figcaption><img src="${b.foto_usaha}" alt="Foto usaha"></figure>` : '<div class="no-photo">Tidak ada foto usaha</div>'}
                ${b.izin_foto ? `<figure><figcaption>Dokumen Izin</figcaption><img src="${b.izin_foto}" alt="Izin usaha"></figure>` : ''}
              </div>
              <div class="detail-info">
                <dl>
                  <dt>Kategori</dt><dd>${App.escapeHtml(b.kategori_usaha)}</dd>
                  <dt>Jenis Kepemilikan</dt><dd>${App.escapeHtml(b.jenis_kepemilikan)}</dd>
                  <dt>Skala Usaha</dt><dd>${b.skala_usaha ? `<span class="tag">${App.label('SKALA_USAHA', b.skala_usaha)}</span>` : '<span class="text-muted">Belum diisi</span>'}</dd>
                  <dt>Jumlah Pekerja</dt><dd>${b.jumlah_pekerja ? App.label('JUMLAH_PEKERJA', b.jumlah_pekerja) : '<span class="text-muted">Belum diisi</span>'}</dd>
                  <dt>Izin Usaha</dt><dd>${b.izin_usaha ? '<span class="tag tag-green">Ada</span>' : '<span class="tag tag-red">Tidak Ada</span>'}</dd>
                  <dt>Kelengkapan Keselamatan</dt><dd>${renderKeamanan(b.kelengkapan_keamanan)}</dd>
                  <dt>Penanggung Jawab</dt><dd>${App.escapeHtml(b.nama_pic)}</dd>
                  <dt>Nomor HP</dt><dd><a href="tel:${b.hp_pic}">${App.escapeHtml(b.hp_pic)}</a></dd>
                  <dt>Kelurahan</dt><dd>${b.kelurahan ? `<span class="tag tag-blue">${App.escapeHtml(b.kelurahan)}</span>` : '<span class="text-muted">Belum diisi</span>'}</dd>
                  <dt>Alamat</dt><dd>${App.escapeHtml(b.alamat)}</dd>
                  ${b.lat && b.lng ? `<dt>Koordinat</dt><dd>${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}</dd>` : ''}
                  <dt>Pendata</dt><dd>${App.escapeHtml(b.owner_nama || '-')} (${App.escapeHtml(b.owner_username || '')})</dd>
                  <dt>Dibuat</dt><dd>${App.formatDateTime(b.created_at)}</dd>
                  ${b.updated_at ? `<dt>Terakhir Diubah</dt><dd>${App.formatDateTime(b.updated_at)}</dd>` : ''}
                </dl>
              </div>
            </div>
            ${b.lat && b.lng ? `
              <div class="mt-3">
                <h4 class="mb-2">Lokasi di Peta</h4>
                <div id="detailMap" class="detail-map"></div>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      if (b.lat && b.lng) {
        const map = L.map('detailMap').setView([b.lat, b.lng], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
        L.marker([b.lat, b.lng]).addTo(map).bindPopup(`<strong>${App.escapeHtml(b.nama_usaha)}</strong>`).openPopup();
      }
    } catch (e) {
      container.innerHTML = errorState(e.message);
    }
  }

  async function deleteBusiness(id, nama) {
    Modal.confirm('Hapus Data', `Hapus data usaha "${nama}"? Tindakan ini tidak dapat dibatalkan.`, async () => {
      try {
        await App.api(`/api/businesses/${id}`, { method: 'DELETE' });
        Toast.success('Data berhasil dihapus.');
        if (window.location.hash.includes('detail/')) {
          window.location.hash = 'data';
        } else if (window._loadData) {
          window._loadData();
        }
      } catch (e) {
        Toast.error(e.message);
      }
    });
  }

  /* ---------------- Log aktivitas ---------------- */

  async function renderLogsPage(container) {
    container.innerHTML = `
      <div class="data-toolbar">
        <input type="text" class="search-input" id="logSearch" placeholder="Cari aktivitas…">
        <a href="/api/logs/export" class="btn btn-sm btn-outline" target="_blank" rel="noopener">${Icon.i('download')} Export CSV</a>
      </div>
      <div id="logsContainer"><div class="loading">Memuat…</div></div>
    `;

    let page = 1;
    async function loadLogs() {
      const q = document.getElementById('logSearch').value;
      const params = new URLSearchParams({ page, per: 25 });
      if (q) params.set('q', q);
      try {
        const data = await App.api(`/api/logs?${params}`);
        const el = document.getElementById('logsContainer');
        if (!data.rows.length) {
          el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('scroll')}</div><h3>Belum ada aktivitas</h3></div>`;
          return;
        }
        el.innerHTML = `<div class="dashboard-card"><div class="card-body">${renderLogsList(data.rows)}</div></div>`;
      } catch (e) {
        document.getElementById('logsContainer').innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
      }
    }

    document.getElementById('logSearch').addEventListener('input', App.debounce(() => { page = 1; loadLogs(); }));
    await loadLogs();
  }

  async function renderMapPage(container) {
    container.innerHTML = '<div class="loading">Memuat peta…</div>';
    await MapModule.mount(container);
  }

  /* -------- Dynamic category nav -------- */

  async function refreshDynamicNav() {
    const navSection = document.getElementById('dynamicNavSection');
    if (!navSection) return;
    try {
      // Hanya load jika user sudah login (Auth.me sudah dipanggil di init)
      const res = await fetch('/api/categories', { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) { navSection.innerHTML = ''; return; }
      const data = await res.json();
      const activeCats = (data.categories || []).filter(c => c.active && !c.is_system);

      if (!activeCats.length) {
        navSection.innerHTML = '';
        return;
      }

      const iconSvg = (name) => {
        // Buat SVG sederhana untuk ikon kategori
        const icons = {
          database: '<path d="M12 3C7 3 3 4.8 3 7s4 4 9 4 9-1.8 9-4-4-4-9-4z"/><path d="M3 7v5c0 2.2 4 4 9 4s9-1.8 9-4V7"/><path d="M3 12v5c0 2.2 4 4 9 4s9-1.8 9-4v-5"/>',
          home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/>',
          heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.7 1.2-1.1a5.5 5.5 0 0 0 0-7.6z"/>',
          users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.7a3.2 3.2 0 0 1 0 5.6M17.6 14.9c1.6.8 2.6 2.3 2.9 4.6"/>',
          'map-pin': '<path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
          book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
          star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
          briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
          activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
          shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
          truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 4v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
          tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
        };
        const d = icons[name] || icons.database;
        return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
      };

      // Setiap kategori baru otomatis mendapat bagiannya sendiri di menu,
      // sama seperti bagian Usaha, Bencana, dan Rumah Ibadah.
      navSection.innerHTML = activeCats.map(cat => `
        <div class="nav-divider"><span>${App.escapeHtml(cat.display_name)}</span></div>
        <a href="#cat-data-${cat.id}" class="nav-item" data-page="cat-data-${cat.id}" data-dynamic="true">
          ${iconSvg(cat.icon || 'database')}
          <span>${App.escapeHtml(cat.display_name)}</span>
        </a>
        <a href="#cat-add-${cat.id}" class="nav-item" data-page="cat-add-${cat.id}" data-dynamic="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          <span>Tambah ${App.escapeHtml(cat.display_name)}</span>
        </a>
      `).join('');

      // Pasang event listener untuk nav items dinamis
      navSection.querySelectorAll('.nav-item[data-dynamic]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const pg = item.dataset.page;
          if (window.location.hash.slice(1) === pg) navigateTo(pg);
          else window.location.hash = pg;
        });
      });
    } catch (_) {
      navSection.innerHTML = '';
    }
  }

  return { init, navigateTo, deleteBusiness, refreshDynamicNav };
})();

// Expose globally
window.Dashboard = Dashboard;

// Auto-init on dashboard page
if (document.getElementById('sidebar')) {
  Dashboard.init();
}
