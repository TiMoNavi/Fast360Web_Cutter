import type { LabRecordingSample } from "./types";
import type { ThreeOfficialCropWorkflowStatus } from "./format";
import { cropWorkflowLabel } from "./format";

type ThreeOfficialWorkflowStateProps = {
  backendAcceptedPoints: number;
  backendStatus: string;
  cropExportDownloadUrl: string;
  cropWorkflowStatus: ThreeOfficialCropWorkflowStatus;
  latestRecordingSample: LabRecordingSample | undefined;
  recordingSamplesCount: number;
};

export function ThreeOfficialWorkflowState({
  backendAcceptedPoints,
  backendStatus,
  cropExportDownloadUrl,
  cropWorkflowStatus,
  latestRecordingSample,
  recordingSamplesCount
}: ThreeOfficialWorkflowStateProps) {
  return (
    <>
      <button data-testid="three-official-start-crop" data-workflow-action="startCrop" type="button">
        START CROP
      </button>
      <button data-testid="three-official-end-crop" data-workflow-action="endCrop" type="button">
        END CROP
      </button>
      <button data-testid="three-official-render-crop" data-workflow-action="renderCrop" type="button">
        RENDER
      </button>
      <span data-testid="three-official-coordinate-audit">
        {latestRecordingSample
          ? `#${latestRecordingSample.seq} t=${latestRecordingSample.tMs} yaw=${latestRecordingSample.yaw} pitch=${latestRecordingSample.pitch} h=${latestRecordingSample.fovH} v=${latestRecordingSample.fovV}`
          : "no samples yet"}
      </span>
      <span data-testid="three-official-backend-bridge">
        BACKEND {backendStatus} accepted {backendAcceptedPoints}
      </span>
      <a data-testid="three-official-export-download" href={cropExportDownloadUrl}>
        Download preview
      </a>
      <span data-testid="three-official-workflow-layer-status">
        {cropWorkflowLabel(cropWorkflowStatus)} / samples {recordingSamplesCount}
      </span>
    </>
  );
}
