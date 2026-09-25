#!/bin/bash
# ========================================
# JohorSatuData — Cloudflare Tunnel Setup
# ========================================
# Cara pakai:
#   chmod +x setup-cloudflare.sh
#   sudo ./setup-cloudflare.sh
#
# Script ini akan:
#   1. Install cloudflared
#   2. Login ke akun Cloudflare Anda
#   3. Buat tunnel bernama "johorsatudata"
#   4. Konfigurasi DNS
#   5. Install sebagai systemd service (auto-start)
#
# Prasyarat:
#   - Domain sudah ditambahkan ke Cloudflare
#   - Server bisa akses internet

set -e

echo "============================================"
echo "  Cloudflare Tunnel Setup"
echo "  JohorSatuData — Medan Johor"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "⚠️  Script ini perlu dijalankan dengan sudo: sudo ./setup-cloudflare.sh"
  exit 1
fi

REAL_USER="${SUDO_USER:-$USER}"
APP_PORT="${APP_PORT:-3000}"
TUNNEL_NAME="johorsatudata"

# ---- Step 1: Install cloudflared ----
echo "📦 Step 1: Install cloudflared..."
if command -v cloudflared &> /dev/null; then
    echo "   ✅ cloudflared sudah terinstal: $(cloudflared --version 2>&1)"
else
    echo "   Menginstal cloudflared..."
    ARCH=$(dpkg --print-architecture)
    if [ "$ARCH" = "amd64" ]; then
        curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
    elif [ "$ARCH" = "arm64" ]; then
        curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o /tmp/cloudflared.deb
    elif [ "$ARCH" = "armhf" ]; then
        curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm.deb -o /tmp/cloudflared.deb
    else
        echo "   ❌ Arsitektur tidak didukung: $ARCH"
        exit 1
    fi
    dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
    echo "   ✅ cloudflared terinstal: $(cloudflared --version 2>&1)"
fi

echo ""
echo "============================================"
echo "  Pilih mode tunnel:"
echo "============================================"
echo ""
echo "  1) Quick Tunnel (Tanpa Akun Cloudflare)"
echo "     → URL random: https://xxxx.trycloudflare.com"
echo "     → Cocok untuk testing/demo"
echo "     → URL berubah setiap restart"
echo ""
echo "  2) Named Tunnel (Dengan Akun Cloudflare)"
echo "     → Domain custom: https://data.domainanda.com"
echo "     → Cocok untuk production"
echo "     → Butuh domain di Cloudflare"
echo ""
read -p "Pilih [1/2]: " MODE

if [ "$MODE" = "1" ]; then
    echo ""
    echo "🚀 Memulai Quick Tunnel..."
    echo "   URL akan muncul di bawah ini:"
    echo "   (Tekan Ctrl+C untuk menghentikan)"
    echo ""
    
    # Create systemd service for quick tunnel
    cat > /etc/systemd/system/johorsatudata-tunnel.service << EOF
[Unit]
Description=JohorSatuData Cloudflare Quick Tunnel
After=network.target

[Service]
Type=simple
User=$REAL_USER
ExecStart=/usr/bin/cloudflared tunnel --url http://localhost:$APP_PORT --no-autoupdate
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable johorsatudata-tunnel
    systemctl start johorsatudata-tunnel
    
    echo ""
    echo "✅ Quick Tunnel berjalan!"
    echo ""
    echo "   Lihat URL tunnel:"
    echo "   sudo journalctl -u johorsatudata-tunnel -f --no-pager | grep trycloudflare.com"
    echo ""
    echo "   Atau lihat log:"
    echo "   sudo journalctl -u johorsatudata-tunnel -f"
    echo ""
    echo "   Stop tunnel:"
    echo "   sudo systemctl stop johorsatudata-tunnel"
    echo ""

elif [ "$MODE" = "2" ]; then
    echo ""
    echo "🔐 Step 2: Login ke Cloudflare..."
    echo "   Browser akan terbuka. Login dan pilih domain yang ingin digunakan."
    echo ""
    
    # Run as the actual user (not root) for login
    sudo -u "$REAL_USER" cloudflared tunnel login
    
    echo ""
    echo "🔧 Step 3: Buat tunnel '$TUNNEL_NAME'..."
    sudo -u "$REAL_USER" cloudflared tunnel create "$TUNNEL_NAME" 2>/dev/null || echo "   (Tunnel sudah ada, melanjutkan...)"
    
    # Get tunnel UUID
    TUNNEL_UUID=$(sudo -u "$REAL_USER" cloudflared tunnel list --name "$TUNNEL_NAME" --output json 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$TUNNEL_UUID" ]; then
        echo "   ❌ Gagal mendapatkan UUID tunnel"
        exit 1
    fi
    
    echo "   ✅ Tunnel UUID: $TUNNEL_UUID"
    
    echo ""
    read -p "   Masukkan domain untuk tunnel (contoh: data.domainanda.com): " DOMAIN
    
    if [ -z "$DOMAIN" ]; then
        echo "   ❌ Domain tidak boleh kosong"
        exit 1
    fi
    
    echo ""
    echo "📝 Step 4: Membuat konfigurasi tunnel..."
    
    # Create config directory
    CONFIG_DIR="/home/$REAL_USER/.cloudflared"
    mkdir -p "$CONFIG_DIR"
    
    cat > "$CONFIG_DIR/config.yml" << EOF
tunnel: $TUNNEL_UUID
credentials-file: $CONFIG_DIR/$TUNNEL_UUID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$APP_PORT
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      keepAliveTimeout: 90s
      # Allow file uploads up to 10MB
      # (Cloudflare free plan allows up to 100MB)
  - service: http_status:404
EOF

    chown -R "$REAL_USER:$REAL_USER" "$CONFIG_DIR"
    
    echo "   ✅ Konfigurasi dibuat: $CONFIG_DIR/config.yml"
    
    echo ""
    echo "🌐 Step 5: Konfigurasi DNS..."
    sudo -u "$REAL_USER" cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"
    echo "   ✅ DNS route ditambahkan"
    
    echo ""
    echo "⚙️  Step 6: Install sebagai systemd service..."
    sudo -u "$REAL_USER" cloudflared service install
    systemctl enable cloudflared
    systemctl start cloudflared
    
    echo ""
    echo "============================================"
    echo "  ✅ Cloudflare Tunnel Berhasil Disetup!"
    echo "============================================"
    echo ""
    echo "  🌐 URL: https://$DOMAIN"
    echo ""
    echo "  📋 Perintah yang berguna:"
    echo "     systemctl status cloudflared    - Cek status"
    echo "     journalctl -u cloudflared -f    - Lihat log"
    echo "     systemctl restart cloudflared   - Restart"
    echo "     systemctl stop cloudflared      - Stop"
    echo ""
    echo "  📁 File konfigurasi:"
    echo "     $CONFIG_DIR/config.yml"
    echo "     $CONFIG_DIR/$TUNNEL_UUID.json"
    echo ""
else
    echo "   ❌ Pilihan tidak valid"
    exit 1
fi

echo "============================================"
