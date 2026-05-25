"use client";

export function ThreeOfficialInteractiveLabStyles() {
  return (
    <style jsx global>{`
        .three-official-lab-page {
          min-height: 100vh;
          overflow: hidden;
          background: #070011;
          color: #e0e0e0;
          font-family: "Share Tech Mono", ui-monospace, Consolas, monospace;
        }

        .three-official-stage,
        .three-official-mount {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
        }

        .three-official-mount :global(canvas) {
          display: block;
          width: 100%;
          height: 100%;
        }

        .three-official-video-source {
          position: fixed;
          left: -12000px;
          top: -12000px;
          width: 1px;
          height: 1px;
          opacity: 0.01;
          pointer-events: none;
        }

        .three-official-workflow-state {
          position: fixed;
          left: -12000px;
          top: 720px;
          display: grid;
          gap: 4px;
          width: 640px;
          min-height: 120px;
          overflow: hidden;
          opacity: 0.01;
          pointer-events: auto;
        }

        .three-official-mode-strip {
          position: fixed;
          left: -12000px;
          top: 24px;
          display: grid;
          grid-template-columns: 1.1fr 1fr 1fr 1.3fr;
          gap: 8px;
          align-items: center;
          width: 720px;
          height: 72px;
          overflow: hidden;
          border: 2px solid rgba(0, 255, 255, 0.7);
          background: rgba(7, 0, 17, 0.76);
          box-shadow:
            0 0 22px rgba(0, 255, 255, 0.28),
            inset 0 0 20px rgba(255, 255, 255, 0.1);
          color: #e0e0e0;
          font: 900 18px "Share Tech Mono", monospace;
          padding: 0 18px;
          clip-path: polygon(14px 0, calc(100% - 16px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px);
        }

        .three-official-mode-strip strong {
          color: #ff9900;
          font: 900 28px Orbitron, system-ui, sans-serif;
          text-shadow: 0 0 14px rgba(255, 153, 0, 0.62);
        }

        .three-official-mode-strip span {
          min-width: 0;
          overflow: hidden;
          color: #9fefff;
          text-overflow: ellipsis;
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.55);
          white-space: nowrap;
        }

        .three-official-player-ui {
          position: fixed;
          left: -12000px;
          top: 24px;
          width: 1040px;
          height: 216px;
          overflow: hidden;
          border: 2px solid #00ffff;
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.09), transparent 16%, rgba(0, 255, 255, 0.07) 70%, rgba(255, 0, 255, 0.08)),
            linear-gradient(145deg, rgba(26, 16, 60, 0.58), rgba(9, 0, 20, 0.68) 56%, rgba(10, 34, 72, 0.52));
          box-shadow:
            0 0 32px rgba(0, 255, 255, 0.28),
            0 0 72px rgba(255, 0, 255, 0.14),
            inset 0 0 30px rgba(0, 255, 255, 0.1);
          color: #e0e0e0;
          clip-path: polygon(18px 0, calc(100% - 24px) 0, 100% 18px, 100% calc(100% - 34px), calc(100% - 20px) 100%, 12px 100%, 0 calc(100% - 18px), 0 22px);
          padding: 14px 18px 16px;
        }

        .three-official-player-ui[data-visible="false"] {
          opacity: 0.46;
        }

        .three-official-player-chrome {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: -14px -18px 10px;
          min-height: 34px;
          padding: 0 18px;
          border-bottom: 1px solid rgba(0, 255, 255, 0.45);
          background: linear-gradient(90deg, rgba(0, 255, 255, 0.11), rgba(255, 0, 255, 0.05));
        }

        .three-official-player-chrome strong {
          margin-right: auto;
          color: #00ffff;
          font: 900 15px Orbitron, system-ui, sans-serif;
          text-shadow: 0 0 12px rgba(0, 255, 255, 0.78);
        }

        .three-official-player-chrome span {
          color: #ff9900;
          font-size: 12px;
          text-shadow: 0 0 10px rgba(255, 153, 0, 0.55);
        }

        .three-official-player-dot {
          width: 9px;
          height: 9px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 10px currentColor;
        }

        .three-official-player-dot.magenta {
          color: #ff00ff;
        }

        .three-official-player-dot.cyan {
          color: #00ffff;
        }

        .three-official-player-dot.orange {
          color: #ff9900;
        }

        .three-official-player-main-row {
          display: grid;
          grid-template-columns: 216px minmax(140px, 1fr) 258px 220px 62px;
          gap: 10px;
          align-items: stretch;
        }

        .three-official-player-now span,
        .three-official-player-list button span {
          color: #9fefff;
          font-size: 11px;
        }

        .three-official-player-progress {
          display: grid;
          gap: 8px;
          margin-bottom: 10px;
          padding: 10px 14px 12px;
          border: 1px solid rgba(255, 0, 255, 0.32);
          background:
            linear-gradient(90deg, rgba(7, 0, 17, 0.38), rgba(0, 255, 255, 0.06), rgba(255, 0, 255, 0.06)),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.055) 0 1px, transparent 1px 88px);
          box-shadow:
            0 0 18px rgba(0, 255, 255, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          clip-path: polygon(12px 0, calc(100% - 10px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 14px) 100%, 0 100%, 0 14px);
        }

        .three-official-player-timecode {
          display: grid;
          grid-template-columns: 58px 1fr 58px;
          align-items: center;
          gap: 12px;
        }

        .three-official-player-timecode h2 {
          margin: 0;
          overflow: hidden;
          color: #fff;
          font: 900 19px Orbitron, system-ui, sans-serif;
          line-height: 1.1;
          text-align: center;
          text-overflow: ellipsis;
          text-shadow: 0 0 14px rgba(255, 0, 255, 0.45);
          white-space: nowrap;
        }

        .three-official-player-timecode span {
          color: #9fefff;
          font-size: 12px;
          text-align: center;
        }

        .three-official-player-progress input {
          width: 100%;
          height: 20px;
          accent-color: #ff00ff;
          cursor: pointer;
        }

        .three-official-player-transport {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .three-official-player-now,
        .three-official-player-list,
        .three-official-player-edit-row {
          display: grid;
          gap: 8px;
          min-width: 0;
          padding: 8px;
          border: 1px solid rgba(255, 0, 255, 0.28);
          background: linear-gradient(135deg, rgba(7, 0, 17, 0.34), rgba(0, 255, 255, 0.055));
          box-shadow:
            0 0 18px rgba(0, 255, 255, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.09);
          clip-path: polygon(10px 0, calc(100% - 9px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 12px) 100%, 0 100%, 0 12px);
        }

        .three-official-player-now {
          align-content: center;
          padding-inline: 12px;
        }

        .three-official-player-now span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .three-official-player-now select {
          width: 100%;
          min-width: 0;
          height: 34px;
          border: 1px solid rgba(0, 255, 255, 0.68);
          background: rgba(7, 0, 17, 0.82);
          color: #fff;
          cursor: pointer;
          font: 900 11px "Share Tech Mono", monospace;
          outline: none;
          text-overflow: ellipsis;
          text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
        }

        .three-official-player-now select:focus {
          border-color: #ff9900;
          box-shadow: 0 0 14px rgba(255, 153, 0, 0.32);
        }

        .three-official-player-transport button,
        .three-official-player-edit-row button,
        .three-official-player-list button,
        .three-official-player-hide {
          min-height: 34px;
          border: 2px solid rgba(0, 255, 255, 0.68);
          background: linear-gradient(135deg, rgba(7, 0, 17, 0.5), rgba(26, 16, 60, 0.52), rgba(0, 255, 255, 0.08));
          color: #e0e0e0;
          cursor: pointer;
          font: 900 12px "Share Tech Mono", monospace;
          text-shadow: 0 0 8px rgba(0, 255, 255, 0.52);
          box-shadow:
            0 0 16px rgba(0, 255, 255, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-player-transport button {
          display: grid;
          place-items: center;
        }

        .three-official-player-transport button.primary {
          gap: 2px;
        }

        .three-official-player-transport button.primary strong {
          font-size: 14px;
        }

        .three-official-player-transport button.primary span {
          color: #ffcf83;
          font-size: 10px;
          text-transform: uppercase;
        }

        .three-official-player-edit-row {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }

        .three-official-player-edit-row button {
          min-height: 28px;
          padding: 3px 6px;
          font-size: 10px;
        }

        .three-official-player-edit-row button strong,
        .three-official-player-edit-row button span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .three-official-player-edit-row button.record {
          grid-column: span 2;
          border-color: rgba(255, 57, 57, 0.84);
          background: linear-gradient(135deg, rgba(255, 57, 57, 0.2), rgba(7, 0, 17, 0.48), rgba(255, 153, 0, 0.1));
        }

        .three-official-player-transport button.primary,
        .three-official-player-edit-row button.active,
        .three-official-player-list button.active {
          border-color: #ff9900;
          color: #fff;
          background: linear-gradient(135deg, rgba(255, 153, 0, 0.28), rgba(255, 0, 255, 0.13), rgba(0, 255, 255, 0.09));
          box-shadow:
            0 0 20px rgba(255, 153, 0, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }

        .three-official-player-list {
          overflow: hidden;
        }

        .three-official-player-list button {
          display: grid;
          gap: 2px;
          min-height: 34px;
          overflow: hidden;
          text-align: left;
        }

        .three-official-player-list button strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .three-official-player-hide {
          width: 100%;
          height: 100%;
          min-height: 72px;
          border-color: rgba(255, 0, 255, 0.68);
          background: linear-gradient(135deg, rgba(255, 0, 255, 0.14), rgba(7, 0, 17, 0.46), rgba(0, 255, 255, 0.08));
        }

        .three-official-player-transport button:hover,
        .three-official-player-edit-row button:hover,
        .three-official-player-list button:hover,
        .three-official-player-hide:hover {
          filter: brightness(1.24);
        }

        .three-official-hud {
          position: absolute;
          left: 18px;
          top: 18px;
          z-index: 4;
          display: grid;
          gap: 8px;
          width: min(560px, calc(100vw - 36px));
          padding: 14px;
          border: 1px solid rgba(0, 255, 255, 0.55);
          border-top: 2px solid #00ffff;
          background: rgba(14, 4, 34, 0.78);
          box-shadow: 0 0 32px rgba(0, 255, 255, 0.16);
        }

        .three-official-record-dot {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: rgba(120, 20, 32, 0.72);
          box-shadow: 0 0 0 rgba(255, 40, 64, 0);
          opacity: 0.42;
        }

        .three-official-record-dot.is-recording {
          background: #ff2038;
          opacity: 1;
          animation: threeOfficialRecordPulse 0.92s ease-in-out infinite;
          box-shadow:
            0 0 12px rgba(255, 32, 56, 0.9),
            0 0 28px rgba(255, 32, 56, 0.45);
        }

        @keyframes threeOfficialRecordPulse {
          0%,
          100% {
            transform: scale(0.86);
            opacity: 0.58;
          }

          45% {
            transform: scale(1.16);
            opacity: 1;
          }
        }

        .three-official-hud p,
        .three-official-hud h1 {
          margin: 0;
        }

        .three-official-hud h1 {
          color: #fff;
          font-family: "Orbitron", system-ui, sans-serif;
          font-size: 22px;
        }

        .three-official-hud p,
        .three-official-hud span {
          color: #9fefff;
          font-size: 12px;
        }

        .three-official-source-ui {
          position: fixed;
          left: -12000px;
          top: 24px;
          width: 1000px;
          height: 300px;
          overflow: visible;
          border: 0;
          background: transparent;
          box-shadow: none;
          color: #e0e0e0;
          isolation: isolate;
        }

        .three-official-arwes-popup-ui {
          position: fixed;
          left: -12000px;
          top: 360px;
          width: 620px;
          height: 220px;
          overflow: hidden;
          border: 1px solid rgba(255, 204, 102, 0.62);
          background:
            linear-gradient(118deg, rgba(255, 255, 255, 0.12), transparent 24%, rgba(255, 0, 255, 0.12)),
            linear-gradient(135deg, rgba(255, 153, 0, 0.24), rgba(18, 7, 44, 0.68) 46%, rgba(0, 255, 255, 0.16)),
            rgba(7, 0, 17, 0.66);
          box-shadow:
            0 0 34px rgba(255, 153, 0, 0.22),
            0 0 44px rgba(255, 0, 255, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            inset 0 0 24px rgba(0, 255, 255, 0.1);
          color: #e0e0e0;
          backdrop-filter: blur(10px);
          clip-path: polygon(18px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 22px), calc(100% - 22px) 100%, 10px 100%, 0 calc(100% - 12px), 0 18px);
          padding: 14px;
        }

        .three-official-arwes-popup-ui[data-open="false"] {
          opacity: 0.04;
          pointer-events: none;
        }

        .three-official-arwes-popup-inner {
          display: grid;
          gap: 12px;
          height: 100%;
        }

        .three-official-arwes-popup-chrome {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          border-bottom: 1px solid rgba(255, 204, 102, 0.42);
        }

        .three-official-arwes-popup-chrome span {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #ff00ff;
          box-shadow: 0 0 12px currentColor;
        }

        .three-official-arwes-popup-chrome span:nth-child(2) {
          background: #00ffff;
        }

        .three-official-arwes-popup-chrome strong {
          margin-right: auto;
          color: #ffcc66;
          font: 900 18px Orbitron, system-ui, sans-serif;
          text-shadow: 0 0 14px rgba(255, 204, 102, 0.55);
        }

        .three-official-arwes-popup-inner p {
          margin: 0;
          color: #9fefff;
          font-size: 14px;
          text-transform: uppercase;
        }

        .three-official-arwes-popup-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          align-items: center;
        }

        .three-official-arwes-popup-grid button,
        .three-official-arwes-popup-chrome button {
          min-height: 38px;
          border: 1px solid rgba(0, 255, 255, 0.54);
          background: rgba(7, 0, 17, 0.66);
          color: #fff;
          cursor: pointer;
          font: 900 13px "Share Tech Mono", monospace;
          box-shadow:
            0 0 16px rgba(0, 255, 255, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.16);
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-arwes-popup-grid span {
          color: #ffcc66;
          font: 900 13px "Share Tech Mono", monospace;
          text-align: center;
          text-transform: uppercase;
        }

        .three-official-panel-chrome {
          display: flex;
          gap: 10px;
          align-items: center;
          height: 38px;
          padding: 0 22px;
          border-bottom: 1px solid rgba(0, 255, 255, 0.4);
          background: rgba(0, 255, 255, 0.08);
        }

        .three-official-panel-chrome span {
          width: 11px;
          height: 11px;
          border-radius: 999px;
          background: #ff00ff;
          box-shadow: 0 0 12px currentColor;
        }

        .three-official-panel-chrome span:nth-child(2) {
          background: #00ffff;
        }

        .three-official-panel-chrome span:nth-child(3) {
          background: #ff9900;
        }

        .three-official-panel-chrome strong {
          margin-left: auto;
          color: #00ffff;
          font-size: 18px;
        }

        .three-official-panel-body {
          display: grid;
          grid-template-columns: 164px 316px 1fr;
          gap: 14px;
          align-items: center;
          height: 262px;
          padding: 12px 22px 16px;
        }

        .three-official-direct,
        .three-official-direct-grid,
        .three-official-modules,
        .three-official-workbench-stack,
        .three-official-workflow-button-grid {
          min-width: 0;
        }

        .three-official-direct p,
        .three-official-modules p,
        .three-official-workbench-stack p {
          margin: 0 0 9px;
          color: #00ffff;
          font-size: 13px;
          font-weight: 900;
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.72);
        }

        .three-official-orb {
          position: relative;
          display: grid;
          width: 134px;
          height: 124px;
          place-items: center;
          overflow: hidden;
          border: 3px solid #ff9900;
          border-radius: 999px;
          background:
            radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 46%),
            conic-gradient(from 40deg, #ff9900, #ff00ff, #00ffff, #ff9900);
          color: #fff;
          cursor: pointer;
          font: 900 28px Orbitron, system-ui, sans-serif;
          text-shadow: 0 0 14px #ff00ff;
          box-shadow:
            0 0 26px rgba(255, 0, 255, 0.52),
            inset 0 0 34px rgba(7, 0, 17, 0.9);
        }

        .three-official-orb-ring {
          position: absolute;
          inset: 18px;
          border: 10px solid transparent;
          border-left-color: rgba(0, 255, 255, 0.9);
          border-right-color: rgba(255, 0, 255, 0.82);
          border-radius: inherit;
          filter: drop-shadow(0 0 12px rgba(0, 255, 255, 0.72));
        }

        .three-official-orb strong {
          position: relative;
          z-index: 1;
        }

        .three-official-workflow-mini-status {
          display: grid;
          gap: 4px;
          width: 134px;
          margin-top: 10px;
          padding: 7px 9px;
          border: 1px solid rgba(255, 153, 0, 0.52);
          background: rgba(7, 0, 17, 0.7);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-workflow-mini-status span,
        .three-official-workflow-mini-status strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .three-official-workflow-mini-status span {
          color: #ff9900;
          font-size: 12px;
        }

        .three-official-workflow-mini-status strong {
          color: #e0e0e0;
          font-size: 11px;
        }

        .three-official-workbench-stack {
          display: grid;
          gap: 8px;
        }

        .three-official-direct-grid,
        .three-official-module-grid,
        .three-official-workflow-button-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .three-official-module-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
        }

        .three-official-workflow-button-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
        }

        .three-official-direct-grid button,
        .three-official-workflow-button-grid button,
        .three-official-module-grid button,
        .three-official-slider,
        .three-official-readout {
          border: 2px solid rgba(0, 255, 255, 0.7);
          background: rgba(7, 0, 17, 0.76);
          color: #e0e0e0;
          box-shadow:
            0 0 14px rgba(0, 255, 255, 0.22),
            inset 0 1px 0 rgba(255, 255, 255, 0.16);
        }

        .three-official-direct-grid button,
        .three-official-workflow-button-grid button,
        .three-official-module-grid button {
          min-height: 32px;
          cursor: pointer;
          font: 900 12px "Share Tech Mono", monospace;
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-module-grid button.active,
        .three-official-workflow-button-grid button.workflow-open {
          border-color: #ff9900;
          color: #fff;
          background: linear-gradient(135deg, rgba(255, 153, 0, 0.32), rgba(255, 0, 255, 0.2), rgba(0, 255, 255, 0.14));
          box-shadow:
            0 0 20px rgba(255, 153, 0, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }

        .three-official-direct-grid button:hover,
        .three-official-workflow-button-grid button:hover,
        .three-official-module-grid button:hover,
        .three-official-orb:hover {
          filter: brightness(1.25);
        }

        .three-official-modules {
          display: grid;
          gap: 8px;
        }

        .three-official-slider,
        .three-official-readout {
          display: grid;
          gap: 4px;
          padding: 6px 9px;
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-slider span,
        .three-official-readout span {
          color: #00ffff;
          font-size: 12px;
        }

        .three-official-slider input {
          width: 100%;
          accent-color: #ff00ff;
        }

        .three-official-readout {
          grid-template-columns: auto 1fr auto 1fr auto 1fr;
          align-items: center;
          font-size: 11px;
        }
    `}</style>
  );
}
