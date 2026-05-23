# Audio Tracks

## 目标

音乐轨道独立于 WebXR 取景点和视觉效果事件。第一版只做一个最简单、稳定的能力：

```text
用户上传音乐列表。
每个剪辑 session 选择一首音乐。
音乐从成片 output 0ms 开始播放。
音乐不跟随源视频时间轴跳剪，也不做分段对齐。
音乐长于成片时裁掉。
音乐短于成片时后面补静音。
```

这能满足 hackathon/demo 阶段的“有节拍、有完成感”，同时避免一开始就做复杂音频剪辑器。

## 后端接口

```text
GET  /api/music-tracks
POST /api/music-tracks/upload
GET  /api/music-tracks/:musicId/download

GET  /api/cut-sessions/:sessionId/music
PUT  /api/cut-sessions/:sessionId/music
```

上传支持：

```text
.mp3
.wav
.m4a
.aac
.ogg
.flac
```

文件保存位置：

```text
storage/music
```

SQLite 表：

```text
music_tracks
session_music
```

## SessionMusicConfig

```json
{
  "musicId": "music_123",
  "enabled": true,
  "startMs": 0,
  "gainDb": -10.0
}
```

字段约定：

```text
musicId
用户上传的音乐资产 ID。null 表示不选择音乐。

enabled
是否启用。musicId 为 null 时后端会视为 false。

startMs
第一版只支持 0。音乐总是对齐成片开头。

gainDb
导出混音音量，默认 -10dB，避免电子节拍盖住未来可能加入的人声/环境音。
```

## Timeline 表达

`ViewPathTimeline` 可以带 `audioTracks`：

```json
{
  "audioTracks": [
    {
      "trackId": "music_main",
      "kind": "music",
      "musicId": "music_123",
      "displayName": "Steady Electro Loop",
      "timeRef": "output",
      "startMs": 0,
      "playback": {
        "mode": "one_shot",
        "align": "output_start",
        "loop": false
      },
      "mix": {
        "gainDb": -10.0,
        "ducking": null
      },
      "source": {
        "filename": "steady-electro-loop.mp3",
        "durationMs": 180000
      },
      "enabled": true
    }
  ]
}
```

注意：

```text
audioTracks 使用 output 时间轴。
它不受 source editSegments 的跳过、快进、倒放影响。
它是成片层的音乐控制，不是 WebXR 采样点的一部分。
```

## render-test 行为

当前 `render-test` 先完成视频 remap 和视觉效果，再执行一次 FFmpeg mux：

```text
video-only render
        +
selected music track
        =
final mp4
```

第一版不做：

```text
多音乐轨
卡点自动剪辑
淡入淡出
ducking
loop
beat detection
按片段换音乐
```

这些后续可以扩展为 `audio.*` 事件或独立 `audioTracks` 参数。

## 音乐来源

项目不要内置商业歌曲或未授权素材。推荐三类来源：

```text
用户自己上传。
项目生成的 royalty-free 简单电子 loop。
明确授权的 CC0 / royalty-free 素材。
```

如果后续要做“经典、听不腻”的默认列表，建议以“风格预设”命名，而不是使用知名曲名：

```text
steady-electro-loop
soft-house-pulse
minimal-synth-drive
bright-chill-beat
dark-neon-runner
```
