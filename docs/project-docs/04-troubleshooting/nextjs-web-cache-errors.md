# Next.js Web 缓存与多进程错误处理

## 问题表现

本项目的 `apps/web` 使用 Next.js。开发时如果同时运行多个 `next dev`、`next start`、`next build` 或 `typecheck`，它们会争用同一个目录：

```text
apps/web/.next
```

常见表现：

```text
页面第一次 200，刷新后变成 500。
新路由偶尔返回 404。
浏览器显示 Internal Server Error。
Next dev 日志里出现 .next manifest 或 page.js 丢失。
typecheck 报 .next/types/**/*.ts 文件不存在。
build 偶尔报某个 page.tsx 或 manifest 文件不存在。
```

本次 A-Frame 页面调试中见到的典型错误：

```text
ENOENT: no such file or directory, open 'apps/web/.next/server/app-paths-manifest.json'
ENOENT: no such file or directory, open 'apps/web/.next/routes-manifest.json'
ENOENT: no such file or directory, open 'apps/web/.next/server/app/xr/aframe-player/page.js'
Cannot find module './819.js'
Cannot find module 'apps/web/.next/server/middleware-manifest.json'
Cannot read properties of undefined (reading '/_app')
```

这些错误通常不是页面代码本身的问题，而是多个 Next 进程同时读写 `.next`。

## A-Frame 调试结论

本次最小 A-Frame 360 球面播放器验证结果：

```text
视频播放实现本身没有问题。
/api/sample-video 能正常返回 video/mp4。
A-Frame runtime 能正常加载。
a-scene / a-videosphere / canvas 能在 Playwright 中出现。
```

最终通过的验证：

```powershell
npm.cmd run typecheck:web
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
npm.cmd --workspace apps/web run smoke:webxr
```

结果：

```text
8 passed
```

### 不要直接 import A-Frame

在 Next.js App Router 中，不要在 React 组件里直接使用：

```ts
await import("aframe");
```

本项目曾因此在 dev server 中出现：

```text
Cannot find module './819.js'
Require stack:
apps/web/.next/server/webpack-runtime.js
apps/web/.next/server/app/xr/aframe-player/page.js
```

处理方式：

```text
把 A-Frame 当成浏览器端 runtime 脚本加载。
不要让 Next server bundle 分析和拆分 A-Frame 包。
```

当前实现使用：

```text
apps/web/app/api/vendor/aframe/route.ts
apps/web/src/components/aframe/AFrameVideoSpherePlayer.tsx
```

`/api/vendor/aframe` 从本地 `node_modules/aframe/dist/aframe-master.min.js` 提供脚本，组件在浏览器端插入 `<script>` 后再渲染 `a-scene`。

### 自动 dev server 会反复触发问题

本次调试中还发现有外部 PowerShell 自动启动：

```text
npx next dev --hostname 127.0.0.1 --port 3000
```

如果同时再手动启动：

```text
next dev --port 3004
```

两个进程会同时写 `apps/web/.next`，导致 3004 页面从 200 变成 500，或者从 200 变成 404。

如果发现 3000 已经有自动 dev server，优先直接使用：

```text
http://127.0.0.1:3000
```

并把 Playwright 指向同一个服务：

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
```

## 快速恢复

先停止当前仓库里所有 Next / npm web 进程：

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match '360videocutter' -and
    $_.CommandLine -match 'next|npm|start-server'
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }
```

然后清理 Web 缓存：

```powershell
npm.cmd run clean:web
```

重新启动一个干净 dev server：

```powershell
npm.cmd --workspace apps/web run dev -- --port 3004 --hostname 127.0.0.1
```

如果已有自动启动的 `3000` dev server，并且确认只有它一个 Next 进程在写 `.next`，也可以直接使用：

```text
http://127.0.0.1:3000
```

检查页面：

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:3004/xr/aframe-player' -UseBasicParsing
```

如果返回 `200`，再打开浏览器访问：

```text
http://127.0.0.1:3004/xr/aframe-player
```

## 预防规则

同一时间只允许一个进程写 `apps/web/.next`。

不要并行运行：

```text
next dev
next build
next start
tsc --noEmit 且 .next/types 正在被重建
Playwright 测试指向旧 dev server
```

推荐顺序：

```powershell
npm.cmd run clean:web
npm.cmd run typecheck:web
npm.cmd run build:web
```

开发页面时：

```powershell
npm.cmd run clean:web
npm.cmd --workspace apps/web run dev -- --port 3004 --hostname 127.0.0.1
```

跑 smoke 时，确保 `PLAYWRIGHT_BASE_URL` 指向唯一正在运行的 dev server：

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3004'
npm.cmd --workspace apps/web run smoke:webxr
```

## 诊断命令

查看当前仓库相关 Next 进程：

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match '360videocutter' -and
    $_.CommandLine -match 'next'
  } |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine
```

查看某个端口是否被占用：

```powershell
Get-NetTCPConnection -LocalPort 3004 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess
```

同时检查 3000 和 3004：

```powershell
Get-NetTCPConnection -LocalPort 3000,3004 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess
```

如果页面在浏览器里 500，但首次请求或另一个端口曾经 200，优先怀疑 `.next` 被另一个进程重写。

## Meta / Immersive Web Emulator 测试注意

Meta 或 Immersive Web Emulator 浏览器扩展只影响浏览器端的 WebXR 能力，不应该影响 Next 的 `.next` manifest。

正确顺序：

```text
1. 先保证普通 Chrome / HTTP 请求能打开页面。
2. 再用 Playwright smoke 覆盖页面结构。
3. 最后再打开带 Meta / Immersive Web Emulator 的 Chrome 做 WebXR 能力验证。
```

如果扩展浏览器里出现 500，先用普通 `Invoke-WebRequest` 或普通 Chrome 验证同一个 URL。若普通请求也是 500，先按本文恢复 Next dev 环境。

## 记录结论

本问题的根因主要是构建缓存目录被多个进程争用。A-Frame 还额外要求避免被 Next server bundle 直接拆包。修复代码前，先消除环境噪音；否则容易把 `.next` 损坏误判成视频播放、WebXR 或具体页面组件的问题。
