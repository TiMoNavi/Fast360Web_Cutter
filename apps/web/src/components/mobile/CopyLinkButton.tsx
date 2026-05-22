"use client";

import { useState } from "react";

type CopyLinkButtonProps = {
  value: string;
};

export function CopyLinkButton({ value }: CopyLinkButtonProps) {
  const [message, setMessage] = useState("复制链接");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("已复制");
      window.setTimeout(() => setMessage("复制链接"), 1400);
    } catch {
      setMessage("复制失败");
    }
  }

  return (
    <button className="button" onClick={copy} type="button">
      {message}
    </button>
  );
}
