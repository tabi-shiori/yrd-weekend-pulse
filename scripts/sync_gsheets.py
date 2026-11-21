#!/usr/bin/env python3
"""
YRD WEEKEND PULSE｜江浙沪周末活动雷达
Cloud Google Sheets 14-Tab Database Synchronizer
Spreadsheet ID: 1WQYrkrJcjza0XUQ9HEv1nsTJk1fj0v28Vk99AGJlfdw
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from db import (
    DB_PATH,
    GITHUB_PAGES_URL,
    MODULES_META,
    SNAPSHOT_PATH,
    SPREADSHEET_ID,
    SPREADSHEET_URL,
    export_snapshot,
)


def event_to_sheet_row(idx: int, ev: dict) -> list[str]:
    tags_str = ", ".join(ev.get("tags") or [])
    return [
        str(idx),
        ev.get("city", ""),
        ev.get("module_code", ""),
        ev.get("category_name", ""),
        ev.get("title", ""),
        ev.get("weekend_status", ""),
        ev.get("heat_label", f"🔥 {ev.get('heat_score', 88)}"),
        ev.get("time_display", ""),
        ev.get("start_date", ""),
        ev.get("end_date", ""),
        ev.get("district", ""),
        ev.get("venue", ""),
        ev.get("price", ""),
        ev.get("is_free", ""),
        ev.get("highlights", ""),
        ev.get("suzhou_transit", ""),
        tags_str,
        ev.get("source", ""),
        ev.get("verify_status", "已核实"),
        ev.get("url", ""),
    ]


def sync_google_sheets(full_sync: bool = False) -> int:
    snapshot = (
        json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
        if SNAPSHOT_PATH.exists()
        else export_snapshot(DB_PATH, SNAPSHOT_PATH)
    )
    stats = snapshot["stats"]
    city_map = {c["city"]: c["count"] for c in snapshot["cities"]}
    mod_map = {m["code"]: m["count"] for m in snapshot["modules"]}

    batch_ops = [
        {
            "op": "write",
            "range": "00_总览看板!B2",
            "data": [[snapshot["updated_at"]]],
        },
        {
            "op": "write",
            "range": "00_总览看板!F2",
            "data": [[GITHUB_PAGES_URL]],
        },
        {
            "op": "write",
            "range": "00_总览看板!B5:B7",
            "data": [
                [str(stats["total_events"])],
                [str(stats["active_weekend_events"])],
                [str(stats["free_events"])],
            ],
        },
        {
            "op": "write",
            "range": "00_总览看板!B12:B17",
            "data": [
                [str(city_map.get("苏州", 0))],
                [str(city_map.get("上海", 0))],
                [str(city_map.get("无锡", 0))],
                [str(city_map.get("常州", 0))],
                [str(city_map.get("杭州", 0))],
                [str(city_map.get("南京", 0))],
            ],
        },
        {
            "op": "write",
            "range": "00_总览看板!C20:C29",
            "data": [[str(mod_map.get(m["code"], 0))] for m in MODULES_META],
        },
    ]

    if full_sync:
        headers = [
            "序号", "城市", "模块代码", "所属类别", "活动名称",
            "本周末状态", "热度指数", "活动时间", "开始日期", "结束日期",
            "商圈/区县", "具体场馆", "票价/费用", "是否免费",
            "活动看点与阵容详情", "苏州出发高铁/地铁通勤指南",
            "细分标签", "信息来源", "核实状态", "官方直达/购票链接",
        ]
        all_events = snapshot["events"]
        master_rows = [headers] + [
            event_to_sheet_row(i, ev) for i, ev in enumerate(all_events, 1)
        ]
        batch_ops.append(
            {
                "op": "write",
                "range": "99_全量主数据库!A1",
                "data": master_rows,
            }
        )
        for m in MODULES_META:
            mod_events = [e for e in all_events if e.get("module_code") == m["code"]]
            mod_rows = [headers] + [
                event_to_sheet_row(i, ev) for i, ev in enumerate(mod_events, 1)
            ]
            batch_ops.append(
                {
                    "op": "write",
                    "range": f"{m['sheet_tab']}!A1",
                    "data": mod_rows,
                }
            )

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tf:
        json.dump(batch_ops, tf, ensure_ascii=False, indent=2)
        batch_file = tf.name

    try:
        res = subprocess.run(
            ["gsheets", "mutate", "batch", SPREADSHEET_ID, "-f", batch_file],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            print(f"[WARN] gsheets mutate batch exited {res.returncode}: {res.stderr.strip()}")
            return res.returncode
        print(
            f"[GSHEETS SYNC] Cloud Master DB synced ({len(batch_ops)} ranges updated) -> {SPREADSHEET_URL}"
        )
        return 0
    finally:
        Path(batch_file).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync YRD Weekend Pulse to Google Sheets")
    parser.add_argument("--full", action="store_true", help="Sync all 14 tabs in addition to overview")
    args = parser.parse_args()
    return sync_google_sheets(full_sync=args.full)


if __name__ == "__main__":
    sys.exit(main())
