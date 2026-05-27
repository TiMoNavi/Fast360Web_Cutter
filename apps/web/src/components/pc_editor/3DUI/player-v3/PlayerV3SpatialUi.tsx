"use client";

import { useCallback, useMemo, useState } from "react";
import { ArwesWorkbenchSpatialTable } from "../arwes-workbench-spatial";
import { HybridSkinPlayerBar } from "../hybrid-player";
import { SpatialPlaylistPopup } from "../playlist-popup";
import { SpatialEffectRingMenu, SpatialHoldRingMenuDemo } from "../ring-menu";
import type { PcEditorCommand } from "../commands";
import type { Spatial3DUiAction, SpatialPlayerState, SpatialVideoSource } from "../shared/Spatial3DUiPublicApi";

export type PlayerV3SpatialUiModel = SpatialPlayerState;

export type PlayerV3SpatialUiProps = {
  enabled?: boolean;
  model: PlayerV3SpatialUiModel;
  onCommand: (command: PcEditorCommand) => void;
  onSpatialAction?: (action: Spatial3DUiAction) => void;
  onSelectSource?: (source: SpatialVideoSource) => void;
  onPlaylistOpenChange?: (open: boolean) => void;
  playlistOpen?: boolean;
  playlistSwitchingEnabled?: boolean;
  showEffectRingMenu?: boolean;
  showRingMenuDemo?: boolean;
  showWorkbench?: boolean;
};

function useControllableBoolean({
  onChange,
  value
}: {
  onChange?: (nextValue: boolean) => void;
  value?: boolean;
}) {
  const [localValue, setLocalValue] = useState(false);
  const resolvedValue = value ?? localValue;

  const setResolvedValue = useCallback(
    (nextValue: boolean | ((currentValue: boolean) => boolean)) => {
      const resolvedNextValue = typeof nextValue === "function" ? nextValue(resolvedValue) : nextValue;

      if (value === undefined) {
        setLocalValue(resolvedNextValue);
      }
      onChange?.(resolvedNextValue);
    },
    [onChange, resolvedValue, value]
  );

  return [resolvedValue, setResolvedValue] as const;
}

export function PlayerV3SpatialUi({
  enabled = true,
  model,
  onCommand,
  onSpatialAction,
  onSelectSource,
  onPlaylistOpenChange,
  playlistOpen,
  playlistSwitchingEnabled = false,
  showEffectRingMenu = false,
  showRingMenuDemo = true,
  showWorkbench = true
}: PlayerV3SpatialUiProps) {
  const [resolvedPlaylistOpen, setResolvedPlaylistOpen] = useControllableBoolean({
    onChange: onPlaylistOpenChange,
    value: playlistOpen
  });

  const subtitle = useMemo(() => {
    const resolution = model.sourceResolution ?? "360 source";
    const maskOpacity = Math.round((model.maskOpacity ?? 0.7) * 100);
    const autoRender = model.autoRenderEnabled ? "on" : "off";

    return `${resolution} / mask ${maskOpacity}% / auto ${autoRender}`;
  }, [model.autoRenderEnabled, model.maskOpacity, model.sourceResolution]);

  const emitCommand = useCallback(
    (command: PcEditorCommand) => {
      if (command.type === "playlist.toggle") {
        setResolvedPlaylistOpen((value) => !value);
      } else if (command.type === "overlays.close") {
        setResolvedPlaylistOpen(false);
      }

      onCommand(command);
    },
    [onCommand, setResolvedPlaylistOpen]
  );

  if (!enabled) {
    return null;
  }

  return (
    <>
      {showWorkbench ? (
        <ArwesWorkbenchSpatialTable
          autoRenderEnabled={model.autoRenderEnabled}
          discardActive={model.discardActive}
          maskLocked={model.maskLocked}
          onCommand={emitCommand}
          recordingActive={model.recordingActive}
          renderExportId={model.renderExportId}
          renderStatus={model.renderStatus}
        />
      ) : null}
      <HybridSkinPlayerBar
        currentTimeMs={model.currentTimeMs}
        durationMs={model.durationMs}
        enabled
        effectSpeed={model.effectSpeed}
        isPlaying={model.isPlaying}
        onCommand={emitCommand}
        playbackRate={model.playbackRate}
        recordingActive={model.recordingActive}
        recordingRate={model.recordingRate}
        subtitle={subtitle}
        title={model.title}
      />
      <SpatialPlaylistPopup
        activeSourceId={model.activeSourceId}
        message={
          playlistSwitchingEnabled
            ? "Select a source from the spatial playlist."
            : "Visual playlist preview. Source switching is disabled in this pass."
        }
        onClose={() => setResolvedPlaylistOpen(false)}
        onSelectSource={playlistSwitchingEnabled ? onSelectSource : undefined}
        open={resolvedPlaylistOpen}
        sources={model.playlistSources}
      />
      {showEffectRingMenu ? (
        <SpatialEffectRingMenu
          categories={model.effectCategories ?? []}
          onAction={(action) => onSpatialAction?.(action)}
          visible={model.effectShortcutMode !== undefined && model.effectShortcutMode !== "hidden"}
        />
      ) : null}
      {showRingMenuDemo ? <SpatialHoldRingMenuDemo /> : null}
    </>
  );
}

export type AFrameSpatial3DUiProps = Omit<PlayerV3SpatialUiProps, "model" | "onCommand" | "onSelectSource"> & {
  model: SpatialPlayerState;
  onAction?: (action: Spatial3DUiAction) => void;
};

export function AFrameSpatial3DUi({ model, onAction, ...props }: AFrameSpatial3DUiProps) {
  const handleAction = useCallback(
    (action: PcEditorCommand) => {
      onAction?.(action);
    },
    [onAction]
  );

  return (
    <PlayerV3SpatialUi
      {...props}
      model={model}
      onCommand={handleAction}
      onSpatialAction={onAction}
      onSelectSource={(source) => onAction?.({ type: "player.source.select", source })}
      playlistSwitchingEnabled
    />
  );
}
