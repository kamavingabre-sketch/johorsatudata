# JohorSatuData — Sistem Pendataan Usaha Kecamatan Medan Johor

Platform pendataan usaha digital untuk Kecamatan Medan Johor dengan peta interaktif, form pendataan lengkap, dan dashboard multi-level akses.

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## ✨ Fitur Utama

### 🗺️ Peta Interaktif
- Visualisasi lokasi usaha dalam peta digital (Leaflet/OpenStreetMap)
- Klik pin untuk melihat detail lengkap: foto, alamat, penanggung jawab
- Filter dan pencarian lokasi

### 📝 Form Pendataan Lengkap
- **Informasi Usaha**: Nama, jenis kepemilikan (PT/CV/Yayasan/Perseorangan), kategori usaha
- **Izin & Keselamatan**: Status izin usaha + foto dokumen, kelengkapan keselamatan
- **Penanggung Jawab**: Nama dan nomor HP
- **Foto & Lokasi**: Upload foto usaha + pin lokasi di peta
- **Kolom Dinamis**: Superadmin dapat menambah/menghapus kolom form tambahan

### 🔐 Multi-Level Access
- **Superadmin**: Akses penuh — CRUD semua data, kelola admin, lihat log aktivitas, kelola kolom form
- **Admin**: Input data, edit/hapus data sendiri, lihat semua data

### 📊 Dashboard & Laporan
- Statistik total usaha, usaha berizin, kelengkapan keselamatan
- Grafik per kategori, jenis kepemilikan, kelengkapan keselamatan
- Log aktivitas lengkap (siapa melakukan apa, kapan)
- Export log ke CSV

### 🎯 Fitur Teknis
- **Single Page Application** (vanilla JS, tanpa framework)
- **Database SQLite** (sql.js — murni JavaScript, tanpa kompilasi native)
- **Upload foto** dengan validasi ukuran (maks 8 MB)
- **Responsive design** — berfungsi di desktop dan mobile
- **Real-time validation** pada form
- **Activity logging** untuk audit trail

---

## 🚀 Instalasi di Ubuntu Server

### Prasyarat

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi
node -v  # Harus v18 atau lebih tinggi
npm -v
```

### Langkah Instalasi

```bash
# 1. Clone atau upload project ke server
cd /opt  # atau lokasi pilihan Anda
git clone <repository-url> johorsatudata
cd johorsatudata

# 2. Install dependencies
npm install

# 3. Buat folder data
mkdir -p data/uploads

# 4. (Opsional) Seed data contoh
node scripts/seed-samples.js

# 5. Jalankan server (testing)
npm start
```

Server akan berjalan di `http://localhost:3000`

### Akses Aplikasi

- **Landing Page**: `http://IP-SERVER:3000/`
- **Login**: `http://IP-SERVER:3000/login.html`
- **Dashboard**: `http://IP-SERVER:3000/dashboard.html`

### Kredensial Default

| Role | Username | Password |
|------|----------|----------|
| Superadmin | `superadmin` | `Johor2026!` |
| Admin (sample) | `admin1` | `Admin2026!` |

⚠️ **PENTING**: Segera ubah password setelah login pertama kali!

---

## 🔧 Konfigurasi

### Environment Variables (Opsional)

Buat file `.env` di root project:

```bash
PORT=3000              # Port server (default: 3000)
HOST=0.0.0.0           # Bind address (0.0.0.0 untuk akses dari luar)
DATA_DIR=./data        # Folder penyimpanan database & upload
JWT_SECRET=your-secret # Auto-generated jika tidak diisi
```

### Folder Structure

```
johorsatudata/
├── server.js              # Entry point
├── package.json
├── src/
│   ├── config.js          # Konfigurasi
│   ├── db.js              # Database wrapper (sql.js)
│   ├── util.js            # Utility functions
│   └── routes/            # API routes
│       ├── auth.js
│       ├── businesses.js
│       ├── users.js
│       ├── fields.js
│       ├── stats.js
│       └── logs.js
├── public/                # Frontend files
│   ├── index.html         # Landing page
│   ├── login.html
│   ├── dashboard.html
│   ├── css/
│   ├── js/
│   └── images/
├── data/                  # Runtime data (auto-created)
│   ├── app.db             # SQLite database
│   ├── secret.key         # JWT secret (auto-generated)
│   └── uploads/           # Uploaded files
└── scripts/
    └── seed-samples.js    # Sample data seeder
```

---

## 🌐 Deploy dengan PM2 (Production)

### Install PM2

```bash
sudo npm install -g pm2
```

### Jalankan dengan PM2

```bash
# Start application
pm2 start server.js --name johorsatudata

# Enable auto-start on boot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs johorsatudata

# Restart
pm2 restart johorsatudata

# Stop
pm2 stop johorsatudata
```

### Setup Reverse Proxy (Nginx)

```bash
sudo apt install nginx
```

Buat config `/etc/nginx/sites-available/johorsatudata`:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Ganti dengan domain/IP Anda

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    client_max_body_size 10M;  # Untuk upload foto
}
```

Aktifkan:

```bash
sudo ln -s /etc/nginx/sites-available/johorsatudata /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Setup HTTPS (Opsional dengan Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 📱 Cara Penggunaan

### 1. Login sebagai Superadmin

1. Buka `http://IP-SERVER:3000/login.html`
2. Login dengan username `superadmin` dan password `Johor2026!`
3. Anda akan diminta mengubah password (wajib)

### 2. Tambah Admin Baru

1. Di dashboard, klik **Kelola Admin** di sidebar
2. Klik **+ Tambah Admin**
3. Isi form:
   - Username (3-32 karakter, huruf kecil/angka)
   - Nama lengkap
   - Role: Admin
   - Password (minimal 8 karakter)
4. Klik **Tambah**

### 3. Tambah Data Usaha

1. Klik **Tambah Data** di sidebar
2. Lengkapi form:
   - **Informasi Usaha**: Nama, jenis kepemilikan, kategori
   - **Izin & Keselamatan**: Status izin (upload foto jika ada), kelengkapan keselamatan
   - **Penanggung Jawab**: Nama dan HP
   - **Foto Usaha**: Upload foto (wajib)
   - **Lokasi**: Klik pada peta untuk menandai lokasi
3. Klik **Simpan Data**

### 4. Lihat Data di Peta

1. Klik **Peta Usaha** di sidebar
2. Klik pin marker untuk melihat detail usaha
3. Klik **Lihat Detail** untuk informasi lengkap

### 5. Kelola Kolom Form (Superadmin)

1. Klik **Kolom Form** di sidebar
2. Klik **+ Tambah Kolom**
3. Pilih tipe kolom:
   - Teks, Angka, Tanggal
   - Pilihan (Dropdown)
   - Ya/Tidak
   - Nomor Telepon
   - Foto
4. Kolom baru akan muncul di form pendataan

### 6. Monitor Aktivitas

1. Klik **Log Aktivitas** di sidebar
2. Lihat siapa yang menambahkan, mengubah, atau menghapus data
3. Export ke CSV dengan tombol **Export CSV**

---

## 🔒 Keamanan

### Fitur Keamanan Built-in

- ✅ Password di-hash dengan bcrypt
- ✅ JWT token dengan expiration 12 jam
- ✅ Rate limiting pada login (mencegah brute force)
- ✅ HTTP-only cookies
- ✅ Input validation & sanitization
- ✅ SQL injection protection (parameterized queries)
- ✅ XSS protection (HTML escaping)
- ✅ File upload validation (type & size)

### Best Practices

1. **Ubah password default** segera setelah instalasi
2. **Gunakan HTTPS** di production
3. **Backup database** secara berkala (`data/app.db`)
4. **Update dependencies** secara rutin (`npm update`)
5. **Monitor logs** untuk aktivitas mencurigakan

---

## 💾 Backup & Restore

### Backup

```bash
# Backup database
cp data/app.db data/app.db.backup.$(date +%Y%m%d)

# Backup uploads
tar -czf data/uploads.backup.$(date +%Y%m%d).tar.gz data/uploads/
```

### Restore

```bash
# Restore database
cp data/app.db.backup.20260922 data/app.db

# Restore uploads
tar -xzf data/uploads.backup.20260922.tar.gz -C data/

# Restart server
pm2 restart johorsatudata
```

---

## 🐛 Troubleshooting

### Port 3000 sudah terpakai

```bash
# Cek process yang menggunakan port
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Atau gunakan port lain
PORT=3001 npm start
```

### Error: Cannot find module

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Upload foto gagal

```bash
# Cek permission folder uploads
chmod -R 755 data/uploads

# Cek disk space
df -h
```

### Database locked

```bash
# Stop server
pm2 stop johorsatudata

# Backup database
cp data/app.db data/app.db.broken

# Restart (akan create new DB jika corrupt)
pm2 restart johorsatudata
```

---

## 📊 API Endpoints

### Public

- `GET /api/public/summary` — Statistik untuk landing page
- `GET /api/meta` — Metadata (kategori, jenis, dll)

### Auth

- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user
- `POST /api/auth/change-password` — Ubah password

### Businesses

- `GET /api/businesses` — List semua (dengan filter & pagination)
- `GET /api/businesses/:id` — Detail
- `POST /api/businesses` — Tambah (multipart/form-data)
- `PUT /api/businesses/:id` — Edit (multipart/form-data)
- `DELETE /api/businesses/:id` — Hapus
- `GET /api/businesses/map/all` — Semua lokasi untuk peta

### Users (Superadmin only)

- `GET /api/users` — List semua admin
- `POST /api/users` — Tambah admin
- `PUT /api/users/:id` — Edit admin
- `DELETE /api/users/:id` — Hapus admin

### Fields (Superadmin only)

- `GET /api/fields` — List semua kolom
- `POST /api/fields` — Tambah kolom
- `PUT /api/fields/:id` — Edit kolom
- `DELETE /api/fields/:id` — Hapus kolom

### Stats & Logs

- `GET /api/stats` — Dashboard statistics
- `GET /api/logs` — Activity logs
- `GET /api/logs/export` — Export CSV

---

## 🛠️ Development

### Run in Development Mode

```bash
npm run dev
```

Server akan auto-restart saat ada perubahan file.

### Reset Database

```bash
# Hapus database
rm -rf data/

# Restart server (akan create new DB)
npm start

# (Opsional) Seed sample data
node scripts/seed-samples.js
```

### Tambah Sample Data

```bash
node scripts/seed-samples.js
```

---

## 📝 License

MIT License — Bebas digunakan untuk keperluan pemerintah, pendidikan, dan komersial.

---

## 👥 Kontributor

Dikembangkan untuk **Kecamatan Medan Johor** sebagai bagian dari inisiatif digitalisasi pendataan usaha.

---

## 📞 Support

Untuk bantuan teknis atau pertanyaan:

1. Cek dokumentasi di README ini
2. Review log error di `pm2 logs johorsatudata`
3. Periksa folder `data/` untuk database dan uploads

---

## 🎯 Roadmap (Future Enhancements)

- [ ] Export data ke Excel/PDF
- [ ] Filter advanced (tanggal, multi-kategori)
- [ ] Notifikasi email untuk aktivitas penting
- [ ] Mobile app (React Native)
- [ ] Integrasi dengan sistem pemerintah daerah
- [ ] Dashboard analytics lanjutan
- [ ] Multi-language support

---

**Dibuat dengan ❤️ untuk Kecamatan Medan Johor**
