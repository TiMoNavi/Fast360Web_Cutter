export function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(durationMs?: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "Unknown duration";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatResolution(width?: number | null, height?: number | null) {
  return width && height ? `${width} x ${height}` : "Unknown resolution";
}

export function formatFps(fps?: number | null) {
  return fps ? `${Number(fps).toFixed(Number(fps) % 1 === 0 ? 0 : 2)} fps` : "Unknown fps";
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    uploading: "上传中",
    uploaded: "已上传",
    ready_for_xr: "可进入 WebXR",
    collecting: "采集中",
    rendering: "处理中",
    cutting: "裁剪中",
    export_ready: "可下载",
    ready: "可下载",
    failed: "失败",
    dirty: "待重渲染",
    discarded: "已丢弃",
    abandoned: "已放弃",
    done: "完成"
  };
  return status ? labels[status] ?? status : "未知";
}
