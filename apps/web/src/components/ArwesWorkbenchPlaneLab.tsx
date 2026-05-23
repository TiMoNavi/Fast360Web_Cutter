"use client";

import { Animator } from "@arwes/react-animator";
import { FrameKranox, FrameNefrex } from "@arwes/react-frames";
import { Text } from "@arwes/react-text";
import { useState } from "react";
import styles from "./ArwesWorkbenchPlaneLab.module.css";

const leftButtons = [
  ["CUT", "hot"],
  ["LOCK", ""],
  ["SAVE", ""],
  ["DROP", "danger"],
  ["UNDO", ""],
  ["REDO", ""],
  ["FOV+", ""],
  ["FOV-", ""],
  ["MARK", ""],
  ["HOLD", ""],
  ["SNAP", ""],
  ["FLUSH", "hot"]
] as const;

const modules = ["FRAME", "EFFECT", "EXPORT", "SESSION", "SAMPLER", "PATCH"] as const;
const moreOptions = ["BLACK", "FADE", "GLOW", "NOTE", "PIN", "QUEUE"];

type ModuleId = (typeof modules)[number];

function toggleClass(active: boolean) {
  return active ? `${styles.toggleSwitch} ${styles.active}` : styles.toggleSwitch;
}

export function ArwesWorkbenchPlaneLab() {
  const [openMenu, setOpenMenu] = useState<ModuleId | null>("EFFECT");
  const [headGaze, setHeadGaze] = useState(true);
  const [snap, setSnap] = useState(false);
  const [sampler, setSampler] = useState(true);

  return (
    <main className={styles.page}>
      <section className={styles.stage} data-testid="arwes-workbench-plane-lab">
        <div className={styles.hud}>
          <p>ARWES SCI-FI WORKBENCH / FLAT PANEL PROOF</p>
          <h1>1.0m x 0.3m single surface</h1>
          <p>Direct Arwes frames + grid backgrounds. No spatial layering yet.</p>
        </div>

        <Animator root active duration={{ enter: 0.8, exit: 0.4 }}>
          <div className={styles.planeWrap}>
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
                    <button className={styles.arcButton} type="button">
                      <span className={`${styles.arc} ${styles.arcTop}`} />
                      <span className={`${styles.arc} ${styles.arcRight}`} />
                      <span className={`${styles.arc} ${styles.arcBottom}`} />
                      <span className={`${styles.arc} ${styles.arcLeft}`} />
                      <span className={styles.arcPulse} />
                      <span className={styles.arcCore}>CUT</span>
                    </button>
                    <div className={styles.miniReadout}>
                      <span>HEAD LOCK</span>
                      <strong>{headGaze ? "ARMED" : "OFF"}</strong>
                    </div>
                  </div>
                  <div className={styles.compactButtonGrid}>
                    {leftButtons.slice(1, 5).map(([label, tone]) => (
                      <button
                        className={[styles.controlButton, tone ? styles[tone] : ""].filter(Boolean).join(" ")}
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
                      <span>YAW -12</span>
                      <span>PITCH +04</span>
                      <span>FOV 82</span>
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
                        className={openMenu === label ? `${styles.moduleButton} ${styles.selected}` : styles.moduleButton}
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
                      <span>SNAP</span>
                      <strong>{snap ? "GRID" : "FREE"}</strong>
                    </button>
                    <button className={toggleClass(sampler)} onClick={() => setSampler((value) => !value)} type="button">
                      <span>SAMPLE</span>
                      <strong>{sampler ? "5HZ" : "PAUSE"}</strong>
                    </button>
                  </div>
                  {openMenu ? (
                    <div className={styles.moreMenu}>
                      <FrameNefrex className={styles.moreMenuFrame} positioned padding={5} strokeWidth={1} />
                      <div className={styles.moreMenuHeader}>
                        <span>{openMenu} MORE</span>
                        <button onClick={() => setOpenMenu(null)} type="button">
                          X
                        </button>
                      </div>
                      <div className={styles.moreMenuGrid}>
                        {moreOptions.map((option) => (
                          <button key={`${openMenu}-${option}`} type="button">
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.statusStack}>
                    {[
                      ["PATH PATCH", "ACCEPTED", styles.lamp],
                      ["SAMPLER", sampler ? "5HZ" : "PAUSED", styles.lampWarn],
                      ["EFFECT BUS", "READY", styles.lampHot]
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
            <span className={styles.scaleNote}>visual ratio 10:3 / target WebXR plane width 1m, height 0.3m</span>
          </div>
        </Animator>
      </section>
    </main>
  );
}
