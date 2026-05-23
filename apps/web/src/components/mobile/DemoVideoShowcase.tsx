import Link from "next/link";
import { DemoStartButton } from "@/components/mobile/DemoStartButton";
import { QuestQrCode } from "@/components/mobile/QuestQrCode";
import { formatDuration } from "@/components/mobile/format";
import { apiUrl } from "@/lib/api";
import type { DemoVideoSummary } from "@/lib/api";

type DemoVideoShowcaseProps = {
  demos: DemoVideoSummary[];
  isAuthenticated: boolean;
  publicEntryUrl?: string;
};

function coverUrl(demo: DemoVideoSummary) {
  return demo.thumbnailUrl ? apiUrl(demo.thumbnailUrl) : null;
}

function loginHref(sampleId: string) {
  return `/mobile/login?next=${encodeURIComponent(`/mobile/demo/${sampleId}`)}`;
}

export function DemoVideoShowcase({ demos, isAuthenticated, publicEntryUrl }: DemoVideoShowcaseProps) {
  if (demos.length === 0) {
    return null;
  }

  return (
    <section className="vapor-demo-showcase" data-testid="demo-video-showcase">
      <div className="vapor-window-titlebar">
        <div className="vapor-window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>&gt; PUBLIC_360_BOOT_SEQUENCE</p>
      </div>
      <div className="vapor-demo-body">
        <div className="vapor-section-heading">
          <div>
            <p className="vapor-command">&gt; try before upload</p>
            <h2>示例 360 视频</h2>
          </div>
          <div className="vapor-demo-entry">
            <p className="vapor-demo-intro">
              没有 360 素材也能先体验。选择一个低画质示例，系统会把它加入你的素材库，再进入 WebXR 取景。
            </p>
            {publicEntryUrl ? (
              <div className="vapor-demo-qr" aria-label="扫码访问公开示例入口">
                <QuestQrCode value={publicEntryUrl} />
                <span>扫码打开示例入口</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="vapor-demo-grid">
          {demos.map((demo) => {
            const imageUrl = coverUrl(demo);
            return (
              <article className="vapor-demo-card" key={demo.id} data-testid="demo-video-card">
                <Link className="vapor-demo-cover" href={`/mobile/demo/${encodeURIComponent(demo.id)}`}>
                  {imageUrl ? (
                    <img alt={`${demo.title} preview`} loading="lazy" src={imageUrl} />
                  ) : (
                    <div className="vapor-cover-placeholder" aria-hidden="true">
                      <span>360</span>
                    </div>
                  )}
                  <div className="vapor-cover-gradient" aria-hidden="true" />
                  <span className="vapor-duration">{formatDuration(demo.durationHintMs)}</span>
                </Link>
                <div className="vapor-demo-copy">
                  <div>
                    <p className="vapor-command">&gt; {demo.difficulty}</p>
                    <h3>{demo.title}</h3>
                    <p>{demo.subtitle}</p>
                  </div>
                  <div className="vapor-demo-tags" aria-label={`${demo.title} tags`}>
                    {demo.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="vapor-card-actions">
                    <Link className="vapor-button vapor-button-ghost" href={`/mobile/demo/${encodeURIComponent(demo.id)}`}>
                      <span>查看教程</span>
                    </Link>
                    {isAuthenticated ? (
                      <DemoStartButton label="开始上手" sampleId={demo.id} />
                    ) : (
                      <Link className="vapor-button vapor-button-primary" href={loginHref(demo.id)}>
                        <span>登录后开始</span>
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
