"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";

type MobileShellProps = {
  children: ReactNode;
  contentClassName?: string;
  email?: string | null;
  eyebrow?: string;
  title: string;
  variant?: "default" | "vapor";
};

const navItems = [
  { href: "/mobile/videos", label: "我的视频", meta: "上传、源视频、详情" },
  { href: "/mobile/account/exports", label: "导出结果", meta: "裁剪 MP4 下载" },
  { href: "/xr/player", label: "WebXR 入口", meta: "进入取景空间" },
  { href: "/mobile/favorites", label: "我的收藏", meta: "常用素材与导出" }
];

export function MobileShell({
  children,
  contentClassName,
  email,
  title,
  eyebrow = "Mobile / Desktop",
  variant = "default"
}: MobileShellProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);
  const userInitial = email?.trim().slice(0, 1).toUpperCase() || "ID";
  const shellClassName = variant === "vapor" ? "mobile-app mobile-app-vapor" : "mobile-app";
  const contentClasses = ["mobile-content", contentClassName].filter(Boolean).join(" ");

  return (
    <main className={shellClassName}>
      <aside className={`mobile-sidebar ${isOpen ? "open" : ""}`} aria-label="主导航">
        <div className="mobile-sidebar-glow" aria-hidden="true" />
        <div className="mobile-brand">
          <span className="mobile-brand-mark">ID</span>
          <div>
            <strong>Invisible Director</strong>
            <span>看一遍，就剪完</span>
          </div>
        </div>

        <nav className="mobile-nav">
          {navItems.map((item) => {
            const active =
              item.href === "/mobile/videos"
                ? pathname.startsWith("/mobile/videos")
                : item.href === "/mobile/account/exports"
                  ? pathname.startsWith("/mobile/account/exports") || pathname.startsWith("/mobile/exports")
                  : item.href === "/mobile/favorites"
                    ? pathname.startsWith("/mobile/favorites")
                    : pathname === item.href;
            return (
              <Link
                className={active ? "mobile-nav-link active" : "mobile-nav-link"}
                href={item.href}
                key={item.href}
                onClick={() => setIsOpen(false)}
              >
                <span>{item.label}</span>
                <small>{item.meta}</small>
              </Link>
            );
          })}
        </nav>

        <div className="mobile-sidebar-footer">
          {email ? (
            <div className={`mobile-user-card ${isUserOpen ? "open" : ""}`}>
              <button
                aria-expanded={isUserOpen}
                className="mobile-user-toggle"
                onClick={() => setIsUserOpen((current) => !current)}
                type="button"
              >
                <span className="mobile-user-avatar">{userInitial}</span>
                <span className="mobile-user-text">
                  <strong>当前账号</strong>
                  <small>{email}</small>
                </span>
                <span className="mobile-user-chevron" aria-hidden="true" />
              </button>

              <div className="mobile-user-menu">
                <Link href="/mobile/account/settings" onClick={() => setIsOpen(false)}>
                  账号设置
                </Link>
                <Link href="/mobile/account/exports" onClick={() => setIsOpen(false)}>
                  导出记录
                </Link>
                <Link href="/mobile/favorites" onClick={() => setIsOpen(false)}>
                  我的收藏
                </Link>
                <LogoutButton />
              </div>
            </div>
          ) : (
            <Link className="button primary" href="/mobile/login">
              登录/注册
            </Link>
          )}
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
        <div className={contentClasses}>{children}</div>
      </div>
    </main>
  );
}
