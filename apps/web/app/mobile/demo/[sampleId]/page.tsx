import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { DemoStartButton } from "@/components/mobile/DemoStartButton";
import { MobileShell } from "@/components/mobile/MobileShell";
import { QuestQrCode } from "@/components/mobile/QuestQrCode";
import { Video360Preview } from "@/components/mobile/Video360Preview";
import { formatDuration } from "@/components/mobile/format";
import { apiUrl, getMe, listDemoVideos } from "@/lib/api";
import type { DemoVideoSummary } from "@/lib/api";

type PageProps = {
  params: Promise<{
    sampleId: string;
  }>;
};

function loginHref(sampleId: string) {
  return `/mobile/login?next=${encodeURIComponent(`/mobile/demo/${sampleId}`)}`;
}

function demoCoverUrl(demo: DemoVideoSummary) {
  return demo.thumbnailUrl ? apiUrl(demo.thumbnailUrl) : null;
}

function getPublicOrigin(requestHeaders: Headers) {
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export default async function DemoVideoPage({ params }: PageProps) {
  const { sampleId } = await params;
  const cookieHeader = (await cookies()).toString();
  const requestHeaders = await headers();
  const demos = await listDemoVideos();
  const demo = demos.find((item) => item.id === sampleId);

  if (!demo) {
    notFound();
  }

  let email: string | null = null;
  try {
    const user = await getMe({ cookie: cookieHeader });
    email = user.email;
  } catch {
    email = null;
  }
  const demoUrl = `${getPublicOrigin(requestHeaders)}/mobile/demo/${encodeURIComponent(demo.id)}`;

  return (
    <MobileShell
      contentClassName="mobile-content-vapor-wide"
      email={email}
      eyebrow="Public Demo"
      title={demo.title}
      variant="vapor"
    >
      <div className="vapor-library-page vapor-demo-page">
        <section className="vapor-detail-hero">
          <div className="vapor-window-titlebar">
            <div className="vapor-window-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>&gt; DEMO_360_ONBOARDING</p>
          </div>
          <div className="vapor-detail-player-grid">
            <Video360Preview
              posterUrl={demoCoverUrl(demo)}
              sourceUrl={apiUrl(demo.sourceUrl)}
              title={demo.title}
            />
            <aside className="vapor-detail-summary">
              <p className="vapor-command">&gt; public sample</p>
              <h2>{demo.title}</h2>
              <p>{demo.description}</p>
              <dl className="vapor-detail-metrics">
                <div>
                  <dt>时长</dt>
                  <dd>{formatDuration(demo.durationHintMs)}</dd>
                </div>
                <div>
                  <dt>规格</dt>
                  <dd>{demo.resolutionLabel}</dd>
                </div>
                <div>
                  <dt>布局</dt>
                  <dd>{demo.layout}</dd>
                </div>
                <div>
                  <dt>难度</dt>
                  <dd>{demo.difficulty}</dd>
                </div>
              </dl>
              <div className="vapor-demo-tags">
                {demo.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="vapor-card-actions">
                {email ? (
                  <>
                    <DemoStartButton label="开始 WebXR" sampleId={demo.id} />
                    <DemoStartButton
                      className="vapor-button vapor-button-ghost"
                      destination="detail"
                      label="加入我的视频"
                      sampleId={demo.id}
                    />
                  </>
                ) : (
                  <Link className="vapor-button vapor-button-primary" href={loginHref(demo.id)}>
                    <span>登录后开始</span>
                  </Link>
                )}
                <Link className="vapor-button vapor-button-ghost" href="/mobile/videos">
                  <span>返回视频库</span>
                </Link>
              </div>
              <div className="vapor-demo-qr vapor-demo-qr-detail" aria-label="扫码访问当前示例教程">
                <QuestQrCode value={demoUrl} />
                <span>扫码打开此教程</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="vapor-library-section">
          <div className="vapor-section-heading">
            <div>
              <p className="vapor-command">&gt; three step runbook</p>
              <h2>上手教程</h2>
            </div>
          </div>
          <div className="vapor-tutorial-grid">
            {demo.tutorialSteps.map((step, index) => (
              <article className="vapor-tutorial-step" key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vapor-library-section">
          <div className="vapor-section-heading">
            <div>
              <p className="vapor-command">&gt; source credit</p>
              <h2>素材来源</h2>
            </div>
          </div>
          <p className="muted">{demo.attribution}</p>
        </section>
      </div>
    </MobileShell>
  );
}
