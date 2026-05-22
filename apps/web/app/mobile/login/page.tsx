import { cookies } from "next/headers";
import { AuthForm } from "@/components/AuthForm";
import { MobileShell } from "@/components/mobile/MobileShell";
import { getMe } from "@/lib/api";

export default async function MobileLoginPage() {
  let email: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    const user = await getMe({ cookie: cookieHeader });
    email = user.email;
  } catch {
    email = null;
  }

  return (
    <MobileShell email={email} title="登录与注册">
      <section className="mobile-hero">
        <p className="eyebrow">素材入口</p>
        <h2>登录后上传 360 视频，并在这里追踪裁剪结果。</h2>
        <p>手机端只负责素材、状态和下载；取景与路径采样交给 Quest / WebXR。</p>
      </section>

      <section className="mobile-card narrow">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Account</p>
            <h2>进入工作区</h2>
          </div>
        </div>
        <AuthForm />
      </section>
    </MobileShell>
  );
}
