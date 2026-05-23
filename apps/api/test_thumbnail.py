#!/usr/bin/env python
"""Test thumbnail generation with detailed error reporting."""
import sys
import subprocess
import shutil
from pathlib import Path

# Test video path
video_path = Path(r"D:\VR\WebXR\360videocutter\storage\videos\video_bcbea0b6142e40a5abd4fe748708e7b9.mp4")
video_id = "test_video"
output_dir = Path(r"D:\VR\WebXR\360videocutter\storage\thumbnails")
output_path = output_dir / f"{video_id}.jpg"

print(f"Video path: {video_path}")
print(f"Video exists: {video_path.is_file()}")
print(f"Output dir: {output_dir}")
print(f"Output path: {output_path}")
print()

# Check FFmpeg
ffmpeg_path = shutil.which("ffmpeg")
print(f"FFmpeg path: {ffmpeg_path}")
print()

# Test imports
try:
    import cv2
    import numpy as np
    from app.rendering.remap import build_equirect_to_flat_maps, probe_video_dimensions
    print("OK All imports successful")
except ImportError as e:
    print(f"ERROR Import error: {e}")
    sys.exit(1)

print()

# Probe video dimensions
try:
    width, height = probe_video_dimensions(video_path)
    print(f"Video dimensions: {width}x{height}")
except Exception as e:
    print(f"ERROR Failed to probe dimensions: {e}")
    sys.exit(1)

print()

# Test FFmpeg frame extraction
seek_seconds = 1.0
source_frame_bytes = width * height * 3

cmd = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel", "error",
    "-ss", f"{seek_seconds:.3f}",
    "-i", str(video_path),
    "-frames:v", "1",
    "-f", "rawvideo",
    "-pix_fmt", "bgr24",
    "pipe:1",
]

print(f"Running FFmpeg command...")
print(f"Expected frame bytes: {source_frame_bytes}")

try:
    result = subprocess.run(cmd, capture_output=True, check=True, timeout=30)
    print(f"OK FFmpeg succeeded")
    print(f"  Stdout bytes: {len(result.stdout)}")
    print(f"  Stderr: {result.stderr.decode('utf-8', errors='ignore')}")
except subprocess.SubprocessError as e:
    print(f"ERROR FFmpeg failed: {e}")
    if hasattr(e, 'stderr') and e.stderr:
        print(f"  Stderr: {e.stderr.decode('utf-8', errors='ignore')}")
    sys.exit(1)

print()

# Process frame
if len(result.stdout) < source_frame_bytes:
    print(f"ERROR Insufficient frame data: got {len(result.stdout)}, expected {source_frame_bytes}")
    sys.exit(1)

print("Processing frame with OpenCV...")
source_frame = np.frombuffer(result.stdout[:source_frame_bytes], dtype=np.uint8).reshape(
    (height, width, 3)
)

# Generate output maps
output_width, output_height = 640, 360
yaw, pitch, h_fov, v_fov = 0, 0, 100, 56.25

output_x = (np.arange(output_width, dtype=np.float32) + 0.5) / output_width * 2 - 1
output_y = 1 - (np.arange(output_height, dtype=np.float32) + 0.5) / output_height * 2
output_u, output_v = np.meshgrid(output_x, output_y)

map_x, map_y = build_equirect_to_flat_maps(
    width, height, output_u, output_v, yaw, pitch, h_fov, v_fov
)

thumbnail = cv2.remap(
    source_frame, map_x, map_y,
    interpolation=cv2.INTER_LINEAR,
    borderMode=cv2.BORDER_REPLICATE,
)

print(f"OK Frame remapped to {thumbnail.shape}")
print()

# Write thumbnail
print(f"Writing thumbnail to: {output_path}")
success = cv2.imwrite(str(output_path), thumbnail, [int(cv2.IMWRITE_JPEG_QUALITY), 88])

if success and output_path.is_file():
    print(f"OK Thumbnail created successfully!")
    print(f"  Size: {output_path.stat().st_size} bytes")
else:
    print(f"ERROR Failed to write thumbnail")
    sys.exit(1)
