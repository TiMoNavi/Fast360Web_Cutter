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
```

这些错误通常不是页面代码本身的问题，而是多个 Next 进程同时读写 `.next`。

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

本问题的根因是构建缓存目录被多个进程争用。修复代码前，先消除环境噪音；否则容易把 `.next` 损坏误判成 A-Frame、WebXR 或具体页面组件的问题。
