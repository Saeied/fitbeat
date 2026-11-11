#!/usr/bin/env bash
# One-time setup on Ubuntu server (run as root).
#   scp deploy/apache-dc.conf root@85.198.11.216:/tmp/
#   scp deploy/setup-server.sh root@85.198.11.216:/tmp/
#   ssh root@85.198.11.216 "bash /tmp/setup-server.sh"

set -euo pipefail

CONF_NAME="dc-dance"
CONF_DST="/etc/apache2/conf-available/${CONF_NAME}.conf"

echo "==> Directories..."
mkdir -p /var/www/html/dc
mkdir -p /var/www/html/deploy-tv/releases
mkdir -p /var/www/html/dance_Content
chown -R www-data:www-data /var/www/html/dc /var/www/html/deploy-tv /var/www/html/dance_Content

echo "==> Apache modules..."
a2enmod headers 2>/dev/null || true
a2enmod alias 2>/dev/null || true

if [[ -f /tmp/apache-dc.conf ]]; then
  cp /tmp/apache-dc.conf "${CONF_DST}"
else
  cat > "${CONF_DST}" << 'EOF'
<Directory /var/www/html/dc>
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
    DirectoryIndex index.html
    FallbackResource /index.html
</Directory>

Alias /dance_Content /var/www/html/dance_Content

<Directory /var/www/html/dance_Content>
    Options -Indexes +FollowSymLinks
    Require all granted
    Header always set Access-Control-Allow-Origin "*"
    Header always set Accept-Ranges "bytes"

    <FilesMatch "\.(mp4|m4v|webm)$">
        Header always set Content-Type "video/mp4"
        Header always set Accept-Ranges "bytes"
        Header always unset Content-Encoding
        Header always set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>
</Directory>
EOF
fi

a2enconf "${CONF_NAME}" 2>/dev/null || echo "Include conf-available/${CONF_NAME}.conf" > "/etc/apache2/conf-enabled/${CONF_NAME}.conf"

apache2ctl configtest
systemctl reload apache2

echo ""
echo "OK. Deploy app to /var/www/html/dc/ and videos to /var/www/html/dance_Content/"
echo "Open: http://$(hostname -I | awk '{print $1}')/dc/"
echo "Verify range: node scripts/verify-video-range.mjs http://$(hostname -I | awk '{print $1}')/dance_Content/video_001/video_001.mp4"
