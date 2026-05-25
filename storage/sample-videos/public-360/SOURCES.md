# Public 360 Test Videos

Created for local validation on 2026-05-23. The compact clips in this folder
are intentionally kept in git so a fresh clone has representative 360-degree
test media. Larger 4K source samples stay ignored locally.

All final files were transcoded to small H.264 MP4 clips with no audio:

```sh
ffmpeg -ss <start> -i <source> -t <duration> -vf "scale=<size>,fps=24" -an -c:v libx264 -preset veryfast -crf 34 -pix_fmt yuv420p -movflags +faststart <output>
```

## Files

| Output | Layout | Source | License / attribution note | Source URL | Start |
| --- | --- | --- | --- | --- | --- |
| `valiant-overpass-mono-960x480-4s.mp4` | Mono equirectangular, 2:1 | Valiant360 demo clip | Valiant360 repository license: MIT, copyright Charlie Hoey | https://raw.githubusercontent.com/flimshaw/Valiant360/master/build/overpass-clip.mp4 | 0s |
| `elevr-relaxatron-mono-960x480-8s.mp4` | Mono equirectangular, 2:1 | eleVR Web Player demo video | eleVR Web Player repository license: MPL-2.0 | https://raw.githubusercontent.com/hawksley/eleVR-Web-Player/master/therelaxatron2.mp4 | 10s |
| `elevr-vidcon-mono-960x480-8s.mp4` | Mono equirectangular, 2:1 | eleVR Web Player demo video | eleVR Web Player repository license: MPL-2.0 | https://raw.githubusercontent.com/hawksley/eleVR-Web-Player/master/Vidcon.webm | 5s |
| `pannellum-jfk-mono-960x480-8s.mp4` | Mono equirectangular, 2:1 | Pannellum video example | Pannellum project license: MIT-style license in `COPYING`, copyright Matthew Petroff | https://pannellum.org/images/video/jfk.mp4 | 4s |
| `videojs-shark-mono-960x480-8s.mp4` | Mono equirectangular, 2:1 | videojs-panorama demo asset | videojs-panorama repository license: Apache-2.0, copyright yanwsh@gmail.com | https://raw.githubusercontent.com/yanwsh/videojs-panorama/master/assets/shark.mp4 | 20s |
| `elevr-vidcon5-stereo-tb-512x512-8s.mp4` | Stereo top-bottom 360, 1:1 | eleVR Web Player demo video | eleVR Web Player repository license: MPL-2.0 | https://raw.githubusercontent.com/hawksley/eleVR-Web-Player/master/Vidcon5.mp4 | 8s |

## Notes

- Wikimedia Commons `Category:360-degree videos` was checked first because its file pages expose clear license metadata, but direct `upload.wikimedia.org` downloads returned HTTP 429 from this environment. Those files are not included here.
- Raw downloads used during preparation were kept in `.tmp/public-360-sources/` when available; only the small converted MP4 files in this folder are intended for day-to-day tests.
- The `elevr-vidcon5-stereo-tb-512x512-8s.mp4` file is intentionally not 2:1. It is included as a compact top-bottom stereo edge case.
