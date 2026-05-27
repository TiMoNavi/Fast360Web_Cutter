export type AFrame360PlaybackState = {
  fov: number;
};

export type AFrame360VideoCommand = "zoom-in" | "zoom-out";

export type AFrame360VideoCommandPayload = Record<string, never>;
