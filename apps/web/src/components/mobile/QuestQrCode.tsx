"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type QuestQrCodeProps = {
  value: string;
};

export function QuestQrCode({ value }: QuestQrCodeProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
      color: {
        dark: "#111827",
        light: "#ffffff"
      }
    })
      .then((nextSrc) => {
        if (active) {
          setSrc(nextSrc);
        }
      })
      .catch(() => {
        if (active) {
          setSrc(null);
        }
      });

    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className="qr-card">
      {src ? <img alt="Quest WebXR entry QR code" src={src} /> : <span>Generating QR code</span>}
    </div>
  );
}
