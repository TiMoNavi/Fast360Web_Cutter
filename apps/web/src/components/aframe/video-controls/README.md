# A-Frame 360 Video Playback Controls

This folder owns non-visual playback control events for the A-Frame 360 video player.

## Current Commands

- `play`: start the current source.
- `pause`: pause the current source.
- `toggle-play`: play if paused, pause if playing.
- `zoom-in`: reduce camera FOV. In a 360 videosphere, moving the sphere radius does not behave like normal video distance because the viewer is at the sphere center.
- `zoom-out`: increase camera FOV.
- `next`: move to the next source in the video list.
- `previous`: move to the previous source in the video list.
- `reload-list`: fetch the video list again.

## Source List

The first backend endpoint is:

```text
GET /api/xr/video-sources
```

It currently returns the local MP4 sample and generated HLS sample stream.

## Temporary Input Bindings

Keyboard placeholders:

- `Space` / `K`: toggle play
- `P`: play
- `O`: pause
- `+`: zoom in
- `-`: zoom out
- `N` / `ArrowRight`: next
- `B` / `ArrowLeft`: previous
- `L`: reload list

Controller placeholders:

- `triggerdown`: toggle play
- `abuttondown`: next
- `bbuttondown`: previous
- `thumbstickup`: zoom in
- `thumbstickdown`: zoom out

These controller names are placeholders until we verify the exact Quest controller events in A-Frame on device.
