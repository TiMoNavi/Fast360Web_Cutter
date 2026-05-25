"use client";

import { Animator } from "@arwes/react-animator";
import { FrameKranox, FrameNefrex } from "@arwes/react-frames";
import { Text } from "@arwes/react-text";
import { useState } from "react";
import styles from "./ArwesWorkbenchPlaneLab.module.css";

const leftButtons = [
  ["LOCK", "", "LOCK"],
  ["SAVE", "", "SAVE"],
  ["DROP", "danger", "DISCARD"],
  ["UNDO", "", "RESTORE"]
] as const;

const workflowButtons = [
  ["PLAY", "hot", "PLAY"],
  ["START", "hot", "START_CROP"],
  ["END", "", "END_CROP"],
  ["RENDER", "", "RENDER"]
] as const;

const framingButtons = [
  ["YAW -", "YAW_LEFT"],
  ["YAW +", "YAW_RIGHT"],
  ["PITCH +", "PITCH_UP"],
  ["PITCH -", "PITCH_DOWN"]
] as const;

const defaultModules = ["FRAME", "EFFECT", "EXPORT", "SESSION", "SAMPLER", "PATCH"] as const;
const threeOfficialModules = ["FRAME", "FOV", "FX", "WORKFLOW", "BGM", "EXPORT", "SESSION", "SAMPLER"] as const;

const moduleOptions = {
  BGM: [
    ["AMBIENT", "BGM_AMBIENT"],
    ["KICK", "BGM_KICK"],
    ["PREVIEW", "BGM_PREVIEW"],
    ["SILENT", "BGM_NONE"]
  ],
  EFFECT: [
    ["BLACK", "EFFECT_BLACK"],
    ["WHITE", "EFFECT_WHITE"],
    ["VHS", "EFFECT_VHS"],
    ["CUT", "CUT"]
  ],
  EXPORT: [
    ["RENDER", "RENDER"],
    ["SAVE", "SAVE"],
    ["SESSION", "SESSION"]
  ],
  FOV: [
    ["R-GRIP", "FOV"],
    ["R-STICK", "FOV"],
    ["L-GRIP", "FOV"],
    ["MASK STICK", "FOV"]
  ],
  FRAME: [
    ["YAW -", "YAW_LEFT"],
    ["YAW +", "YAW_RIGHT"],
    ["PITCH +", "PITCH_UP"],
    ["PITCH -", "PITCH_DOWN"]
  ],
  FX: [
    ["BLACK", "EFFECT_BLACK"],
    ["WHITE", "EFFECT_WHITE"],
    ["VHS", "EFFECT_VHS"],
    ["CUT", "CUT"]
  ],
  PATCH: [
    ["SAVE", "SAVE"],
    ["DROP", "DISCARD"],
    ["UNDO", "RESTORE"]
  ],
  SAMPLER: [
    ["START", "START_CROP"],
    ["END", "END_CROP"],
    ["SAVE", "SAVE"]
  ],
  SESSION: [
    ["PLAY", "PLAY"],
    ["SAVE", "SAVE"],
    ["EXPORT", "EXPORT"]
  ],
  WORKFLOW: [
    ["START", "START_CROP"],
    ["END", "END_CROP"],
    ["RENDER", "RENDER"],
    ["SAVE", "SAVE"]
  ]
} as const;

type ModuleId = (typeof defaultModules)[number] | (typeof threeOfficialModules)[number];
type ArwesWorkbenchSurfaceProps = {
  className?: string;
  cropWorkflowStatus?: string;
  fov?: number;
  locked?: boolean;
  maskOpacity?: number;
  modules?: readonly ModuleId[];
  openModule?: string | null;
  playbackStatus?: string;
  recordingSamplesCount?: number;
  showScaleNote?: boolean;
  spatial?: boolean;
  viewTarget?: {
    pitch: number;
    yaw: number;
  };
};

function toggleClass(active: boolean) {
  return active ? `${styles.toggleSwitch} ${styles.active}` : styles.toggleSwitch;
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ArwesWorkbenchSurface({
  className,
  cropWorkflowStatus = "idle",
  fov = 82,
  locked = false,
  maskOpacity = 0.74,
  modules = defaultModules,
  openModule,
  playbackStatus = "ready",
  recordingSamplesCount = 0,
  showScaleNote = false,
  spatial = false,
  viewTarget = { pitch: 4, yaw: -12 }
}: ArwesWorkbenchSurfaceProps) {
  const [openMenu, setOpenMenu] = useState<ModuleId | null>("EFFECT");
  const [headGaze, setHeadGaze] = useState(true);
  const [snap, setSnap] = useState(false);
  const [sampler, setSampler] = useState(true);
  const activeMenu = (openModule as ModuleId | null | undefined) ?? openMenu;
  const lockState = locked || headGaze;
  const workflowLabel = cropWorkflowStatus.replace(/_/g, " ").toUpperCase();
  const activeOptions = activeMenu ? moduleOptions[activeMenu] ?? [] : [];

  return (
    <Animator root active duration={{ enter: 0.8, exit: 0.4 }}>
      <div className={joinClasses(styles.planeWrap, spatial && styles.spatialSurface, className)}>
        <div className={styles.planeGlow} />
        <div className={styles.plane}>
          <div className={styles.grid} aria-hidden="true" />
          <div className={styles.moving} aria-hidden="true" />
          <FrameKranox
            className={styles.frame}
            positioned
            padding={14}
            strokeWidth={2}
            bgStrokeWidth={1}
            squareSize={26}
            smallLineLength={18}
            largeLineLength={78}
          />
          <FrameNefrex
            className={styles.innerFrame}
            positioned
            padding={4}
            strokeWidth={1}
            squareSize={18}
            smallLineLength={16}
            largeLineLength={72}
          />

          <div className={styles.content}>
            <section className={styles.bay}>
              <FrameNefrex className={styles.bayFrame} positioned padding={8} strokeWidth={1} />
              <div className={styles.bayTitle}>
                <Text fixed>DIRECT KEYS</Text>
                <span>01</span>
              </div>
              <div className={styles.leftControlLayout}>
                <button className={styles.arcButton} data-action="CUT" type="button">
                  <span className={`${styles.arc} ${styles.arcTop}`} />
                  <span className={`${styles.arc} ${styles.arcRight}`} />
                  <span className={`${styles.arc} ${styles.arcBottom}`} />
                  <span className={`${styles.arc} ${styles.arcLeft}`} />
                  <span className={styles.arcPulse} />
                  <span className={styles.arcCore}>CUT</span>
                </button>
                <div className={styles.miniReadout}>
                  <span>{locked ? "VIEW LOCK" : "HEAD LOCK"}</span>
                  <strong>{lockState ? "ARMED" : "OFF"}</strong>
                </div>
              </div>
              <div className={styles.compactButtonGrid}>
                {leftButtons.map(([label, tone, action]) => (
                  <button
                    className={[styles.controlButton, tone ? styles[tone] : ""].filter(Boolean).join(" ")}
                    data-action={action}
                    key={label}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.compactButtonGrid}>
                {workflowButtons.map(([label, tone, action]) => (
                  <button
                    className={[styles.controlButton, tone ? styles[tone] : ""].filter(Boolean).join(" ")}
                    data-action={action}
                    key={label}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.centerBay}>
              <div className={styles.headerLine}>
                <Text fixed>HEAD-GAZE FRAMING CORE</Text>
                <div className={styles.telemetry}>
                  <span>YAW {viewTarget.yaw.toFixed(0)}</span>
                  <span>PITCH {viewTarget.pitch.toFixed(0)}</span>
                  <span>FOV {fov}</span>
                </div>
              </div>
              <div className={styles.microToggleStrip}>
                <button className={headGaze ? `${styles.microToggle} ${styles.active}` : styles.microToggle} onClick={() => setHeadGaze((value) => !value)} type="button">
                  HEAD {headGaze ? "ON" : "OFF"}
                </button>
                <button className={snap ? `${styles.microToggle} ${styles.active}` : styles.microToggle} onClick={() => setSnap((value) => !value)} type="button">
                  SNAP {snap ? "GRID" : "FREE"}
                </button>
                <button className={sampler ? `${styles.microToggle} ${styles.active}` : styles.microToggle} onClick={() => setSampler((value) => !value)} type="button">
                  SAMPLE {sampler ? "ON" : "OFF"}
                </button>
              </div>
              <div className={styles.screen}>
                <div className={styles.reticle} />
                <span className={styles.trace} />
                <div className={styles.bottomControls}>
                  {framingButtons.map(([label, action]) => (
                    <button className={styles.controlButton} data-action={action} key={action} type="button">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.editSliders}>
                <label>
                  <span>FOV {fov}</span>
                  <input aria-label="FOV readout" disabled max="112" min="48" type="range" value={fov} />
                </label>
                <label>
                  <span>MASK {maskOpacity.toFixed(2)}</span>
                  <input data-control="mask-opacity" max="0.95" min="0" readOnly step="0.01" type="range" value={maskOpacity} />
                </label>
              </div>
            </section>

            <section className={styles.bay}>
              <FrameNefrex className={styles.bayFrame} positioned padding={8} strokeWidth={1} />
              <div className={styles.bayTitle}>
                <Text fixed>MODULE STRIP</Text>
                <span>02</span>
              </div>
              <div className={styles.moduleGrid}>
                {modules.map((label) => (
                  <button
                    className={activeMenu === label ? `${styles.moduleButton} ${styles.selected}` : styles.moduleButton}
                    data-module={label}
                    key={label}
                    onClick={() => setOpenMenu((current) => (current === label ? null : label))}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.toggleGrid}>
                <button className={toggleClass(headGaze)} onClick={() => setHeadGaze((value) => !value)} type="button">
                  <span>HEAD</span>
                  <strong>{headGaze ? "ON" : "OFF"}</strong>
                </button>
                <button className={toggleClass(snap)} onClick={() => setSnap((value) => !value)} type="button">
                  <span>MASK</span>
                  <strong>{maskOpacity.toFixed(2)}</strong>
                </button>
                <button className={toggleClass(sampler)} onClick={() => setSampler((value) => !value)} type="button">
                  <span>SAMPLE</span>
                  <strong>{recordingSamplesCount || (sampler ? "5HZ" : "PAUSE")}</strong>
                </button>
              </div>
              {activeMenu ? (
                <div className={styles.moreMenu}>
                  <FrameNefrex className={styles.moreMenuFrame} positioned padding={5} strokeWidth={1} />
                  <div className={styles.moreMenuHeader}>
                    <span>{activeMenu} MORE</span>
                    <button onClick={() => setOpenMenu(null)} type="button">
                      X
                    </button>
                  </div>
                  <div className={styles.moreMenuGrid}>
                    {activeOptions.map(([option, action]) => (
                      <button data-action={action} key={`${activeMenu}-${option}`} type="button">
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className={styles.statusStack}>
                {[
                  ["PATH PATCH", recordingSamplesCount ? `${recordingSamplesCount} PTS` : "ACCEPTED", styles.lamp],
                  ["SAMPLER", workflowLabel, styles.lampWarn],
                  ["VIDEO BUS", playbackStatus.toUpperCase(), styles.lampHot]
                ].map(([label, value, lampClass]) => (
                  <button className={styles.statusButton} key={label} type="button">
                    <span className={lampClass} />
                    <span>{label}</span>
                    <span>{value}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
        {showScaleNote ? <span className={styles.scaleNote}>visual ratio 10:3 / target WebXR plane width 1m, height 0.3m</span> : null}
      </div>
    </Animator>
  );
}

export function ArwesWorkbenchPlaneLab() {
  return (
    <main className={styles.page}>
      <section className={styles.stage} data-testid="arwes-workbench-plane-lab">
        <div className={styles.hud}>
          <p>ARWES SCI-FI WORKBENCH / FLAT PANEL PROOF</p>
          <h1>1.0m x 0.3m single surface</h1>
          <p>Direct Arwes frames + grid backgrounds. No spatial layering yet.</p>
        </div>

        <ArwesWorkbenchSurface showScaleNote />
      </section>
    </main>
  );
}
