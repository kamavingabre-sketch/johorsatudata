#!/bin/bash
# ========================================
# JohorSatuData — Setup Script untuk Ubuntu Server
# ========================================
# Cara pakai: chmod +x setup.sh && sudo ./setup.sh

set -e

echo "============================================"
echo "  JohorSatuData - Setup Script"
echo "  Sistem Pendataan Usaha Medan Johor"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "⚠️  Script ini perlu dijalankan dengan sudo: sudo ./setup.sh"
  exit 1
fi

# Get the actual user (not root)
REAL_USER="${SUDO_USER:-$USER}"
INSTALL_DIR="/opt/johorsatudata"

echo "📦 Mengupdate sistem..."
apt update -y && apt upgrade -y

echo ""
echo "📦 Memeriksa Node.js..."
if ! command -v node &> /dev/null; then
    echo "   Menginstal Node.js 18 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
else
    echo "   ✅ Node.js sudah terinstal: $(node -v)"
fi

echo ""
echo "📦 Memeriksa npm..."
if ! command -v npm &> /dev/null; then
    apt install -y npm
else
    echo "   ✅ npm sudah terinstal: $(npm -v)"
fi

echo ""
echo "📦 Memeriksa PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "   Menginstal PM2..."
    npm install -g pm2
else
    echo "   ✅ PM2 sudah terinstal"
fi

echo ""
echo "📁 Menyiapkan folder instalasi..."
if [ ! -d "$INSTALL_DIR" ]; then
    mkdir -p "$INSTALL_DIR"
    echo "   Folder $INSTALL_DIR dibuat"
else
    echo "   ✅ Folder $INSTALL_DIR sudah ada"
fi

# Copy project files (assuming script is run from project root)
if [ -f "package.json" ]; then
    echo "   Menyalin file project..."
    cp -r . "$INSTALL_DIR/" 2>/dev/null || true
    cd "$INSTALL_DIR"
fi

echo ""
echo "📦 Menginstal dependencies..."
cd "$INSTALL_DIR"
npm install --production

echo ""
echo "📁 Menyiapkan folder data..."
mkdir -p data/uploads
chown -R "$REAL_USER:$REAL_USER" data/

echo ""
echo "🔐 Menyiapkan permission..."
chmod 600 data/secret.key 2>/dev/null || true
chown -R "$REAL_USER:$REAL_USER" "$INSTALL_DIR"

echo ""
echo "🌱 Menjalankan seed data..."
sudo -u "$REAL_USER" node scripts/seed-samples.js || echo "   (Seed data opsional)"

echo ""
echo "🚀 Menjalankan aplikasi dengan PM2..."
sudo -u "$REAL_USER" pm2 delete johorsatudata 2>/dev/null || true
sudo -u "$REAL_USER" pm2 start server.js --name johorsatudata
sudo -u "$REAL_USER" pm2 save

echo ""
echo "⚙️  Mengkonfigurasi auto-start PM2..."
pm2 startup systemd -u "$REAL_USER" --hp "/home/$REAL_USER" 2>/dev/null || true

echo ""
echo "🔧 Mengkonfigurasi firewall (UFW)..."
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    echo "   ✅ Port 3000, 80, 443 dibuka"
else
    echo "   ⚠️  UFW tidak terinstal. Install dengan: sudo apt install ufw"
fi

echo ""
echo "============================================"
echo "  ✅ Instalasi selesai!"
echo "============================================"
echo ""
echo "  🌐 Akses aplikasi:"
echo "     Landing Page: http://$(hostname -I | awk '{print $1}'):3000"
echo "     Login:        http://$(hostname -I | awk '{print $1}'):3000/login.html"
echo ""
echo "  👤 Kredensial default:"
echo "     Superadmin: username=superadmin, password=Johor2026!"
echo "     Admin:      username=admin1,     password=Admin2026!"
echo ""
echo "  ⚠️  PENTING: Segera ubah password setelah login pertama!"
echo ""
echo "  📋 Perintah PM2 yang berguna:"
echo "     pm2 status              - Cek status"
echo "     pm2 logs johorsatudata  - Lihat log"
echo "     pm2 restart johorsatudata - Restart"
echo "     pm2 stop johorsatudata    - Stop"
echo ""
echo "  📁 Folder data: $INSTALL_DIR/data/"
echo "     - app.db       : Database SQLite"
echo "     - uploads/     : Foto yang diupload"
echo "     - secret.key   : JWT secret (auto-generated)"
echo ""
echo "============================================"
