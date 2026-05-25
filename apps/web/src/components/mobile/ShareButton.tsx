"use client";

import { useState } from "react";

interface ShareButtonProps {
  exportId: string;
  filename: string;
  downloadUrl: string;
}

export function ShareButton({ exportId, filename, downloadUrl }: ShareButtonProps) {
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!navigator.share) {
      alert("您的浏览器不支持分享功能");
      return;
    }

    setSharing(true);
    try {
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const file = new File([blob], filename || `export-${exportId}.mp4`, {
        type: "video/mp4",
      });

      await navigator.share({
        title: filename || "导出视频",
        text: "来自 360 视频裁剪器的导出视频",
        files: [file],
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("分享失败:", error);
        alert("分享失败，请重试");
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <button
      className="vapor-button vapor-button-ghost"
      onClick={handleShare}
      disabled={sharing}
      data-testid="mobile-share-export"
      aria-label={`分享 ${filename || exportId}`}
    >
      <span>{sharing ? "准备中..." : "分享"}</span>
    </button>
  );
}
