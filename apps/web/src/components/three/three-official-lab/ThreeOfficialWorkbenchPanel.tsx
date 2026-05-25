"use client";

import type { ThreeOfficialCropWorkflowStatus } from "./format";
import { cropWorkflowLabel } from "./format";

type ThreeOfficialWorkbenchPanelProps = {
  cropWorkflowStatus: ThreeOfficialCropWorkflowStatus;
  fov: number;
  locked: boolean;
  maskOpacity: number;
  mode: string;
  openModule: string | null;
  playbackStatus: string;
  recordingSamplesCount: number;
  viewTarget: {
    pitch: number;
    yaw: number;
  };
};

const WORKBENCH_MODULES = ["FRAME", "FOV", "FX", "BGM", "EXPORT", "SESSION", "SAMPLER"] as const;

export function ThreeOfficialWorkbenchPanel({
  cropWorkflowStatus,
  fov,
  locked,
  maskOpacity,
  mode,
  openModule,
  playbackStatus,
  recordingSamplesCount,
  viewTarget
}: ThreeOfficialWorkbenchPanelProps) {
  return (
    <>
      <div className="three-official-panel-chrome">
        <span />
        <span />
        <span />
        <strong>QUEST EDIT DESK // HTMLMESH</strong>
      </div>
      <div className="three-official-panel-body">
        <section className="three-official-direct">
          <p>&gt; SESSION WORKBENCH</p>
          <button className="three-official-orb" data-action="CUT" type="button">
            <span className="three-official-orb-ring" />
            <strong>CUT</strong>
          </button>
          <div className="three-official-workflow-mini-status">
            <span>{cropWorkflowLabel(cropWorkflowStatus)}</span>
            <strong>{recordingSamplesCount} samples</strong>
          </div>
        </section>
        <section className="three-official-workbench-stack">
          <p>&gt; FRAMING</p>
          <div className="three-official-direct-grid">
            <button data-action="YAW_LEFT" type="button">
              Yaw -
            </button>
            <button data-action="YAW_RIGHT" type="button">
              Yaw +
            </button>
            <button data-action="PITCH_UP" type="button">
              Pitch +
            </button>
            <button data-action="PITCH_DOWN" type="button">
              Pitch -
            </button>
            <button data-action="LOCK" type="button">
              {locked ? "UNLOCK" : "LOCK"}
            </button>
            <button data-action="FLUSH" type="button">
              FLUSH
            </button>
            <button data-action="FOV" type="button">
              GRIP + STICK
            </button>
          </div>
          <label className="three-official-slider">
            <span>FOV {fov}</span>
            <input aria-label="FOV readout" disabled max="112" min="48" type="range" value={fov} />
          </label>
          <label className="three-official-slider">
            <span>MASK {maskOpacity.toFixed(2)}</span>
            <input data-control="mask-opacity" max="0.95" min="0" step="0.01" type="range" value={maskOpacity} readOnly />
          </label>
        </section>
        <section className="three-official-modules">
          <p>&gt; WORKFLOW / MODULES</p>
          <div className="three-official-workflow-button-grid">
            <button data-action="START_CROP" type="button">
              START CROP
            </button>
            <button data-action="END_CROP" type="button">
              END CROP
            </button>
            <button data-action="RENDER" type="button">
              RENDER
            </button>
            <button data-action="DISCARD" type="button">
              DISCARD
            </button>
            <button data-action="RESTORE" type="button">
              RESTORE
            </button>
            <button className="workflow-open" data-module="WORKFLOW" type="button">
              WORKFLOW
            </button>
          </div>
          <div className="three-official-module-grid">
            {WORKBENCH_MODULES.map((module) => (
              <button className={openModule === module ? "active" : ""} data-module={module} key={module} type="button">
                {module}
              </button>
            ))}
          </div>
          <div className="three-official-readout">
            <span>MODE</span>
            <strong>{mode}</strong>
            <span>VIDEO</span>
            <strong>{playbackStatus}</strong>
            <span>LOCK</span>
            <strong>{locked ? "ON" : "OFF"}</strong>
            <span>MASK</span>
            <strong>{maskOpacity.toFixed(2)}</strong>
            <span>POSE</span>
            <strong>
              {viewTarget.yaw.toFixed(0)}/{viewTarget.pitch.toFixed(0)}
            </strong>
          </div>
        </section>
      </div>
    </>
  );
}
