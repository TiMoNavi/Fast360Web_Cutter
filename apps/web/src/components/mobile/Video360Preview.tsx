"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Video360PreviewProps = {
  posterUrl?: string | null;
  sourceUrl: string;
  title: string;
};

export function Video360Preview({ posterUrl, sourceUrl, title }: Video360PreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sceneRef = useRef<{
    camera: THREE.PerspectiveCamera;
    material: THREE.MeshBasicMaterial;
    renderer: THREE.WebGLRenderer;
    texture: THREE.VideoTexture;
  } | null>(null);
  const pointerRef = useRef({ active: false, pitch: 0, x: 0, y: 0, yaw: 0 });
  const viewRef = useRef({ pitch: 0, yaw: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [message, setMessage] = useState("点击播放后，可在窗口内拖动查看 360 画面");

  useEffect(() => {
    const mount = mountRef.current;
    const video = videoRef.current;
    if (!mount || !video) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05000d);

    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.SphereGeometry(24, 96, 48);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(geometry, material));

    sceneRef.current = { camera, material, renderer, texture };

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerRef.current = {
        active: true,
        pitch: viewRef.current.pitch,
        x: event.clientX,
        y: event.clientY,
        yaw: viewRef.current.yaw
      };
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const pointer = pointerRef.current;
      if (!pointer.active) {
        return;
      }
      viewRef.current.yaw = pointer.yaw - (event.clientX - pointer.x) * 0.004;
      viewRef.current.pitch = THREE.MathUtils.clamp(
        pointer.pitch - (event.clientY - pointer.y) * 0.004,
        -Math.PI / 2 + 0.08,
        Math.PI / 2 - 0.08
      );
      setMessage("拖动中：左右旋转视角，上下调整俯仰");
    };

    const onPointerUp = (event: PointerEvent) => {
      pointerRef.current.active = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(event.deltaY) * 4, 45, 95);
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    renderer.setAnimationLoop(() => {
      camera.rotation.y = viewRef.current.yaw;
      camera.rotation.x = viewRef.current.pitch;
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      texture.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [sourceUrl]);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
        setMessage("正在播放：拖动窗口查看不同方向");
      } catch {
        setMessage("浏览器阻止了播放，请再点一次播放按钮");
      }
      return;
    }

    video.pause();
    setIsPlaying(false);
    setMessage("已暂停");
  }

  function resetView() {
    viewRef.current = { pitch: 0, yaw: 0 };
    const scene = sceneRef.current;
    if (scene) {
      scene.camera.fov = 75;
      scene.camera.updateProjectionMatrix();
    }
    setMessage("视角已回到正前方");
  }

  return (
    <div className="vapor-360-preview">
      <video
        ref={videoRef}
        className="vapor-360-video-source"
        crossOrigin="anonymous"
        loop
        muted
        playsInline
        poster={posterUrl ?? undefined}
        preload="metadata"
        src={sourceUrl}
        title={title}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      <div ref={mountRef} className="vapor-360-canvas" role="img" aria-label={`${title} 的 360 视频预览`} />
      <div className="vapor-360-overlay">
        <span>&gt; 360 STREAM PREVIEW</span>
        <p>{message}</p>
      </div>
      <div className="vapor-360-controls">
        <button className="vapor-button vapor-button-primary" type="button" onClick={togglePlayback}>
          <span>{isPlaying ? "暂停" : "播放"}</span>
        </button>
        <button className="vapor-button vapor-button-ghost" type="button" onClick={resetView}>
          <span>重置视角</span>
        </button>
      </div>
    </div>
  );
}
