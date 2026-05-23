#!/usr/bin/env python
"""Regenerate thumbnails for all videos in the database."""
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.storage import connect, ensure_video_thumbnail

def main():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM videos ORDER BY created_at DESC").fetchall()

        print(f"Found {len(rows)} videos")
        print()

        success_count = 0
        fail_count = 0

        for row in rows:
            video_id = row["id"]
            filename = row["original_filename"]

            print(f"Processing: {video_id[:20]} | {filename[:40]}")

            try:
                thumbnail_filename = ensure_video_thumbnail(conn, row)
                if thumbnail_filename:
                    print(f"  OK: {thumbnail_filename}")
                    success_count += 1
                else:
                    print(f"  FAILED: No thumbnail generated")
                    fail_count += 1
            except Exception as e:
                print(f"  ERROR: {e}")
                fail_count += 1

            print()

        print(f"Summary:")
        print(f"  Success: {success_count}")
        print(f"  Failed: {fail_count}")

if __name__ == "__main__":
    main()
