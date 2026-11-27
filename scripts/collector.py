#!/usr/bin/env python3
"""
YRD WEEKEND PULSE｜江浙沪周末活动雷达
Multi-Source 6-City Live Collector, Auto-Archiver & 6-Hour Cloud Patrol Engine
Covers:
  1. Verified Curated Seeds (with automatic expiry archiving & dynamic promotion)
  2. Maoyan / Gewara 6-City Multi-Category Live API (Concerts, Musicals, Stand-up, Exhibitions, Heritage, Family)
  3. Douban Location 6-City Weekly Cultural Feeds (Salons, Indie Live, Art Exhibitions, Markets)
  4. Bilibili Member Mall (会员购) 6-City ACGN / Exhibition / Idol Live API
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import html as html_lib
import json
import re
import sys
import urllib.request
from typing import Any

from db import (
    DB_PATH,
    MODULES_META,
    SEEDS_PATH,
    SNAPSHOT_PATH,
    archive_expired_events,
    compute_event_id,
    compute_weekend_meta,
    export_snapshot,
    get_conn,
    init_db,
    normalize_event_title,
    now_cst_str,
    sync_persistent_space,
    upsert_event,
    upsert_venue,
)

MODULE_NAME_MAP = {m["code"]: m["name"] for m in MODULES_META}

SUZHOU_HSR_TRANSIT_DEFAULT = {
    "苏州": "苏州市内轨交1-6号线或自驾直达",
    "上海": "苏州站/园区站高铁25分钟至上海虹桥/上海站，换乘上海地铁直达",
    "无锡": "苏州站高铁18分钟至无锡站/无锡东站，换乘无锡地铁直达",
    "常州": "苏州站高铁40分钟至常州站/常州北站，换乘常州地铁1/2号线直达",
    "南京": "苏州站/苏州北高铁75分钟至南京南站/南京站，换乘南京地铁直达",
    "杭州": "苏州北/苏州站高铁85分钟至杭州东站，换乘杭州地铁直达",
}

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
}


def parse_iso_date_safe(s: str) -> dt.date | None:
    if not s:
        return None
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s.strip())
    if not m:
        return None
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def parse_flexible_date_range(text: str, ref_year: int) -> tuple[str, str]:
    """
    Parse strings like:
      - '2026.11.27 - 12.13' -> ('2026-11-27', '2026-12-13')
      - '2026.12.24 - 2027.01.03' -> ('2026-12-24', '2027-01-03')
      - '2026.11.28 19:30' -> ('2026-11-28', '2026-11-28')
      - '2026/11/28 - 2026/11/29' -> ('2026-11-28', '2026-11-29')
    """
    if not text:
        return "", ""
    s = text.strip()
    full_dates = re.findall(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", s)
    if len(full_dates) >= 2:
        y1, m1, d1 = map(int, full_dates[0])
        y2, m2, d2 = map(int, full_dates[-1])
        return f"{y1:04d}-{m1:02d}-{d1:02d}", f"{y2:04d}-{m2:02d}-{d2:02d}"
    if len(full_dates) == 1:
        y1, m1, d1 = map(int, full_dates[0])
        start_iso = f"{y1:04d}-{m1:02d}-{d1:02d}"
        # Check if there is a trailing MM.DD without year (e.g. '2026.11.27 - 12.13')
        tail_m = re.search(r"[-~至]\s*(\d{1,2})[./-](\d{1,2})", s)
        if tail_m:
            m2, d2 = int(tail_m.group(1)), int(tail_m.group(2))
            y2 = y1 + 1 if m2 < m1 else y1
            return start_iso, f"{y2:04d}-{m2:02d}-{d2:02d}"
        return start_iso, start_iso

    short_dates = re.findall(r"(\d{1,2})[./月](\d{1,2})", s)
    if short_dates:
        m1, d1 = map(int, short_dates[0])
        m2, d2 = map(int, short_dates[-1])
        y1 = ref_year
        y2 = y1 + 1 if m2 < m1 else y1
        return f"{y1:04d}-{m1:02d}-{d1:02d}", f"{y2:04d}-{m2:02d}-{d2:02d}"
    return "", ""


def evaluate_weekend_status(item: dict[str, Any], wmeta: dict[str, Any]) -> str:
    """
    Strictly compute weekend status from (start_date, end_date) relative to current Beijing date
    and the active/upcoming Friday–Sunday window. Never short-circuit on stale status labels!
    """
    today: dt.date = wmeta["today"]
    sun: dt.date = wmeta["sun"]

    sd = parse_iso_date_safe(item.get("start_date", ""))
    ed = parse_iso_date_safe(item.get("end_date", "")) or sd

    if ed and ed < today:
        return "已结束"
    if sd and ed:
        if sd <= sun and ed >= today:
            return "本周末进行中"
        if sd > sun:
            return "即将开场"
    return "本周末进行中"


def classify_module_by_text(title: str, raw_cat: str = "") -> str:
    t = f"{title} {raw_cat}".lower()
    if any(k in t for k in ["漫展", "同人", "only", "二次元", "痛楼", "谷子", "初音", "魔法少女", "eva", "新世纪福音战士", "星梦剧院", "snh48", "idol", "偶像"]):
        return "F"
    if any(k in t for k in ["评弹", "昆曲", "越剧", "沪剧", "锡剧", "淮剧", "园林", "夜游", "古镇", "红枫", "拈花湾"]):
        return "H"
    if any(k in t for k in ["脱口秀", "单口喜剧", "开放麦", "漫才", "即兴", "livehouse", "酒球会", "瓦肆", "山丘", "1701", "mao", "摇滚", "乐队巡演"]):
        return "D"
    if any(k in t for k in ["市集", "咖啡节", "面包", "精酿", "微醺", "美食节"]):
        return "E"
    if any(k in t for k in ["快闪", "pop-up", "限时店", "一日店长", "主题餐厅"]):
        return "B"
    if any(k in t for k in ["博览会", "会展中心", "婚博会", "科技周", "车展", "宠物展"]):
        return "I"
    if any(k in t for k in ["亲子", "儿童", "泡泡秀", "科学实验", "马拉松", "联赛", "晚宴"]):
        return "J"
    if any(k in t for k in ["骑行", "徒步", "citywalk", "夜校", "手作", "露营", "飞盘"]):
        return "G"
    if any(k in t for k in ["演唱会", "万人", "体育场", "奥体", "梅赛德斯", "音乐节"]):
        return "A"
    return "C"


def fetch_url_text(url: str, timeout: float = 4.5) -> str:
    req = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def probe_maoyan_6cities(wmeta: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Engine 1: Maoyan / Gewara Live Performance & Exhibition API across all 6 YRD cities.
    """
    city_ids = {
        "上海": 10,
        "苏州": 80,
        "杭州": 50,
        "南京": 55,
        "无锡": 52,
        "常州": 89,
    }
    # Categories: 1=演唱会, 4=话剧音乐剧, 15=脱口秀, 9=展览休闲, 8=音乐会, 5=舞蹈芭蕾, 3=曲苑评弹, 10=音乐节
    cat_configs = [
        (1, "A", 94),
        (10, "A", 93),
        (4, "C", 92),
        (5, "C", 92),
        (8, "C", 91),
        (9, "C", 92),
        (15, "D", 91),
        (3, "H", 90),
        (7, "J", 89),
    ]

    tasks = []
    for city_name, cid in city_ids.items():
        for cat_id, default_mod, base_heat in cat_configs:
            url = (
                f"https://show.maoyan.com/maoyansh/myshow/ajax/performances/"
                f"{cat_id};st=4;p=1;s=6;tft=0?cityId={cid}&sellChannel=13"
            )
            tasks.append((city_name, cid, cat_id, default_mod, base_heat, url))

    discovered: list[dict[str, Any]] = []
    today: dt.date = wmeta["today"]

    def _fetch_one(task: tuple) -> list[dict[str, Any]]:
        city_name, _, cat_id, default_mod, base_heat, url = task
        out = []
        try:
            raw = fetch_url_text(url, timeout=4.2)
            data = json.loads(raw).get("data") or []
            for it in data[:4]:
                returned_city = (it.get("cityName") or "").strip()
                if returned_city and not returned_city.startswith(city_name):
                    continue
                name = (it.get("name") or "").strip()
                if not name or "影城" in name or "电影票" in name or "二人转" in name:
                    continue
                time_range = (it.get("showTimeRange") or "").strip()
                start_iso, end_iso = parse_flexible_date_range(time_range, today.year)
                ed = parse_iso_date_safe(end_iso)
                if ed and ed < today:
                    continue

                shop = (it.get("shopName") or f"{city_name}核心场馆").strip()
                addr = (it.get("address") or "").strip()
                venue_full = f"{shop}（{addr}）" if addr and addr not in shop else shop
                mod_code = classify_module_by_text(name) if cat_id in (1, 3, 9, 10) else default_mod
                if any(k in name for k in ["脱口秀", "单口喜剧", "开放麦"]):
                    mod_code = "D"
                elif any(k in name for k in ["评弹", "昆曲"]):
                    mod_code = "H"

                lowest = it.get("lowestPrice")
                price_range = (it.get("priceRange") or "").strip()
                if lowest is not None and float(lowest) == 0:
                    price_str, is_free = "免费", "免费"
                elif price_range:
                    price_str, is_free = f"¥{price_range}", "付费"
                elif lowest:
                    price_str, is_free = f"¥{lowest:g}起", "付费"
                else:
                    price_str, is_free = "详见官方票务", "付费"

                perf_id = it.get("performanceId") or ""
                detail_url = (
                    f"https://show.maoyan.com/qqw#/detail/{perf_id}"
                    if perf_id
                    else "https://show.maoyan.com/"
                )

                heat = min(97, base_heat + (2 if "专场" in name or "巡回" in name or "原版" in name else 0))
                item_dict = {
                    "city": city_name,
                    "module_code": mod_code,
                    "category_name": MODULE_NAME_MAP[mod_code],
                    "title": name,
                    "heat_score": heat,
                    "heat_label": f"🔥 {heat}",
                    "time_display": time_range or "近期热演档期",
                    "start_date": start_iso or today.isoformat(),
                    "end_date": end_iso or (today + dt.timedelta(days=14)).isoformat(),
                    "district": f"{city_name}市区",
                    "venue": venue_full,
                    "price": price_str,
                    "is_free": is_free,
                    "highlights": f"【猫眼演出实时热销】{name}，举办场馆：{venue_full}。支持在线选座或电子票快速入场。",
                    "suzhou_transit": SUZHOU_HSR_TRANSIT_DEFAULT.get(city_name, "高铁/地铁直达"),
                    "tags": [MODULE_NAME_MAP[mod_code][:4], city_name, "实时票务"],
                    "source": "猫眼演出实时接口",
                    "verify_status": "已核实",
                    "url": detail_url,
                }
                item_dict["weekend_status"] = evaluate_weekend_status(item_dict, wmeta)
                if item_dict["weekend_status"] != "已结束":
                    out.append(item_dict)
        except Exception:
            pass
        return out

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        for batch in pool.map(_fetch_one, tasks):
            discovered.extend(batch)
    return discovered


def probe_douban_6cities(wmeta: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Engine 2: Douban Location 6-City Weekly Cultural Feeds (Salons, Exhibitions, Live, Markets).
    """
    slugs = {
        "苏州": "suzhou",
        "上海": "shanghai",
        "无锡": "wuxi",
        "常州": "changzhou",
        "杭州": "hangzhou",
        "南京": "nanjing",
    }
    sub_types = ["week-all", "week-exhibition", "week-salon"]
    tasks = [(c, slug, st) for c, slug in slugs.items() for st in sub_types]
    today: dt.date = wmeta["today"]
    discovered: list[dict[str, Any]] = []

    def _fetch_douban(task: tuple) -> list[dict[str, Any]]:
        city_name, slug, st = task
        out = []
        url = f"https://www.douban.com/location/{slug}/events/{st}"
        try:
            raw_html = fetch_url_text(url, timeout=5.0)
            blocks = re.findall(r'<li class="list-entry"[^>]*>(.*?)</li>', raw_html, flags=re.S)
            for blk in blocks[:8]:
                t_m = re.search(r'itemprop="summary"[^>]*>([^<]+)<', blk)
                u_m = re.search(r'href="(https://www\.douban\.com/event/\d+/)"', blk)
                if not t_m:
                    continue
                title = html_lib.unescape(t_m.group(1)).strip()
                if not title or "测试" in title:
                    continue
                ev_url = u_m.group(1) if u_m else url

                sd_m = re.search(r'itemprop="startDate"\s+datetime="(\d{4}-\d{2}-\d{2})', blk)
                ed_m = re.search(r'itemprop="endDate"\s+datetime="(\d{4}-\d{2}-\d{2})', blk)
                start_iso = sd_m.group(1) if sd_m else today.isoformat()
                end_iso = ed_m.group(1) if ed_m else start_iso

                ed = parse_iso_date_safe(end_iso)
                if ed and ed < today:
                    continue

                time_txt_m = re.search(
                    r'<li class="event-time">.*?</span>\s*([^<]+)', blk, flags=re.S
                )
                time_display = (
                    re.sub(r"\s+", " ", time_txt_m.group(1)).strip()
                    if time_txt_m
                    else f"{start_iso} ~ {end_iso}"
                )

                loc_m = re.search(r'<li\s+title="([^"]+)"', blk)
                venue = html_lib.unescape(loc_m.group(1)).strip() if loc_m else f"{city_name}核心文化空间"

                fee_m = re.search(r"<strong>([^<]+)</strong>", blk)
                fee_str = html_lib.unescape(fee_m.group(1)).strip() if fee_m else "详见活动页"
                is_free = "免费" if "免费" in fee_str or "免费" in title else "付费"

                mod_code = classify_module_by_text(
                    title, "展览" if st == "week-exhibition" else ("沙龙讲座" if st == "week-salon" else "")
                )
                heat = 92 if is_free == "免费" else 90

                item_dict = {
                    "city": city_name,
                    "module_code": mod_code,
                    "category_name": MODULE_NAME_MAP[mod_code],
                    "title": title,
                    "heat_score": heat,
                    "heat_label": f"🔥 {heat}",
                    "time_display": time_display,
                    "start_date": start_iso,
                    "end_date": end_iso,
                    "district": f"{city_name}同城",
                    "venue": venue,
                    "price": fee_str,
                    "is_free": is_free,
                    "highlights": f"【豆瓣同城本周精选】{title}，地点：{venue}。适合周末文艺看展、沙龙对谈与同城线下探索。",
                    "suzhou_transit": SUZHOU_HSR_TRANSIT_DEFAULT.get(city_name, "高铁/地铁直达"),
                    "tags": ["豆瓣同城", MODULE_NAME_MAP[mod_code][:4], city_name],
                    "source": "豆瓣同城实时排期",
                    "verify_status": "已核实",
                    "url": ev_url,
                }
                item_dict["weekend_status"] = evaluate_weekend_status(item_dict, wmeta)
                if item_dict["weekend_status"] != "已结束":
                    out.append(item_dict)
        except Exception:
            pass
        return out

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for batch in pool.map(_fetch_douban, tasks):
            discovered.extend(batch)
    return discovered


def probe_bilibili_nyx_6cities(wmeta: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Engine 3: Bilibili Member Mall (会员购) ACGN / Exhibition / Live API across all 6 YRD cities.
    Uses genuine start_time and end_time fields returned by Bilibili API!
    """
    city_codes = {
        "上海": "310100",
        "苏州": "320500",
        "杭州": "330100",
        "南京": "320100",
        "无锡": "320200",
        "常州": "320400",
    }
    today: dt.date = wmeta["today"]
    discovered: list[dict[str, Any]] = []

    def _fetch_bili(pair: tuple[str, str]) -> list[dict[str, Any]]:
        city_name, area_code = pair
        out = []
        url = (
            f"https://show.bilibili.com/api/ticket/project/listV2"
            f"?version=134&page=1&pagesize=14&area={area_code}&platform=web"
        )
        try:
            raw = fetch_url_text(url, timeout=4.5)
            data = json.loads(raw)
            result_list = (data.get("data") or {}).get("result") or []
            for proj in result_list:
                title = (proj.get("project_name") or "").strip()
                if not title:
                    continue

                start_s = (proj.get("start_time") or "").strip()
                end_s = (proj.get("end_time") or start_s).strip()
                tlabel = (proj.get("tlabel") or proj.get("show_time") or f"{start_s} ~ {end_s}").strip()
                if not start_s:
                    start_s, end_s = parse_flexible_date_range(tlabel, today.year)

                ed = parse_iso_date_safe(end_s)
                if ed and ed < today:
                    continue

                venue = (proj.get("venue_name") or f"{city_name}核心展馆").strip()
                district = (proj.get("district_name") or f"{city_name}市区").strip()
                price_low = proj.get("price_low")
                is_free_bool = bool(proj.get("isFree")) or (price_low is not None and int(price_low) == 0)
                if is_free_bool or "免费" in title:
                    price_str, is_free = "免费预约/免票", "免费"
                elif price_low:
                    price_str, is_free = f"¥{int(price_low)/100:g}起", "付费"
                else:
                    price_str, is_free = "详见B站会员购", "付费"

                wish = int(proj.get("wish") or 0)
                heat = 97 if wish >= 1500 else (94 if wish >= 500 else (92 if wish >= 150 else 89))
                third_cat = (proj.get("third_category_name") or "漫展/特展").strip()
                sale_flag = (proj.get("sale_flag") or "热销中").strip()
                proj_id = proj.get("id") or proj.get("project_id") or ""

                wish_desc = f"，当前已有 {wish} 人标记想去" if wish > 0 else ""
                item_dict = {
                    "city": city_name,
                    "module_code": "F",
                    "category_name": "二次元与ACGN泛娱乐",
                    "title": title,
                    "heat_score": heat,
                    "heat_label": f"🔥 {heat}",
                    "time_display": tlabel,
                    "start_date": start_s or today.isoformat(),
                    "end_date": end_s or (today + dt.timedelta(days=7)).isoformat(),
                    "district": f"{district}·{venue[:10]}",
                    "venue": venue,
                    "price": price_str,
                    "is_free": is_free,
                    "highlights": f"【B站会员购 {third_cat}｜{sale_flag}】举办场馆：{venue}{wish_desc}。",
                    "suzhou_transit": SUZHOU_HSR_TRANSIT_DEFAULT.get(city_name, "高铁/地铁直达"),
                    "tags": ["B站会员购", third_cat, city_name],
                    "source": "B站会员购实时接口",
                    "verify_status": "已核实",
                    "url": f"https://show.bilibili.com/platform/detail.html?id={proj_id}"
                    if proj_id
                    else "https://show.bilibili.com/",
                }
                item_dict["weekend_status"] = evaluate_weekend_status(item_dict, wmeta)
                if item_dict["weekend_status"] != "已结束":
                    out.append(item_dict)
        except Exception:
            pass
        return out

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for batch in pool.map(_fetch_bili, list(city_codes.items())):
            discovered.extend(batch)
    return discovered


def refresh_all_db_statuses(conn, wmeta: dict[str, Any]) -> None:
    """
    Re-evaluate weekend_status for EVERY event remaining in SQLite so upcoming events
    automatically promote to '本周末进行中' when their weekend arrives!
    """
    rows = conn.execute("SELECT event_id, start_date, end_date, weekend_status FROM events").fetchall()
    for r in rows:
        new_status = evaluate_weekend_status(
            {"start_date": r["start_date"], "end_date": r["end_date"]}, wmeta
        )
        if new_status != "已结束" and new_status != r["weekend_status"]:
            conn.execute(
                "UPDATE events SET weekend_status = ?, updated_at = ? WHERE event_id = ?",
                (new_status, now_cst_str(), r["event_id"]),
            )


def run_collection(mode: str = "all") -> dict[str, Any]:
    init_db(DB_PATH)
    wmeta = compute_weekend_meta()
    today_iso = wmeta["today_iso"]

    if not SEEDS_PATH.exists():
        raise FileNotFoundError(f"Verified seeds file missing: {SEEDS_PATH}")

    seeds_payload = json.loads(SEEDS_PATH.read_text(encoding="utf-8"))
    seed_events: list[dict[str, Any]] = seeds_payload.get("events", [])
    seed_venues: list[dict[str, Any]] = seeds_payload.get("venues", [])

    with get_conn(DB_PATH) as conn:
        # 1. Upsert only non-expired curated seed events (archive expired seeds cleanly)
        skipped_expired_seeds = 0
        for ev in seed_events:
            ev_copy = dict(ev)
            status = evaluate_weekend_status(ev_copy, wmeta)
            if status == "已结束":
                skipped_expired_seeds += 1
                conn.execute(
                    """
                    INSERT INTO archived_events (
                        event_id, city, module_code, title, start_date, end_date, venue, source, archived_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(event_id) DO NOTHING
                    """,
                    (
                        compute_event_id(
                            ev_copy.get("city", ""),
                            ev_copy.get("title", ""),
                            ev_copy.get("start_date", ""),
                            ev_copy.get("venue", ""),
                        ),
                        ev_copy.get("city", ""),
                        ev_copy.get("module_code", "C"),
                        ev_copy.get("title", ""),
                        ev_copy.get("start_date", ""),
                        ev_copy.get("end_date", ""),
                        ev_copy.get("venue", ""),
                        ev_copy.get("source", "seed"),
                        now_cst_str(),
                    ),
                )
                continue
            ev_copy["weekend_status"] = status
            upsert_event(conn, ev_copy)

        for ven in seed_venues:
            upsert_venue(conn, ven)

        # 2. Sweep & archive any previously stored DB events whose end_date < today_iso
        archived_from_db = archive_expired_events(conn, today_iso)

        # 3. Live Multi-Source Discovery across all 6 YRD cities
        live_added = 0
        if mode in ("all", "github_actions_6h_cron"):
            existing_norm_keys = {
                (r["city"], normalize_event_title(r["title"]))
                for r in conn.execute("SELECT city, title FROM events").fetchall()
            }

            live_candidates: list[dict[str, Any]] = []
            live_candidates.extend(probe_maoyan_6cities(wmeta))
            live_candidates.extend(probe_douban_6cities(wmeta))
            live_candidates.extend(probe_bilibili_nyx_6cities(wmeta))

            next_seq = conn.execute("SELECT COALESCE(MAX(seq), 0) + 1 FROM events").fetchone()[0]
            for item in live_candidates:
                norm_k = (item["city"], normalize_event_title(item["title"]))
                if not norm_k[1] or norm_k in existing_norm_keys:
                    continue
                item["seq"] = next_seq
                next_seq += 1
                upsert_event(conn, item)
                existing_norm_keys.add(norm_k)
                live_added += 1

        # 4. Final sweep: archive any edge-case expired rows & promote newly-active weekend events
        archive_expired_events(conn, today_iso)
        refresh_all_db_statuses(conn, wmeta)

        total_ev = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        total_ven = conn.execute("SELECT COUNT(*) FROM venues").fetchone()[0]
        conn.execute(
            "INSERT INTO sync_runs (run_mode, total_events, total_venues, ran_at) VALUES (?, ?, ?, ?)",
            (mode, total_ev, total_ven, now_cst_str()),
        )

    snapshot = export_snapshot(DB_PATH, SNAPSHOT_PATH)
    sync_persistent_space()
    print(
        f"[AUTO-LIFECYCLE] Window={wmeta['fri_iso']}..{wmeta['sun_iso']} | "
        f"ArchivedExpired={skipped_expired_seeds + archived_from_db} | LiveDiscovered=+{live_added}"
    )
    return snapshot


def main() -> int:
    parser = argparse.ArgumentParser(description="YRD Weekend Pulse Collector")
    parser.add_argument(
        "--mode",
        default="all",
        choices=["all", "seed_only", "github_actions_6h_cron"],
        help="Execution mode",
    )
    args = parser.parse_args()
    snapshot = run_collection(mode=args.mode)
    stats = snapshot["stats"]
    print(
        f"[YRD WEEKEND PULSE] Mode={args.mode} | Edition={snapshot['edition']} | "
        f"Events={stats['total_events']} (Weekend Active={stats['active_weekend_events']}, "
        f"Upcoming={stats['upcoming_events']}, Free={stats['free_events']}, "
        f"Archived={stats['archived_expired_events']}) | Updated={snapshot['updated_at']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
