import { EmptyMobilePage } from "@/components/mobile/EmptyMobilePage";
import { getMobileUserEmail } from "../../_private";

export default async function MobileAccountSettingsPage() {
  const email = await getMobileUserEmail();

  return (
    <EmptyMobilePage
      description="这里会集中管理账号、安全、默认导出参数和 WebXR 入口偏好。"
      email={email}
      eyebrow="Account"
      items={[
        {
          title: "账号资料",
          description: "邮箱、显示名称和演示用身份标签。"
        },
        {
          title: "默认导出设置",
          description: "16:9、1080p、30fps 等导出预设会放在这里。"
        },
        {
          title: "WebXR 偏好",
          description: "Quest 打开方式、二维码入口和 session 默认策略。"
        }
      ]}
      title="账户设置"
    />
  );
}
