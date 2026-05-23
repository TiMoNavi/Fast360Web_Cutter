import { MobileShell } from "@/components/mobile/MobileShell";

type EmptyMobilePageProps = {
  email: string | null;
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{
    title: string;
    description: string;
  }>;
};

export function EmptyMobilePage({
  email,
  eyebrow,
  title,
  description,
  items
}: EmptyMobilePageProps) {
  return (
    <MobileShell email={email} eyebrow={eyebrow} title={title}>
      <section className="mobile-empty-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </section>

      <section className="mobile-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Coming soon</p>
            <h2>暂未接入后端</h2>
          </div>
        </div>
        <div className="empty-feature-list">
          {items.map((item) => (
            <article key={item.title}>
              <span />
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}
