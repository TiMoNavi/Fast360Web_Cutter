"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadVideoWithProgress } from "@/lib/api";
import { formatBytes } from "@/components/mobile/format";

const MAX_HINT_BYTES = 2 * 1024 * 1024 * 1024;

export function VideoUploadForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string>("选择一个 360 MP4 后上传。");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  function validateFile(file: File) {
    const name = file.name.toLowerCase();
    const allowed = [".mp4", ".mov", ".m4v", ".webm", ".mkv"].some((suffix) =>
      name.endsWith(suffix)
    );
    if (!allowed) {
      return "请选择 MP4/MOV/M4V/WebM/MKV 视频文件。";
    }
    if (file.size > MAX_HINT_BYTES) {
      return `当前 MVP 上传限制约为 ${formatBytes(MAX_HINT_BYTES)}。`;
    }
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) {
      setMessage("请先选择视频文件。");
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setMessage("上传中...");

    try {
      const video = await uploadVideoWithProgress(file, ({ percent }) => setProgress(percent));
      setProgress(100);
      setMessage(`上传成功：${video.filename ?? video.id}`);
      setSelectedFile(null);
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败。");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="upload-panel" onSubmit={onSubmit}>
      <label className="upload-dropzone">
        <span>选择 360 视频文件</span>
        <strong>{selectedFile ? selectedFile.name : "点击选择文件"}</strong>
        <small>
          {selectedFile
            ? `${formatBytes(selectedFile.size)} · ${selectedFile.type || "未知类型"}`
            : "支持 MP4/MOV/M4V/WebM/MKV，当前 MVP 使用普通表单上传。"}
        </small>
        <input
          accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
          name="file"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setSelectedFile(file);
            setProgress(0);
            setMessage(file ? validateFile(file) ?? "文件已选择，可以上传。" : "选择一个 360 MP4 后上传。");
          }}
          type="file"
        />
      </label>
      <div className="upload-progress" aria-label="上传进度">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="button-row">
        <button className="button primary" disabled={isUploading} type="submit">
          {isUploading ? `上传中 ${progress}%` : "上传视频"}
        </button>
      </div>
      <p className="muted">{message}</p>
    </form>
  );
}
