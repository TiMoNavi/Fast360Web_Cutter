import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function MobileLoginPage() {
  return (
    <main>
      <div className="shell stack">
        <section className="panel stack">
          <p className="muted">Mobile Web</p>
          <h1>登录</h1>
          <p className="muted">注册或登录后上传 360 视频，并从安卓网页下载测试导出结果。</p>
          <div className="button-row">
            <Link className="button" href="/">
              返回首页
            </Link>
          </div>
        </section>

        <section className="panel stack">
          <AuthForm />
        </section>
      </div>
    </main>
  );
}
