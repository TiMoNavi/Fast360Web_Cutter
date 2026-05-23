import Link from "next/link";
import { cookies } from "next/headers";
import { AuthForm } from "@/components/AuthForm";
import { MobileLoginAutoScroll } from "@/components/mobile/MobileLoginAutoScroll";
import { getMe } from "@/lib/api";

type PageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

function safeNextPath(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return "/mobile/videos";
  }
  return next;
}

export default async function MobileLoginPage({ searchParams }: PageProps) {
  let email: string | null = null;
  const cookieHeader = (await cookies()).toString();
  const nextPath = safeNextPath((await searchParams)?.next);

  try {
    const user = await getMe({ cookie: cookieHeader });
    email = user.email;
  } catch {
    email = null;
  }

  return (
    <main className="mobile-auth-page">
      <MobileLoginAutoScroll />
      <div className="auth-ambient" aria-hidden="true">
        <span className="auth-blob auth-blob-primary" />
        <span className="auth-blob auth-blob-secondary" />
        <span className="auth-blob auth-blob-tertiary" />
        <span className="auth-grid" />
      </div>

      <section className="mobile-auth-layout">
        <div className="mobile-auth-story" id="mobile-auth-story">
          <div className="mobile-auth-brand">
            <span>ID</span>
            <div>
              <strong>Invisible Director</strong>
              <p>Mobile capture handoff</p>
            </div>
          </div>

          <div className="mobile-auth-copy">
            <p className="auth-kicker">VR native 360 editing</p>
            <h1>
              看一遍，
              <span>就剪完。</span>
            </h1>
            <p>
              登录后示例视频会加入你的素材库；手机端负责上传和下载，WebXR 负责进入 360 空间完成取景。
            </p>
          </div>

          <div className="auth-story-points" aria-label="产品叙事">
            <div>
              <span>01</span>
              <strong>普通 Web 是入口</strong>
              <p>上传素材，或选择公共示例快速开始。</p>
            </div>
            <div>
              <span>02</span>
              <strong>VR 里完成取景</strong>
              <p>站进 360 球幕，边看边决定最终画面。</p>
            </div>
            <div>
              <span>03</span>
              <strong>不是录屏，是路径</strong>
              <p>系统记录可回放的剪辑意图，再生成普通 MP4。</p>
            </div>
          </div>
        </div>

        <div className="mobile-auth-form-column" id="mobile-auth-form">
          <div className="mobile-auth-form-card">
            <div className="auth-card-header">
              <div>
                <p>Secure access</p>
                <h2>登录或注册</h2>
              </div>
              <span>Quest Ready</span>
            </div>
            <AuthForm nextPath={nextPath} />
            {email ? (
              <Link className="button mobile-auth-secondary" href={nextPath}>
                已登录为 {email}，继续
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
