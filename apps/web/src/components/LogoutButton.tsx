"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function onLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push("/mobile/login");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <button className="button" disabled={isLoggingOut} onClick={onLogout} type="button">
      {isLoggingOut ? "退出中" : "退出登录"}
    </button>
  );
}
