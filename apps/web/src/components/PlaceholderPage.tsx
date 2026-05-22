import Link from "next/link";

type Action = {
  href: string;
  label: string;
  primary?: boolean;
};

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  sections?: Array<{
    title: string;
    items: string[];
  }>;
  actions?: Action[];
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  sections = [],
  actions = []
}: PlaceholderPageProps) {
  return (
    <main>
      <div className="shell stack">
        <section className="panel stack">
          <p className="muted">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
          {actions.length > 0 ? (
            <div className="button-row">
              {actions.map((action) => (
                <Link
                  className={action.primary ? "button primary" : "button"}
                  href={action.href}
                  key={action.href}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        {sections.length > 0 ? (
          <section className="grid">
            {sections.map((section) => (
              <div className="panel stack" key={section.title}>
                <h2>{section.title}</h2>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
