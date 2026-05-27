#!/usr/bin/env bash
set -euo pipefail

CLIENT_PUBLIC_KEY="${CLIENT_PUBLIC_KEY:-}"
PUBLIC_HOST="${PUBLIC_HOST:-pivotcompute.store}"
WG_IFACE="${WG_IFACE:-wgpc}"
WG_PORT="${WG_PORT:-51820}"
WG_SERVER_IP="${WG_SERVER_IP:-10.77.0.1}"
WG_CLIENT_IP="${WG_CLIENT_IP:-10.77.0.2}"
PUBLIC_WEB_GATEWAY_PORT="${PUBLIC_WEB_GATEWAY_PORT:-39080}"
UPSTREAM_SCHEME="${UPSTREAM_SCHEME:-https}"
EXPOSE_TCP="${EXPOSE_TCP:-}"
SSL_CERT="${SSL_CERT:-/root/pivot_domain_tls/pivotcompute.store.crt}"
SSL_KEY="${SSL_KEY:-/root/pivot_domain_tls/pivotcompute.store.key}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/pivot-registry.conf}"

if [[ -z "$CLIENT_PUBLIC_KEY" ]]; then
  echo "CLIENT_PUBLIC_KEY is required." >&2
  exit 1
fi

if [[ "$(id -u)" != "0" ]]; then
  echo "Run as root." >&2
  exit 1
fi

for package in wireguard-tools nftables firewalld; do
  rpm -q "$package" >/dev/null 2>&1 || dnf install -y "$package"
done

if ! rpm -q nginx >/dev/null 2>&1; then
  dnf install -y nginx
fi

install -d -m 700 /etc/wireguard
if [[ ! -f "/etc/wireguard/${WG_IFACE}_server_private.key" ]]; then
  wg genkey > "/etc/wireguard/${WG_IFACE}_server_private.key"
  chmod 600 "/etc/wireguard/${WG_IFACE}_server_private.key"
fi

SERVER_PRIVATE_KEY="$(cat "/etc/wireguard/${WG_IFACE}_server_private.key")"
SERVER_PUBLIC_KEY="$(printf '%s' "$SERVER_PRIVATE_KEY" | wg pubkey)"

cat > "/etc/wireguard/${WG_IFACE}.conf" <<EOF
[Interface]
Address = ${WG_SERVER_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVATE_KEY}
SaveConfig = false

[Peer]
PublicKey = ${CLIENT_PUBLIC_KEY}
AllowedIPs = ${WG_CLIENT_IP}/32
EOF

chmod 600 "/etc/wireguard/${WG_IFACE}.conf"

cat > /etc/sysctl.d/99-public-tunnel.conf <<EOF
net.ipv4.ip_forward=1
EOF
sysctl --system >/dev/null

systemctl enable --now "wg-quick@${WG_IFACE}"

systemctl enable --now firewalld
firewall-cmd --permanent --add-port="${WG_PORT}/udp" >/dev/null
firewall-cmd --permanent --add-service=http >/dev/null
firewall-cmd --permanent --add-service=https >/dev/null
firewall-cmd --reload >/dev/null

install -d -m 755 /etc/nftables.d /usr/local/sbin

cat > /etc/nftables.d/public-tunnel.nft <<EOF
table ip public_tunnel {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
EOF

if [[ -n "$EXPOSE_TCP" ]]; then
  if [[ "$EXPOSE_TCP" == "all" ]]; then
    echo "    tcp dport 1024-65535 dnat to ${WG_CLIENT_IP}" >> /etc/nftables.d/public-tunnel.nft
  else
    TCP_SET="$(printf '%s' "$EXPOSE_TCP" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | paste -sd, -)"
    echo "    tcp dport { ${TCP_SET} } dnat to ${WG_CLIENT_IP}" >> /etc/nftables.d/public-tunnel.nft
  fi
fi

cat >> /etc/nftables.d/public-tunnel.nft <<EOF
  }

  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    ip daddr ${WG_CLIENT_IP} masquerade
  }
}
EOF

cat > /usr/local/sbin/public-tunnel-load-nft.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
nft delete table ip public_tunnel 2>/dev/null || true
nft -f /etc/nftables.d/public-tunnel.nft
EOF
chmod 755 /usr/local/sbin/public-tunnel-load-nft.sh

cat > /etc/systemd/system/public-tunnel-nft.service <<EOF
[Unit]
Description=Public tunnel nftables NAT rules
After=network-online.target wg-quick@${WG_IFACE}.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/public-tunnel-load-nft.sh
ExecStop=/usr/sbin/nft delete table ip public_tunnel

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now public-tunnel-nft.service

if [[ -f "$NGINX_CONF" ]]; then
  cp -a "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d-%H%M%S)"
fi

cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${PUBLIC_HOST};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${PUBLIC_HOST};

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};

    client_max_body_size 2g;

    location / {
        proxy_pass ${UPSTREAM_SCHEME}://${WG_CLIENT_IP}:${PUBLIC_WEB_GATEWAY_PORT};
        proxy_ssl_server_name off;
        proxy_ssl_verify off;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_connect_timeout 60s;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /__server8000/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

nginx -t
systemctl reload nginx

echo "SERVER_PUBLIC_KEY=${SERVER_PUBLIC_KEY}"
echo "WG_IFACE=${WG_IFACE}"
echo "WG_SERVER_IP=${WG_SERVER_IP}"
echo "WG_CLIENT_IP=${WG_CLIENT_IP}"
echo "PUBLIC_URL=https://${PUBLIC_HOST}/"
