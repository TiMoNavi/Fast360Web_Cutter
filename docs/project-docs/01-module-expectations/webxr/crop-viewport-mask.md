# 挖孔裁剪视窗遮罩

## 目标

裁剪预览层在 360 视频中显示一个 16:9 输出窗口。窗口内是最终视频要保留的区域，窗口外覆盖灰白色半透明毛玻璃质感遮罩。

这个遮罩只服务于用户预览，不参与后端正式裁剪计算。

## 视觉语义

第一版目标：

```text
取景窗口：16:9。
窗口中心：对应 ViewPathPoint.center.yaw / center.pitch。
窗口大小：对应 ViewPathPoint.fov.h / fov.v。
窗口外区域：灰白半透明遮罩。
质感：近似毛玻璃，轻雾化、低饱和、不过度遮挡视频内容。
中心 reticle：提示当前瞄准点。
边界线：清楚表达输出区域，但不抢占中心观看。
```

WebGL 中不要求真正实现 visionOS 级背景模糊。第一版可以用半透明材质、噪声纹理或浅色雾化效果近似。

## FOV 调整

FOV 表达“推近 / 拉远”：

```text
FOV 变小：
输出窗口看起来更窄，最终视频更接近放大。

FOV 变大：
输出窗口看起来更宽，最终视频更接近拉远。
```

第一版输出比例固定为 16:9。FOV 调整不改变最终画幅比例。

## 遮罩状态

遮罩可有前端预览状态：

```text
maskOpacity
maskStyle
showSafeFrame
showReticle
showViewportBorder
```

这些状态默认不进入后端正式裁剪协议。后端只依赖 `ViewPathPoint.center`、`ViewPathPoint.fov`、`enabled`、`cut`、`locked` 等稳定字段。

## 交互语义

第一版裁剪交互：

```text
head-gaze:
取景窗口默认跟随头显朝向。

controller ray:
按住 trigger 时，取景中心跟随射线目标。

release trigger:
锁定当前 yaw / pitch / FOV。

thumbstick up/down:
调整 FOV。

grip drag:
快速移动取景窗口或遮罩整体。
```

具体按钮映射由 `input-and-sampling.md` 统一定义，遮罩模块只消费目标取景状态。

## 与协议的映射

```text
center yaw/pitch -> ViewPathPoint.center
FOV h/v -> ViewPathPoint.fov
锁定状态 -> ViewPathPoint.locked
放弃 / 恢复 -> ViewPathPoint.enabled
Cut -> ViewPathPoint.cut
```

遮罩透明度、材质、边框颜色和玻璃质感不写入 `ViewPathPoint`。
