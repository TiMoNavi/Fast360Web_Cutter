# 当前端到端闭环

## 闭环目的

当前闭环用于验证三端之间的核心合同：

```text
同一个用户。
同一个 videos 表。
同一个 cut_sessions 表。
同一个 ViewPathPatch 协议。
同一个 exports 下载结果。
```

它不是最终产品体验，也不是生产级长视频导出。

## 当前流程

```text
1. 用户访问 /mobile/login。
2. 用户注册或登录。
3. 用户访问 /mobile/videos。
4. 用户上传 360 MP4。
5. 后端保存视频到 storage/videos，并写入 videos。
6. 用户进入 /mobile/videos/:videoId。
7. 页面创建 cut session，保存默认 ClipEditConfig。
8. 用户进入 /xr/videos/:videoId/session/:sessionId。
9. 当前页面通过 FixedOrbitRenderButton 生成测试 ViewPathPatch。
10. 后端保存 patch，并按 replaceRange 写入 view_path_points。
11. 页面调用 render-test。
12. 后端读取源视频和路径点，逐帧 remap，生成 export MP4。
13. 用户回到移动端详情页或 export 页下载结果。
```

## 这个闭环验证了什么

已验证：

```text
认证 cookie 可以保护资源。
上传视频可以进入同一视频库。
session 能绑定 videoId 和 userId。
ClipEditConfig 能保存。
ViewPathPatch 能持久化。
replaceRange 能覆盖旧路径范围。
enabled=false 能影响导出片段。
cut=true 能作为分段边界。
yaw / pitch / FOV 能驱动后端投影。
export 能被下载。
```

## 这个闭环没有验证什么

未验证：

```text
真实 Quest 取景体验。
真实头显姿态采样。
controller 快捷操作。
取景框和遮罩。
5Hz sampler 的真实运行。
真实业务 session 页播放上传视频。
长视频 60 秒分片。
队列和 worker。
dirty 重渲染。
生产级性能。
```

## 当前测试路径

当前 WebXR 业务页使用测试按钮生成路径：

```text
固定环绕测试：
按约 1 度/秒生成平滑 yaw sweep。

复杂路径测试：
生成低频 yaw / pitch / FOV 变化，包含 enabled=false 和 cut=true。
```

这个设计是为了验证协议和投影，不是为了模拟完整用户交互。

## 当前输出限制

`render-test` 当前限制：

```text
同步 HTTP 请求。
最多约 60 秒。
输出 1280x720。
30fps。
CPU remap。
长视频会阻塞请求。
```

正式输出目标仍是：

```text
16:9
1920x1080
30fps
```

## 判断标准

如果当前闭环失败，应优先判断是哪一层问题：

```text
登录失败：
看 auth 和 cookie。

上传失败：
看文件类型、大小、storage/videos 和 videos 表。

session 创建失败：
看 videoId 是否属于当前用户。

patch 上传失败：
看 sessionId 是否一致、协议字段是否匹配。

render-test 失败：
看路径点数量、源视频路径、FFmpeg、OpenCV、effect events。

下载失败：
看 export.status、file_path 和 storage/exports。
```
