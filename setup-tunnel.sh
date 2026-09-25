#!/bin/bash
# ========================================
# Cloudflare Tunnel Setup — JohorSatuData
# Domain: johorsatudata.dpdns.org
# Port: 4000
# ========================================
# Jalankan: sudo bash setup-tunnel.sh

set -e

DOMAIN="johorsatudata.dpdns.org"
PORT=4000
TUNNEL_NAME="johorsatudata"
TUNNEL_UUID="ad2eb55d-8ee9-4422-8534-ed7e3f6995c5"
REAL_USER="${SUDO_USER:-$USER}"
CONFIG_DIR="/home/$REAL_USER/.cloudflared"

echo "============================================"
echo "  Cloudflare Tunnel — JohorSatuData"
echo "============================================"
echo "  Domain : https://$DOMAIN"
echo "  Port   : $PORT"
echo "  Tunnel : $TUNNEL_NAME"
echo "  UUID   : $TUNNEL_UUID"
echo "============================================"
echo ""

# Step 1: Buat konfigurasi
echo "📝 Step 1: Membuat konfigurasi tunnel..."
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/config.yml" << EOF
tunnel: $TUNNEL_UUID
credentials-file: $CONFIG_DIR/$TUNNEL_UUID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$PORT
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      keepAliveTimeout: 90s
  - service: http_status:404
EOF

chown -R "$REAL_USER:$REAL_USER" "$CONFIG_DIR"
echo "   ✅ Konfigurasi dibuat: $CONFIG_DIR/config.yml"

# Step 2: Route DNS
echo ""
echo "🌐 Step 2: Menghubungkan DNS..."
sudo -u "$REAL_USER" cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>&1 || echo "   (DNS route mungkin sudah ada, melanjutkan...)"
echo "   ✅ DNS route dikonfigurasi"

# Step 3: Install service
echo ""
echo "⚙️  Step 3: Install sebagai systemd service..."
cloudflared service install 2>&1 || echo "   (Service mungkin sudah ada, melanjutkan...)"
systemctl daemon-reload
systemctl enable cloudflared 2>/dev/null
echo "   ✅ Service terinstal"

# Step 4: Start tunnel
echo ""
echo "🚀 Step 4: Menjalankan tunnel..."
systemctl restart cloudflared
sleep 3
echo "   ✅ Tunnel berjalan!"

# Step 5: Status
echo ""
echo "============================================"
echo "  ✅ Cloudflare Tunnel Aktif!"
echo "============================================"
echo ""
echo "  🌐 URL Publik: https://$DOMAIN"
echo ""
echo "  📋 Perintah:"
echo "     sudo systemctl status cloudflared     — Cek status"
echo "     sudo journalctl -u cloudflared -f     — Lihat log"
echo "     sudo systemctl restart cloudflared    — Restart"
echo "     sudo systemctl stop cloudflared       — Stop"
echo ""
echo "  📁 File:"
echo "     $CONFIG_DIR/config.yml"
echo "     $CONFIG_DIR/$TUNNEL_UUID.json"
echo ""
echo "  ⚠️  Pastikan:"
echo "     1. Aplikasi running di port $PORT"
echo "     2. DNS propagation selesai (1-5 menit)"
echo "     3. Domain dpdns.org sudah aktif di Cloudflare"
echo ""

# Check status
echo "  Status tunnel:"
systemctl status cloudflared --no-pager -l 2>&1 | head -10 || true
