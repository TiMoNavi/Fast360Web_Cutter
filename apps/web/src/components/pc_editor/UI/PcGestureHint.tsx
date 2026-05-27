"use client";

import type { PointerEventHandler } from "react";

type PcGestureHintProps = {
  edgePanActive: boolean;
  keyLabel: string;
  maskDragArmed: boolean;
  maskDragging: boolean;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
};

export function PcGestureHint({
  edgePanActive,
  keyLabel,
  maskDragArmed,
  maskDragging,
  onPointerCancel,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp
}: PcGestureHintProps) {
  return (
    <>
      <div
        className={maskDragArmed || maskDragging ? "xr-pc-mask-drag-layer active" : "xr-pc-mask-drag-layer"}
        data-testid="xr-pc-mask-drag-layer"
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span>
          {maskDragging
            ? edgePanActive
              ? "Edge follow: camera turns faster near the edge"
              : "Dragging crop mask"
            : `Hold ${keyLabel} and drag to bind mask + view`}
        </span>
      </div>
      <div className="xr-pc-gesture-hint" data-testid="xr-pc-gesture-hint">
        <span>{keyLabel} + drag binds mask/view</span>
        <span>{keyLabel} + Shift + click moves mask</span>
        <span>edge turns view faster</span>
      </div>
    </>
  );
}
