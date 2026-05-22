import * as THREE from "three";

type VideoSphereSceneOptions = {
  showReferenceMarkers?: boolean;
  enableDesktopStereo?: boolean;
};

export class VideoSphereScene {
  readonly renderer: THREE.WebGLRenderer;

  private readonly mount: HTMLDivElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly stereoCamera: THREE.StereoCamera;
  private readonly videoTexture: THREE.VideoTexture;
  private readonly videoSphereGeometry: THREE.SphereGeometry;
  private readonly videoSphereMaterial: THREE.MeshBasicMaterial;
  private readonly resizeObserver: ResizeObserver;
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly pointer = { active: false, x: 0, y: 0, yaw: 0, pitch: 0 };
  private readonly view = { yaw: 0, pitch: 0 };
  private desktopStereo = false;

  constructor(mount: HTMLDivElement, video: HTMLVideoElement, options: VideoSphereSceneOptions = {}) {
    this.mount = mount;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1014);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    this.camera.position.set(0, 1.6, 3);
    this.camera.rotation.order = "YXZ";

    this.stereoCamera = new THREE.StereoCamera();
    this.stereoCamera.eyeSep = 0.064;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.xr.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.mount.appendChild(this.renderer.domElement);

    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;

    this.videoSphereGeometry = new THREE.SphereGeometry(24, 64, 32);
    this.videoSphereGeometry.scale(-1, 1, 1);
    this.videoSphereMaterial = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      side: THREE.FrontSide
    });
    this.scene.add(new THREE.Mesh(this.videoSphereGeometry, this.videoSphereMaterial));

    if (options.showReferenceMarkers) {
      this.addReferenceMarkers();
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);
    this.resize();

    if (options.enableDesktopStereo) {
      this.addDesktopControls();
    }
  }

  setDesktopStereo(enabled: boolean) {
    this.desktopStereo = enabled;
  }

  start() {
    this.renderer.setAnimationLoop(() => this.render());
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.onPointerUp);

    if (this.mount.contains(this.renderer.domElement)) {
      this.mount.removeChild(this.renderer.domElement);
    }

    this.videoTexture.dispose();
    this.videoSphereGeometry.dispose();
    this.videoSphereMaterial.dispose();
    for (const geometry of this.disposableGeometries) {
      geometry.dispose();
    }
    for (const material of this.disposableMaterials) {
      material.dispose();
    }
    this.renderer.dispose();
  }

  private resize() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private render() {
    if (!this.renderer.xr.isPresenting) {
      this.camera.rotation.y = this.view.yaw;
      this.camera.rotation.x = this.view.pitch;
    }

    if (this.desktopStereo) {
      const size = this.renderer.getSize(new THREE.Vector2());
      const halfWidth = Math.floor(size.width / 2);
      this.stereoCamera.update(this.camera);
      this.renderer.setScissorTest(true);
      this.renderer.clear();
      this.renderer.setViewport(0, 0, halfWidth, size.height);
      this.renderer.setScissor(0, 0, halfWidth, size.height);
      this.renderer.render(this.scene, this.stereoCamera.cameraL);
      this.renderer.setViewport(halfWidth, 0, halfWidth, size.height);
      this.renderer.setScissor(halfWidth, 0, halfWidth, size.height);
      this.renderer.render(this.scene, this.stereoCamera.cameraR);
      this.renderer.setScissorTest(false);
      return;
    }

    this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);
  }

  private addReferenceMarkers() {
    const floor = new THREE.GridHelper(8, 16, 0x6ee7b7, 0x2b3542);
    this.scene.add(floor);

    const markerGeometry = new THREE.ConeGeometry(0.18, 0.45, 24);
    const markerMaterials = [
      new THREE.MeshBasicMaterial({ color: 0x22c55e }),
      new THREE.MeshBasicMaterial({ color: 0xef4444 }),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 }),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    ];

    [
      { position: new THREE.Vector3(0, 1.5, -3), rotationY: 0, material: markerMaterials[0] },
      { position: new THREE.Vector3(3, 1.5, 0), rotationY: -Math.PI / 2, material: markerMaterials[1] },
      { position: new THREE.Vector3(-3, 1.5, 0), rotationY: Math.PI / 2, material: markerMaterials[2] },
      { position: new THREE.Vector3(0, 1.5, 3), rotationY: Math.PI, material: markerMaterials[3] }
    ].forEach(({ position, rotationY, material }) => {
      const cone = new THREE.Mesh(markerGeometry, material);
      cone.position.copy(position);
      cone.rotation.z = Math.PI / 2;
      cone.rotation.y = rotationY;
      this.scene.add(cone);
    });

    this.disposableGeometries.push(floor.geometry, markerGeometry);
    this.disposableMaterials.push(...markerMaterials);
  }

  private addDesktopControls() {
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointer.active = true;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointer.yaw = this.view.yaw;
    this.pointer.pitch = this.view.pitch;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pointer.active || !this.desktopStereo) {
      return;
    }

    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    this.view.yaw = this.pointer.yaw - dx * 0.004;
    this.view.pitch = THREE.MathUtils.clamp(
      this.pointer.pitch - dy * 0.004,
      -Math.PI / 2 + 0.05,
      Math.PI / 2 - 0.05
    );
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.pointer.active = false;

    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!this.desktopStereo) {
      return;
    }

    const step = 0.06;

    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      this.view.yaw += step;
    }

    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      this.view.yaw -= step;
    }

    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
      this.view.pitch = THREE.MathUtils.clamp(this.view.pitch + step, -1.2, 1.2);
    }

    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
      this.view.pitch = THREE.MathUtils.clamp(this.view.pitch - step, -1.2, 1.2);
    }
  };
}
