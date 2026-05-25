"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { login, register, type AuthUser } from "@/lib/api";

type XrDomLoginFormProps = {
  onAuthenticated: (user: AuthUser) => void;
  onStatus: (status: string) => void;
};

export function XrDomLoginForm({ onAuthenticated, onStatus }: XrDomLoginFormProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fillTestAccount() {
    if (emailRef.current) emailRef.current.value = "madjad020@gmail.con";
    if (passwordRef.current) passwordRef.current.value = "password123";
    onStatus("Test account filled. Ready to login.");
  }

  function handleInputClick(event: React.MouseEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    input.focus();
    input.click();
    onStatus("Quest VR: Use the spatial keyboard in the scene, or use Quest's physical keyboard.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setIsSubmitting(true);
    onStatus(mode === "login" ? "Signing in..." : "Creating account...");

    try {
      const user = mode === "login" ? await login(email, password) : await register(email, password);
      onStatus(`Signed in as ${user.email}.`);
      onAuthenticated(user);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="xr-dom-login-form" data-testid="xr-dom-login-form" onSubmit={submit}>
      <div className="xr-dom-login-tabs" role="tablist" aria-label="XR login mode">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          Login
        </button>
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>
      <label>
        <span>Email</span>
        <input
          ref={emailRef}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect="off"
          inputMode="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
          onClick={handleInputClick}
          enterKeyHint="next"
        />
      </label>
      <label>
        <span>Password</span>
        <input
          ref={passwordRef}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={6}
          name="password"
          placeholder="6+ characters"
          required
          type="password"
          onClick={handleInputClick}
          enterKeyHint="done"
        />
      </label>
      <button type="button" onClick={fillTestAccount} style={{ background: '#ff9900', color: '#000' }}>
        🔧 Fill Test Account
      </button>
      <button className="xr-dom-login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Working..." : mode === "login" ? "Login" : "Register"}
      </button>
    </form>
  );
}
