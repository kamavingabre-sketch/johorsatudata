#!/bin/bash
# ========================================
# Quick Cloudflare Tunnel (No Account Required)
# ========================================
# Jalankan: ./quick-tunnel.sh
#
# Memberikan URL publik random secara instan.
# URL berubah setiap kali script dijalankan ulang.

APP_PORT="${1:-3000}"

echo "🚀 Quick Tunnel — JohorSatuData"
echo "   Port: $APP_PORT"
echo ""

# Check cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "⚠️  cloudflared belum terinstal."
    echo "   Install dengan: sudo ./setup-cloudflare.sh"
    echo ""
    echo "   Atau install manual:"
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    echo "   curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb -o /tmp/cf.deb && sudo dpkg -i /tmp/cf.deb"
    exit 1
fi

echo "🌐 Memulai tunnel ke http://localhost:$APP_PORT ..."
echo "   URL akan muncul di bawah. Tekan Ctrl+C untuk menghentikan."
echo ""

cloudflared tunnel --url "http://localhost:$APP_PORT" --no-autoupdate 2>&1 | while IFS= read -r line; do
    echo "$line"
    if echo "$line" | grep -q "trycloudflare.com"; then
        URL=$(echo "$line" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com')
        if [ -n "$URL" ]; then
            echo ""
            echo "============================================"
            echo "  ✅ Tunnel aktif!"
            echo "  🌐 URL: $URL"
            echo "============================================"
            echo ""
        fi
    fi
done
