"use client";

import { useEffect, useState } from "react";
import { QuestQrCode } from "./QuestQrCode";

export function LanQrCodeShare() {
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/network-info")
      .then((res) => res.json())
      .then((data) => {
        const ip = data.localIp || "192.168.42.92";
        const port = window.location.port || "3000";
        const path = "/xr/three-official-interactive-lab";
        setUrl(`http://${ip}:${port}${path}`);
        setLoading(false);
      })
      .catch(() => {
        setUrl(`http://192.168.42.92:3000/xr/three-official-interactive-lab`);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="lan-qr-share">加载中...</div>;
  }

  return (
    <div className="lan-qr-share">
      <h3>扫码体验 WebXR</h3>
      <QuestQrCode value={url} />
      <p className="url-text">{url}</p>
      <p className="hint">请确保设备连接到同一局域网</p>
    </div>
  );
}
