"use client";

import { useEffect, useMemo, useState } from "react";

type BrowserXr = {
  isSessionSupported?: (mode: "immersive-vr") => Promise<boolean>;
  requestSession?: (mode: "immersive-vr") => Promise<{ end: () => Promise<void> }>;
};

type CheckState = {
  secureContext: boolean;
  hasWebGl: boolean;
  hasNavigatorXr: boolean;
  immersiveVr: "checking" | "supported" | "unsupported" | "unknown";
  message: string;
};

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: BrowserXr }).xr;
}

function canCreateWebGlContext() {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
}

export function WebXrEnvironmentCheck() {
  const [check, setCheck] = useState<CheckState>({
    secureContext: false,
    hasWebGl: false,
    hasNavigatorXr: false,
    immersiveVr: "checking",
    message: "正在检测浏览器 WebXR 环境..."
  });
  const [isRequestingSession, setIsRequestingSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function runCheck() {
      const xr = getNavigatorXr();
      const baseCheck = {
        secureContext: window.isSecureContext,
        hasWebGl: canCreateWebGlContext(),
        hasNavigatorXr: Boolean(xr)
      };

      if (!xr?.isSessionSupported) {
        setCheck({
          ...baseCheck,
          immersiveVr: "unknown",
          message: "当前浏览器没有暴露 navigator.xr。请安装/启用 WebXR 模拟插件，或使用 Quest Browser。"
        });
        return;
      }

      try {
        const supported = await xr.isSessionSupported("immersive-vr");

        if (cancelled) {
          return;
        }

        setCheck({
          ...baseCheck,
          immersiveVr: supported ? "supported" : "unsupported",
          message: supported
            ? "WebXR immersive-vr 可用，可以进行插件或真机测试。"
            : "浏览器有 navigator.xr，但当前没有可用的 immersive-vr 设备。"
        });
      } catch {
        if (!cancelled) {
          setCheck({
            ...baseCheck,
            immersiveVr: "unknown",
            message: "检测 immersive-vr 时出错。请打开 DevTools 的 WebXR 面板并启用模拟设备。"
          });
        }
      }
    }

    runCheck();

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => [
      ["安全上下文", check.secureContext ? "通过" : "未通过"],
      ["WebGL", check.hasWebGl ? "可用" : "不可用"],
      ["navigator.xr", check.hasNavigatorXr ? "存在" : "不存在"],
      [
        "immersive-vr",
        {
          checking: "检测中",
          supported: "支持",
          unsupported: "不支持",
          unknown: "未知"
        }[check.immersiveVr]
      ]
    ],
    [check]
  );

  async function requestVrSession() {
    const xr = getNavigatorXr();

    if (!xr?.requestSession) {
      setCheck((current) => ({
        ...current,
        message: "当前浏览器无法调用 requestSession。先确认插件或 Quest Browser 环境。"
      }));
      return;
    }

    try {
      setIsRequestingSession(true);
      const session = await xr.requestSession("immersive-vr");
      setCheck((current) => ({
        ...current,
        message: "VR session 已成功创建。测试完成后浏览器会自动退出。"
      }));
      await session.end();
    } catch (error) {
      setCheck((current) => ({
        ...current,
        message: error instanceof Error ? error.message : "创建 VR session 失败。"
      }));
    } finally {
      setIsRequestingSession(false);
    }
  }

  return (
    <main>
      <div className="shell stack">
        <section className="panel stack">
          <p className="muted">WebXR Dev Check</p>
          <h1>WebXR 浏览器测试页</h1>
          <p className="muted">{check.message}</p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={check.immersiveVr !== "supported" || isRequestingSession}
              onClick={requestVrSession}
              type="button"
            >
              {isRequestingSession ? "正在请求..." : "Enter VR Test"}
            </button>
            <a className="button" href="/">
              返回首页
            </a>
          </div>
        </section>

        <section className="grid">
          {rows.map(([label, value]) => (
            <div className="panel stack" key={label}>
              <p className="muted">{label}</p>
              <h2>{value}</h2>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
