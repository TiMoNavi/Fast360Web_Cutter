"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";

type MobileShellProps = {
  children: ReactNode;
  email?: string | null;
  title: string;
  eyebrow?: string;
};

const navItems = [
  { href: "/mobile/videos", label: "我的视频" },
  { href: "/mobile/login", label: "登录注册" },
  { href: "/xr/videos", label: "WebXR" }
];

export function MobileShell({ children, email, title, eyebrow = "Mobile Web" }: MobileShellProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <main className="mobile-app">
      <aside className={`mobile-sidebar ${isOpen ? "open" : ""}`} aria-label="移动端导航">
        <div className="mobile-brand">
          <span className="mobile-brand-mark">ID</span>
          <div>
            <strong>Invisible Director</strong>
            <span>{email ?? "未登录"}</span>
          </div>
        </div>

        <nav className="mobile-nav">
          {navItems.map((item) => {
            const active =
              item.href === "/mobile/videos"
                ? pathname.startsWith("/mobile/videos") || pathname.startsWith("/mobile/exports")
                : pathname === item.href;
            return (
              <Link
                className={active ? "mobile-nav-link active" : "mobile-nav-link"}
                href={item.href}
                key={item.href}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mobile-sidebar-footer">
          {email ? <LogoutButton /> : <Link className="button primary" href="/mobile/login">登录/注册</Link>}
        </div>
      </aside>

      {isOpen ? (
        <button
          aria-label="关闭导航"
          className="mobile-scrim"
          onClick={() => setIsOpen(false)}
          type="button"
        />
      ) : null}

      <div className="mobile-main">
        <header className="mobile-topbar">
          <button
            aria-expanded={isOpen}
            aria-label="打开导航"
            className="mobile-menu-button"
            onClick={() => setIsOpen(true)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
        </header>
        <div className="mobile-content">{children}</div>
      </div>
    </main>
  );
}
