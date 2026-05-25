"use client";

import { useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";

type AuthFormProps = {
  nextPath?: string;
};

export function AuthForm({ nextPath = "/mobile/videos" }: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("登录或注册后进入你的视频库。");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fillTestAccount() {
    if (emailRef.current) emailRef.current.value = "demo@invisible.local";
    if (passwordRef.current) passwordRef.current.value = "password123";
    setMessage("测试账号已填充，点击登录按钮。");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    const password = String(new FormData(form).get("password") ?? "");

    setIsSubmitting(true);
    setMessage(mode === "login" ? "登录中..." : "注册中...");

    try {
      const user = mode === "login" ? await login(email, password) : await register(email, password);
      setMessage(`已进入：${user.email}`);
      router.replace(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "认证失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSpotlightMove(event: MouseEvent<HTMLFormElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  }

  return (
    <form className="auth-card linear-auth-card" onMouseMove={onSpotlightMove} onSubmit={onSubmit}>
      <div className="segmented-control">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
          type="button"
        >
          登录
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          onClick={() => setMode("register")}
          type="button"
        >
          注册
        </button>
      </div>
      <label className="field">
        <span>Email</span>
        <input ref={emailRef} autoComplete="email" name="email" placeholder="you@example.com" required type="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          ref={passwordRef}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={6}
          name="password"
          placeholder="至少 6 位密码"
          required
          type="password"
        />
      </label>
      <div className="button-row">
        <button type="button" onClick={fillTestAccount} style={{ background: '#ff9900', color: '#000', marginBottom: '8px' }}>
          🔧 填充测试账号
        </button>
        <button className="button primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "处理中" : mode === "login" ? "登录" : "注册并登录"}
        </button>
      </div>
      <p className="muted">{message}</p>
    </form>
  );
}
