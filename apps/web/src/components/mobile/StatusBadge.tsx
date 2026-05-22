import { statusLabel } from "./format";

type StatusBadgeProps = {
  status?: string | null;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const tone =
    status === "failed"
      ? "danger"
      : status === "ready" || status === "export_ready" || status === "done" || status === "ready_for_xr"
        ? "success"
        : status === "dirty" || status === "rendering" || status === "cutting"
          ? "warning"
          : "neutral";

  return <span className={`mobile-status ${tone}`}>{statusLabel(status)}</span>;
}
