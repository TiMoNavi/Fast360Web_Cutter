from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], timeout: int = 120) -> None:
    subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=timeout)


def write_black_transition(
    before_path: Path,
    after_path: Path,
    output_path: Path,
    work_dir: Path,
    black_ms: int = 500,
    width: int = 1280,
    height: int = 720,
    fps: int = 30,
) -> None:
    work_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    black_path = work_dir / "black.mp4"
    list_path = work_dir / "concat.txt"
    black_seconds = max(black_ms / 1000, 0.05)

    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s={width}x{height}:r={fps}:d={black_seconds:.3f}",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            str(black_path),
        ]
    )

    lines = []
    for path in (before_path, black_path, after_path):
        escaped = path.as_posix().replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-vf",
            f"fps={fps},format=yuv420p",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-movflags",
            "+faststart",
            str(output_path),
        ],
        timeout=180,
    )


def main() -> None:
    work_dir = ROOT / "storage" / "tmp" / "unit-cases-black"
    write_black_transition(
        before_path=ROOT / "storage" / "tmp" / "unit-cases" / "05_skip_2s_4s_no_black" / "segment-000.mp4",
        after_path=ROOT / "storage" / "tmp" / "unit-cases" / "05_skip_2s_4s_no_black" / "segment-001.mp4",
        output_path=ROOT / "storage" / "exports" / "unit-cases" / "05_skip_2s_4s_with_black.mp4",
        work_dir=work_dir,
        black_ms=500,
    )
    print(ROOT / "storage" / "exports" / "unit-cases" / "05_skip_2s_4s_with_black.mp4")


if __name__ == "__main__":
    main()
