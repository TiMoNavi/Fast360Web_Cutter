#!/usr/bin/env bash
set -euo pipefail

CLIENT_PUBLIC_KEY="${CLIENT_PUBLIC_KEY:-}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
WG_PORT="${WG_PORT:-51820}"
WG_SERVER_IP="${WG_SERVER_IP:-10.77.0.1}"
WG_CLIENT_IP="${WG_CLIENT_IP:-10.77.0.2}"
PUBLIC_WEB_GATEWAY_PORT="${PUBLIC_WEB_GATEWAY_PORT:-39080}"
EXPOSE_TCP="${EXPOSE_TCP:-all}"

if [[ -z "$CLIENT_PUBLIC_KEY" ]]; then
  echo "CLIENT_PUBLIC_KEY is required." >&2
  exit 1
fi

if [[ "$(id -u)" != "0" ]]; then
  echo "Run as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y wireguard nftables curl ca-certificates

install -d -m 700 /etc/wireguard
if [[ ! -f /etc/wireguard/server_private.key ]]; then
  wg genkey > /etc/wireguard/server_private.key
  chmod 600 /etc/wireguard/server_private.key
fi

SERVER_PRIVATE_KEY="$(cat /etc/wireguard/server_private.key)"
SERVER_PUBLIC_KEY="$(printf '%s' "$SERVER_PRIVATE_KEY" | wg pubkey)"

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = ${WG_SERVER_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVATE_KEY}
SaveConfig = false

[Peer]
PublicKey = ${CLIENT_PUBLIC_KEY}
AllowedIPs = ${WG_CLIENT_IP}/32
EOF

chmod 600 /etc/wireguard/wg0.conf

cat > /etc/sysctl.d/99-public-tunnel.conf <<EOF
net.ipv4.ip_forward=1
EOF
sysctl --system >/dev/null

systemctl enable --now wg-quick@wg0

install -d -m 755 /etc/nftables.d /usr/local/sbin

if [[ "$EXPOSE_TCP" == "all" ]]; then
  TCP_RULE="tcp dport 1024-65535 dnat to ${WG_CLIENT_IP}"
elif [[ -n "$EXPOSE_TCP" ]]; then
  TCP_SET="$(printf '%s' "$EXPOSE_TCP" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | paste -sd, -)"
  TCP_RULE="tcp dport { ${TCP_SET} } dnat to ${WG_CLIENT_IP}"
else
  TCP_RULE=""
fi

cat > /etc/nftables.d/public-tunnel.nft <<EOF
table ip public_tunnel {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
EOF

if [[ -n "$TCP_RULE" ]]; then
  cat >> /etc/nftables.d/public-tunnel.nft <<EOF
    ${TCP_RULE}
EOF
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
After=network-online.target wg-quick@wg0.service
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

if [[ -n "$PUBLIC_HOST" ]]; then
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https gnupg
    curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
  fi

  cat > /etc/caddy/Caddyfile <<EOF
${PUBLIC_HOST} {
  encode zstd gzip
  reverse_proxy http://${WG_CLIENT_IP}:${PUBLIC_WEB_GATEWAY_PORT} {
    header_up Host {host}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
  }
}
EOF

  systemctl enable --now caddy
  systemctl reload caddy
fi

echo "SERVER_PUBLIC_KEY=${SERVER_PUBLIC_KEY}"
echo "WG_SERVER_IP=${WG_SERVER_IP}"
echo "WG_CLIENT_IP=${WG_CLIENT_IP}"
echo "PUBLIC_WEB_GATEWAY_PORT=${PUBLIC_WEB_GATEWAY_PORT}"
if [[ -n "$PUBLIC_HOST" ]]; then
  echo "PUBLIC_URL=https://${PUBLIC_HOST}/"
fi

