import type { Dispatch, SetStateAction } from "react";
import { clampRate, PC_EDITOR_RATE_DEFAULT, rateFromAdaptiveWheel } from "./rateCurve";

export type PcRecordingOperations = {
  adjustRecordingRateByWheel: (deltaY: number) => void;
  resetRecordingRate: () => void;
  setRecordingRate: (rate: number) => void;
};

export function createPcRecordingOperations({
  setRecordingRate
}: {
  setRecordingRate: Dispatch<SetStateAction<number>>;
}): PcRecordingOperations {
  const setRate = (rate: number) => {
    setRecordingRate(clampRate(rate));
  };

  return {
    adjustRecordingRateByWheel(deltaY) {
      setRecordingRate((rate) => rateFromAdaptiveWheel(rate, deltaY));
    },
    resetRecordingRate() {
      setRate(PC_EDITOR_RATE_DEFAULT);
    },
    setRecordingRate: setRate
  };
}
