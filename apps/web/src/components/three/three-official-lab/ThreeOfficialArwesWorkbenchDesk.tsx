"use client";

import { type Ref } from "react";
import { ArwesWorkbenchSurface } from "@/components/ArwesWorkbenchPlaneLab";
import type { ViewTargetPose } from "@/features/webxr/pc-editor/data/timeline-bridge";
import type { ThreeOfficialCropWorkflowStatus } from "./format";
import { ThreeOfficialArwesModulePopup } from "./ThreeOfficialArwesModulePopup";
import { ThreeOfficialWorkflowState } from "./ThreeOfficialWorkflowState";
import type { LabRecordingSample } from "./types";

type ThreeOfficialArwesWorkbenchDeskProps = {
  backendAcceptedPoints: number;
  backendStatus: string;
  cropExportDownloadUrl: string;
  cropWorkflowStatus: ThreeOfficialCropWorkflowStatus;
  deskRef: Ref<HTMLDivElement>;
  fov: number;
  locked: boolean;
  maskOpacity: number;
  openModule: string | null;
  playbackStatus: string;
  popupRef: Ref<HTMLDivElement>;
  recordingSamples: LabRecordingSample[];
  viewTarget: ViewTargetPose;
  workflowStateRef: Ref<HTMLDivElement>;
};

const WORKBENCH_MODULES = ["FRAME", "FOV", "FX", "WORKFLOW", "BGM", "EXPORT", "SESSION", "SAMPLER"] as const;

export function ThreeOfficialArwesWorkbenchDesk({
  backendAcceptedPoints,
  backendStatus,
  cropExportDownloadUrl,
  cropWorkflowStatus,
  deskRef,
  fov,
  locked,
  maskOpacity,
  openModule,
  playbackStatus,
  popupRef,
  recordingSamples,
  viewTarget,
  workflowStateRef
}: ThreeOfficialArwesWorkbenchDeskProps) {
  const latestRecordingSample = recordingSamples.at(-1);

  return (
    <>
      <div ref={deskRef} className="three-official-source-ui" data-testid="three-official-source-ui">
        <ArwesWorkbenchSurface
          cropWorkflowStatus={cropWorkflowStatus}
          fov={fov}
          locked={locked}
          maskOpacity={maskOpacity}
          modules={WORKBENCH_MODULES}
          openModule={openModule}
          playbackStatus={playbackStatus}
          recordingSamplesCount={recordingSamples.length}
          spatial
          viewTarget={viewTarget}
        />
      </div>

      <div
        ref={popupRef}
        className="three-official-arwes-popup-ui"
        data-open={openModule ? "true" : "false"}
        data-testid="three-official-arwes-popup-ui"
      >
        <ThreeOfficialArwesModulePopup fov={fov} openModule={openModule} />
      </div>

      <div ref={workflowStateRef} className="three-official-workflow-state">
        <ThreeOfficialWorkflowState
          backendAcceptedPoints={backendAcceptedPoints}
          backendStatus={backendStatus}
          cropExportDownloadUrl={cropExportDownloadUrl}
          cropWorkflowStatus={cropWorkflowStatus}
          latestRecordingSample={latestRecordingSample}
          recordingSamplesCount={recordingSamples.length}
        />
      </div>
    </>
  );
}
