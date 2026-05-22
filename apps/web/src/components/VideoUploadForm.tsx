"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadVideo } from "@/lib/api";

export function VideoUploadForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string>("选择一个视频文件后上传。");
  const [isUploading, setIsUploading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) {
      setMessage("请先选择文件。");
      return;
    }

    setIsUploading(true);
    setMessage("上传中...");

    try {
      const video = await uploadVideo(file);
      setMessage(`上传成功：${video.filename ?? video.id}`);
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败。");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <label className="field">
        <span>视频文件</span>
        <input accept="video/*" name="file" type="file" />
      </label>
      <div className="button-row">
        <button className="button primary" disabled={isUploading} type="submit">
          {isUploading ? "上传中" : "上传"}
        </button>
      </div>
      <p className="muted">{message}</p>
    </form>
  );
}
