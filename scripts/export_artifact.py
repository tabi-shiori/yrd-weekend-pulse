#!/usr/bin/env python3
"""
YRD WEEKEND PULSE｜江浙沪周末活动雷达
Single-File Self-Contained Awwwards HTML Artifact Bundler
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

WORKSPACE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = WORKSPACE_DIR / "web"
SNAPSHOT_PATH = WORKSPACE_DIR / "data" / "dashboard_snapshot.json"
DEFAULT_OUT = WORKSPACE_DIR / "dist" / "yrd_weekend_pulse_awwwards.html"


def build_single_file_html(out_path: Path = DEFAULT_OUT) -> Path:
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    css = (WEB_DIR / "styles.css").read_text(encoding="utf-8")
    js = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    snapshot_json = SNAPSHOT_PATH.read_text(encoding="utf-8")

    # Inline stylesheet
    html = html.replace(
        '<link rel="stylesheet" href="styles.css" />',
        f"<style>\n{css}\n</style>",
    ).replace(
        '<link rel="stylesheet" href="./styles.css" />',
        f"<style>\n{css}\n</style>",
    )

    # Inline preloaded snapshot + application JS
    inline_script = (
        f"<script>\nwindow.__YRD_PRELOADED_SNAPSHOT__ = {snapshot_json};\n</script>\n"
        f"<script>\n{js}\n</script>"
    )
    html = html.replace(
        '<script src="app.js"></script>',
        inline_script,
    ).replace(
        '<script src="./app.js"></script>',
        inline_script,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"[EXPORT ARTIFACT] Built self-contained Awwwards HTML ({out_path.stat().st_size:,} bytes) -> {out_path}")
    return out_path


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    build_single_file_html(target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
