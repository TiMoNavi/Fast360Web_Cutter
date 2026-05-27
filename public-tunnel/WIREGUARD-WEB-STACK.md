# WireGuard Web Stack 开关

本文件只管网络穿透运行态：WireGuard、Windows portproxy、防火墙、前端/后端本地服务发现，以及公网 HTTPS 反代。

当前公网链路：

```text
https://pivotcompute.store
  -> TenCent Nginx :443
  -> WireGuard wgpc 10.77.0.1
  -> Windows WireGuard 10.77.0.2 over HTTPS
  -> portproxy 10.77.0.2:39080
  -> 当前本机 HTTPS 前端端口
  -> Next rewrites /api, /media, /thumbnails 到本机 FastAPI
```

## 快速命令

查看当前发现到的前后端、WireGuard 服务和 portproxy：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\WireGuard-WebStack.ps1 -Action status
```

自动发现当前前端/后端并接到公网：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\WireGuard-WebStack.ps1 -Action on
```

指定端口接入公网：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\WireGuard-WebStack.ps1 -Action on -FrontendPort 3081 -BackendPort 8000
```

关闭公网入口，不杀本地前后端：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\WireGuard-WebStack.ps1 -Action off
```

关闭公网入口，并停止由脚本启动的本地前后端：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\WireGuard-WebStack.ps1 -Action off -StopLocalServices
```

## 自动发现规则

前端候选端口来自 `public-tunnel\tunnel.env`：

```text
LOCAL_WEB_PORT_CANDIDATES=3081,3000,3080
```

脚本会探测 `http://127.0.0.1:<port>/` 和 `https://127.0.0.1:<port>/`，识别 Next.js、本项目标题或正常页面响应。

后端候选端口：

```text
LOCAL_API_PORT_CANDIDATES=8000,8010,5000,5001
```

脚本会探测 `/health`、`/openapi.json`、`/docs`，识别 FastAPI 或正常 API 响应。

## 自动启动

`-Action on` 默认会在缺少服务时启动：

- 后端：`python -m uvicorn app.main:app --reload --app-dir apps/api --host 127.0.0.1 --port <BackendPort>`
- 前端：`npx next dev --hostname 127.0.0.1 --port <FrontendPort>`

前端启动时会注入：

```text
API_BASE_URL=http://127.0.0.1:<BackendPort>
NEXT_PUBLIC_API_BASE_URL=
NEXT_DIST_DIR=.next-public-tunnel
```

`API_BASE_URL` 只给 Next 服务端 rewrite 使用；浏览器端保持同源 `/api`，
避免公网页面把请求发到访问者自己的 `127.0.0.1`。
`NEXT_DIST_DIR` 隔离公网 dev server 的编译缓存，避免和其它本地 Next dev
端口同时写同一个 `.next` 目录。

如果只想接入已经运行的服务，不自动启动：

```powershell
powershell -ExecutionPolicy Bypass -File public-tunnel\client\WireGuard-WebStack.ps1 -Action on -NoStart
```

## Windows 管理员权限

以下动作需要管理员权限：

- 安装/启动 WireGuard tunnel service
- 修改 `netsh interface portproxy`
- 新增/删除 Windows 防火墙规则
- 关闭 WireGuard 服务

脚本会自动弹 UAC。管理员窗口打开后会继续执行原动作。

## 当前服务器配置

服务器：`TenCent` / `81.70.52.75`

域名：`pivotcompute.store`

WireGuard：

```text
interface: wgpc
server: 10.77.0.1/24
client: 10.77.0.2/32
udp: 51820
```

Nginx 已备份原配置，并把 `pivotcompute.store` 反代到本机 HTTPS upstream：

```text
https://10.77.0.2:39080
```

本机通过 portproxy 把它接到当前前端端口。

当前本机固定要求：

```text
https://127.0.0.1:3080/xr/player-v2
```

本机证书是本地自签证书，SAN 包含 `localhost`、`127.0.0.1`、`::1`。公网证书仍然只在服务器 Nginx 上使用。

## 为什么不用全端口 DNAT

服务器已有多个公网监听端口，例如数据库、宝塔面板、现有 API 等。把 `1024-65535` 全量 DNAT 到本机，会直接影响这些服务。

当前自动化采取更稳的方式：

- WebXR/网页入口统一走 `https://pivotcompute.store`
- 新前端端口由本机脚本动态接到固定 WireGuard gateway port `39080`
- 后端由前端 Next rewrites 走本机 `API_BASE_URL`

如果以后确实要把某些额外公网端口也转进本机，优先加白名单端口，而不是开启 `EXPOSE_TCP=all`。
