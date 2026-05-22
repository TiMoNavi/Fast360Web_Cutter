"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("登录或注册后进入我的视频。");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      router.push("/mobile/videos");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "认证失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="button-row">
        <button
          className={mode === "login" ? "button primary" : "button"}
          onClick={() => setMode("login")}
          type="button"
        >
          登录
        </button>
        <button
          className={mode === "register" ? "button primary" : "button"}
          onClick={() => setMode("register")}
          type="button"
        >
          注册
        </button>
      </div>
      <label className="field">
        <span>Email</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input autoComplete="current-password" minLength={6} name="password" required type="password" />
      </label>
      <div className="button-row">
        <button className="button primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "处理中" : mode === "login" ? "登录" : "注册并登录"}
        </button>
      </div>
      <p className="muted">{message}</p>
    </form>
  );
}
