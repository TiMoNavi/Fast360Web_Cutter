"use client";

import type { ThreeOfficialCropWorkflowStatus } from "./format";
import { cropWorkflowLabel, formatClock } from "./format";

type ThreeOfficialLabHudProps = {
  backendStatus: string;
  cropExportId: string | null;
  cropWorkflowStatus: ThreeOfficialCropWorkflowStatus;
  currentTimeMs: number;
  durationMs: number;
  followMode: string;
  fov: number;
  lastAction: string;
  lastSemantic: string;
  leftGripModifier: boolean;
  maskOpacity: number;
  playbackStatus: string;
  quickMenuActive: boolean;
  quickMenuSelection: string;
  recordingRate: number;
  recordingSamplesCount: number;
  spatialMenusVisible: boolean;
  viewTarget: {
    input: string;
    pitch: number;
    yaw: number;
  };
};

export function ThreeOfficialLabHud({
  backendStatus,
  cropExportId,
  cropWorkflowStatus,
  currentTimeMs,
  durationMs,
  followMode,
  fov,
  lastAction,
  lastSemantic,
  leftGripModifier,
  maskOpacity,
  playbackStatus,
  quickMenuActive,
  quickMenuSelection,
  recordingRate,
  recordingSamplesCount,
  spatialMenusVisible,
  viewTarget
}: ThreeOfficialLabHudProps) {
  const recording = cropWorkflowStatus === "recording";

  return (
    <div className="three-official-hud">
      <span
        aria-label={recording ? "Recording" : "Not recording"}
        className={recording ? "three-official-record-dot is-recording" : "three-official-record-dot"}
        data-testid="three-official-record-dot"
      />
      <p>Three.js official pattern</p>
      <h1>HTMLMesh + InteractiveGroup + Crop Mask</h1>
      <span data-testid="three-official-last-action">{lastAction}</span>
      <span data-testid="three-official-last-semantic">{lastSemantic}</span>
      <span data-testid="three-official-playback-status">
        sphere player: {playbackStatus} / {formatClock(currentTimeMs)} / {formatClock(durationMs)}
      </span>
      <span data-testid="three-official-view-target">
        viewfinder: {followMode} / {viewTarget.input} / yaw {viewTarget.yaw.toFixed(1)} / pitch {viewTarget.pitch.toFixed(1)} / FOV {fov}
      </span>
      <span data-testid="three-official-mask-opacity">
        mask opacity: {maskOpacity.toFixed(2)} / left grip modifier {leftGripModifier ? "on" : "off"}
      </span>
      <span data-testid="three-official-workflow-status">
        workflow: {cropWorkflowLabel(cropWorkflowStatus)} / samples {recordingSamplesCount} / rec {recordingRate}x / backend {backendStatus} / export {cropExportId ?? "none"}
      </span>
      <span data-testid="three-official-quick-menu-status">
        quick menu: {quickMenuActive ? "open" : "closed"} / {quickMenuSelection} / menus {spatialMenusVisible ? "visible" : "hidden"}
      </span>
    </div>
  );
}
