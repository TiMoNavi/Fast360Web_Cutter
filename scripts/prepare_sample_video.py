from __future__ import annotations

import shutil
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references" / "github" / "three.js" / "examples" / "textures" / "pano.mp4"
TARGET_DIR = ROOT / "storage" / "sample-videos"
TARGET = TARGET_DIR / "pano.mp4"
DOWNLOAD_URL = "https://threejs.org/examples/textures/pano.mp4"


def main() -> None:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    if SOURCE.exists():
        shutil.copy2(SOURCE, TARGET)
        print(f"Copied sample video to {TARGET}")
        return

    print(f"Local sample missing, downloading {DOWNLOAD_URL}")
    urllib.request.urlretrieve(DOWNLOAD_URL, TARGET)
    print(f"Downloaded sample video to {TARGET}")


if __name__ == "__main__":
    main()
