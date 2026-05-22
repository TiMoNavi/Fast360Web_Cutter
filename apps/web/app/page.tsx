import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function HomePage() {
  return (
    <PlaceholderPage
      eyebrow="The Invisible Director"
      title="WebXR 本地开发预览"
      description="这是最简 Web 界面，用来确认 Next.js 开发环境、路由和浏览器访问都能正常打开。"
      actions={[
        { href: "/mobile/login", label: "登录/注册", primary: true },
        { href: "/xr/hello", label: "运行第一个 WebXR" },
        { href: "/xr/dev-check", label: "打开 WebXR 检测" },
        { href: "/xr/videos", label: "打开 WebXR 路由" },
        { href: "/mobile/videos", label: "打开移动端路由" }
      ]}
      sections={[
        {
          title: "当前可验证",
          items: ["Next.js 页面渲染", "本地浏览器访问", "局域网 host 启动脚本", "TypeScript 与生产构建检查"]
        },
        {
          title: "下一步再接",
          items: ["Three.js 360 预览", "WebXR immersive-vr", "本地 360 视频加载", "Quest 浏览器手柄输入"]
        }
      ]}
    />
  );
}
