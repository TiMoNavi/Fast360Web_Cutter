# WireGuard 公网穿透方案

这个目录就是本项目的 WireGuard 网络工作区；所有公网穿透、端口映射、服务器反代、开关脚本和运行文档都集中在这里。它把本机开发服务稳定暴露到 `TenCent` 公网服务器：

- WireGuard 把当前 Windows 开发机固定成隧道地址 `10.77.0.2`，局域网 IP 变化、换 Wi-Fi、重启后都不影响服务器访问。
- 服务器用 Caddy 终止公网 HTTPS，再反代到 `10.77.0.2:39080`。
- Windows 端用 `netsh portproxy` 把 `10.77.0.2:39080` 动态转到当前项目端口，例如 `3000` 或 `3080`。换项目端口只需要重新跑本机启动脚本，不需要改服务器。
- 如果需要暴露新增的非 HTTPS 端口，服务器 nftables 可以把公网高位 TCP 端口直接 DNAT 到本机 WireGuard 地址。

日常开关和自动发现前后端，请优先看：

- [WIREGUARD-WEB-STACK.md](WIREGUARD-WEB-STACK.md)
- `client\WireGuard-WebStack.ps1`

## 需要先准备

1. `TenCent` SSH 可用，当前 `.ssh/config` 已有：

   ```sshconfig
   Host TenCent
       HostName 81.70.52.75
       User root
       Port 22
       IdentityFile D:/AI/Pivot_backend_build_team/navi.pem
   ```

2. Windows 安装 WireGuard，并确保能找到 `wireguard.exe` 和 `wg.exe`。

3. HTTPS 推荐准备一个域名，例如 `xr.example.com`，DNS A 记录指向 `81.70.52.75`。

   只用公网 IP 做 HTTPS 证书也可以做，但更麻烦。Let’s Encrypt 从 2026-01-15 起已正式提供 IP 地址证书，不过是 6 天短证书；Certbot 5.4+ 已支持申请，但还需要你手动把证书接进 Web 服务器。最省心的路径仍然是域名 + Caddy 自动签发和续期。

## 一次性部署流程

### 1. 复制配置

```powershell
Copy-Item public-tunnel\tunnel.env.example public-tunnel\tunnel.env
```

编辑 `public-tunnel\tunnel.env`：

- `PUBLIC_HOST` 改成你的域名，先没有域名可以留空，服务器会只配置 WireGuard 和端口转发。
- `CLIENT_PUBLIC_KEY` 先留空，下一步生成。

### 2. 生成 Windows 客户端密钥

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\New-WireGuardKeys.ps1
```

把输出的 `CLIENT_PUBLIC_KEY` 填进 `public-tunnel\tunnel.env`。`CLIENT_PRIVATE_KEY` 不要提交进 Git，可以后面直接传给客户端安装脚本。

### 3. 初始化服务器

在 PowerShell 里读取 env 后，通过 SSH 执行服务器脚本：

```powershell
$envFile = "public-tunnel\tunnel.env"
Get-Content $envFile | Where-Object { $_ -match "^[A-Z0-9_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  Set-Item "env:$name" $value
}

Get-Content public-tunnel\server\bootstrap-server.sh |
  ssh $env:SSH_HOST `
    "CLIENT_PUBLIC_KEY='$env:CLIENT_PUBLIC_KEY' PUBLIC_HOST='$env:PUBLIC_HOST' EXPOSE_TCP='$env:EXPOSE_TCP' bash -s"
```

脚本最后会打印 `SERVER_PUBLIC_KEY=...`，下一步要用。

### 4. 安装 Windows WireGuard 隧道

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\Install-WireGuardTunnel.ps1 `
  -ClientPrivateKey "<第 2 步生成的 CLIENT_PRIVATE_KEY>" `
  -ServerPublicKey "<第 3 步输出的 SERVER_PUBLIC_KEY>"
```

这个脚本会生成 `public-tunnel\generated\pc-to-tencent.conf`，并尝试注册 WireGuard Windows 隧道服务。

### 5. 启动本机穿透

如果项目跑在 `3000`：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\Start-ProjectPublicTunnel.ps1 -LocalWebPort 3000
```

如果你想让脚本同时启动 Next dev：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\Start-ProjectPublicTunnel.ps1 -LocalWebPort 3000 -StartWeb
```

项目改到 `3080` 时：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\Start-ProjectPublicTunnel.ps1 -LocalWebPort 3080
```

如果 Windows 报 `listen EACCES`，先看端口是否被系统保留：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

这台开发机当前 `3000-3001` 所在区间被保留，所以实际部署使用了 `3081`：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\Activate-ProjectTunnel.ps1 -LocalWebPort 3081
```

公网访问：

- `https://你的域名/` -> `TenCent:443` -> Caddy -> WireGuard -> 本机当前项目端口
- `http://81.70.52.75:3000/` -> nftables DNAT -> `10.77.0.2:3000`，前提是 `EXPOSE_TCP=all` 或包含 `3000`

## 本项目建议启动方式

公网 HTTPS 由服务器处理，所以本机不需要继续用自签名 HTTPS。推荐本机用 HTTP 监听：

```powershell
npm --workspace apps/web run dev:host -- --port 3000
```

如果继续使用本机 `npm run dev:web:https` 的 `3080` 也可以，但服务器反代到本机时不会信任自签名证书；这种情况下更建议让服务器反代到 HTTP 端口。

## 常见问题

### “动态”到底动态在哪里？

- 局域网地址变化：WireGuard 客户端主动连服务器，服务器只认客户端公钥和隧道 IP。
- 本机重启：WireGuard 隧道服务 + `Start-ProjectPublicTunnel.ps1` 恢复端口代理即可。
- 项目端口变化：重新跑 `Start-ProjectPublicTunnel.ps1 -LocalWebPort <新端口>`，公网 HTTPS 地址不变。
- 新开公网高位 TCP 端口：`EXPOSE_TCP=all` 时服务器会把 `1024-65535` TCP 端口转给本机。注意 Windows 防火墙和本机服务监听地址仍然要允许访问。

### 服务器证书能不能解决本机自签名问题？

可以。做法是公网浏览器访问 `https://PUBLIC_HOST`，证书在服务器 Caddy 上签发和续期，服务器再用 WireGuard 把请求转给本机 HTTP 服务。这样 Quest/Chrome 看到的是服务器的可信 HTTPS，不会碰到本机自签名证书。

### 没有域名怎么办？

可以先用 WireGuard + 高位端口转发验证链路。公网 IP 也能申请可信证书，但目前更适合进阶部署：Let’s Encrypt 的 IP 证书是 6 天短证书，Certbot 5.4+ 可以申请，但不会自动替你安装到 Caddy/Nginx。这个目录默认走域名证书的稳定路径。

参考：

- Let’s Encrypt: <https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability.html>
- Certbot: <https://letsencrypt.org/2026/03/11/shorter-certs-certbot>
