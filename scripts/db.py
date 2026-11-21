#!/usr/bin/env python3
"""
YRD WEEKEND PULSE｜江浙沪周末活动雷达
Core SQLite Database, Deduplication, HSR Isochrone Metadata & Snapshot Engine
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sqlite3
from pathlib import Path
from typing import Any

WORKSPACE_DIR = Path(__file__).resolve().parent.parent
PERSIST_DIR = Path(
    os.environ.get(
        "YRD_PERSIST_DIR",
        str(Path.home() / ".gemini" / "spaces" / "yrd-weekend-pulse"),
    )
)
DB_PATH = WORKSPACE_DIR / "data" / "events.db"
SEEDS_PATH = WORKSPACE_DIR / "data" / "verified_seeds.json"
SNAPSHOT_PATH = WORKSPACE_DIR / "data" / "dashboard_snapshot.json"
PERSIST_DB_PATH = PERSIST_DIR / "events.db"
CONFIG_PATH = PERSIST_DIR / "space_config.json"

SPREADSHEET_ID = "1WQYrkrJcjza0XUQ9HEv1nsTJk1fj0v28Vk99AGJlfdw"
SPREADSHEET_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit"
GITHUB_REPO = "tabi-shiori/yrd-weekend-pulse"
GITHUB_REPO_URL = f"https://github.com/{GITHUB_REPO}"
GITHUB_PAGES_URL = "https://tabi-shiori.github.io/yrd-weekend-pulse/"

CITIES_META: list[dict[str, Any]] = [
    {
        "city": "苏州",
        "en": "SUZHOU",
        "code": "SZH",
        "is_hub": True,
        "hsr_minutes": 0,
        "hsr_badge": "00 MIN · 大本营直达",
        "tagline": "大本营·本地直达",
        "transit_summary": "市内轨交1-6号线/自驾直达（含昆山/常熟/太仓/张家港）",
        "landmarks": "仁恒仓街 / 十全街 / 诚品生活 / 金鸡湖苏艺 / 狮山文化广场 / 本色美术馆 / 山丘Livehouse",
        "svg_x": 420,
        "svg_y": 230,
        "ring": 0,
    },
    {
        "city": "无锡",
        "en": "WUXI",
        "code": "WUX",
        "is_hub": False,
        "hsr_minutes": 18,
        "hsr_badge": "🚄 18 MIN · 苏州站直达",
        "tagline": "高铁18min·太湖禅意与演出",
        "transit_summary": "苏州站 🚄 15-22分钟直达无锡站/无锡东站",
        "landmarks": "南长街清名桥 / 拈花湾小镇 / 惠山古镇 / 无锡大剧院 / 运河汇 / 融创文旅城",
        "svg_x": 325,
        "svg_y": 175,
        "ring": 1,
    },
    {
        "city": "上海",
        "en": "SHANGHAI",
        "code": "SHA",
        "is_hub": False,
        "hsr_minutes": 25,
        "hsr_badge": "🚄 25 MIN · 顶流首发地",
        "tagline": "高铁25min·顶流首发地",
        "transit_summary": "苏州站/园区站 🚄 23-30分钟直达上海虹桥/上海站",
        "landmarks": "张园 / 西岸美术馆大道 / 安福路武康路 / 南京东路第一百货&百联ZX / 浦东美术馆 / 国家会展中心",
        "svg_x": 565,
        "svg_y": 240,
        "ring": 1,
    },
    {
        "city": "常州",
        "en": "CHANGZHOU",
        "code": "CZX",
        "is_hub": False,
        "hsr_minutes": 40,
        "hsr_badge": "🚄 40 MIN · 音乐节与乐园",
        "tagline": "高铁40min·音乐节与主题乐园",
        "transit_summary": "苏州站 🚄 38-48分钟直达常州站/常州北站",
        "landmarks": "太湖湾音乐节基地 / 文化广场 / 青果巷 / 中华恐龙园 / 常州大剧院 / 棉仓文创园",
        "svg_x": 245,
        "svg_y": 130,
        "ring": 2,
    },
    {
        "city": "南京",
        "en": "NANJING",
        "code": "NKG",
        "is_hub": False,
        "hsr_minutes": 75,
        "hsr_badge": "🚄 75 MIN · 六朝文博与摇滚",
        "tagline": "高铁1.2h·六朝文博与摇滚重镇",
        "transit_summary": "苏州站/苏州北 🚄 1小时05分-1小时20分直达南京南站/南京站",
        "landmarks": "德基广场(艺术博物馆) / 1701 Livehouse / 南京博物院 / 江苏大剧院 / 熙南里 / 钟山红枫银杏景区",
        "svg_x": 135,
        "svg_y": 85,
        "ring": 3,
    },
    {
        "city": "杭州",
        "en": "HANGZHOU",
        "code": "HGH",
        "is_hub": False,
        "hsr_minutes": 85,
        "hsr_badge": "🚄 85 MIN · 艺术聚落与山林",
        "tagline": "高铁1.5h·艺术聚落与江南山林",
        "transit_summary": "苏州北/苏州站 🚄 1小时20分-1小时35分直达杭州东站",
        "landmarks": "天目里 OōEli / 大屋顶良渚文化艺术中心 / 湖滨银泰in77 / 杭州大剧院 / 西湖灵隐 / 小河直街",
        "svg_x": 385,
        "svg_y": 390,
        "ring": 3,
    },
]

MODULES_META: list[dict[str, Any]] = [
    {
        "code": "A",
        "name": "明星与顶流现场",
        "en": "HEADLINERS & POP ARENAS",
        "sheet_tab": "A_明星与顶流现场",
        "desc": "体育场馆演唱会 / 音乐节主力阵容 / 明星见面会签售 / 品牌代言人一日店长 / 明星领衔戏剧",
        "best_window": "体育场演唱会提前30-60天抢票；品牌明星空降/一日店长通常在活动当周【周二至周四】官宣",
        "formula": "城市名 + (一日店长 OR 明星空降 OR 演唱会 OR 见面会) + 11月",
    },
    {
        "code": "B",
        "name": "网红潮流与限时快闪",
        "en": "AVANT POP-UPS & STREET DROPS",
        "sheet_tab": "B_网红潮流与限时快闪",
        "desc": "国际大牌与潮牌 Pop-up Store / 网红达人一日店长 / 核心街区打卡装置 / 联名主题咖啡厅",
        "best_window": "每周四晚或周五上午小红书按【最新】检索当周末新开快闪店",
        "formula": "城市名 + (仁恒仓街 OR 张园 OR 西岸 OR 天目里) + (快闪 OR 限时店 OR 一日店长)",
    },
    {
        "code": "C",
        "name": "小众文艺与先锋艺术",
        "en": "GALLERIES, SALONS & STAGE",
        "sheet_tab": "C_小众文艺与先锋艺术",
        "desc": "美术馆画廊当代特展 / 独立书店新书沙龙 / 原版音乐剧与实验戏剧 / 交响室内乐 / 艺术影展映后谈",
        "best_window": "每周三至周五查看周末排期；热门作家新书分享会需提前3-5天在书店公众号报名",
        "formula": "城市名 + (美术馆特展 OR 新书分享会 OR 音乐剧 OR 交响乐) + 本周末",
    },
    {
        "code": "D",
        "name": "Livehouse与喜剧现场",
        "en": "LIVEHOUSE & STAND-UP COMEDY",
        "sheet_tab": "D_Livehouse与喜剧现场",
        "desc": "独立摇滚/爵士/电子/说唱巡演 / 单口喜剧脱口秀 / 即兴喜剧 / 漫才专场与开放麦",
        "best_window": "巡演开票后至演出当天（开演前2小时秀动/大麦常有余票或现场票）",
        "formula": "城市名 + (Livehouse OR 山丘 OR 瓦肆 OR 1701 OR 脱口秀开放麦) + 本周末",
    },
    {
        "code": "E",
        "name": "主题市集与美食微醺节",
        "en": "ARTISAN MARKETS & BISTRO FESTS",
        "sheet_tab": "E_主题市集与美食微醺节",
        "desc": "咖啡文化节 / 精酿啤酒节 / 面包甜品节 / 本色东西桥水上美学市集 / 独立艺术书展",
        "best_window": "每周四、周五检索（市集多为周五至周日3天限时举办）",
        "formula": "城市名 + (咖啡节 OR 精酿节 OR 面包节 OR 本色市集 OR 周末市集) + 11月",
    },
    {
        "code": "F",
        "name": "二次元与ACGN泛娱乐",
        "en": "ACGN, DOUJIN ONLY & GUZI HUBS",
        "sheet_tab": "F_二次元与ACGN泛娱乐",
        "desc": "B站会员购6城漫展 / 单一IP同人Only展 / 谷子痛楼快闪 / 地下偶像 Idol Live / 电竞联赛主场",
        "best_window": "漫展与同人Only提前1-3周；主题谷子咖啡需提前在B站会员购或小程序预约时段",
        "formula": "城市名 + (漫展 OR 同人ONLY OR 痛楼 OR 谷子快闪 OR 地下偶像) + 11月",
    },
    {
        "code": "G",
        "name": "户外探索与新生活方式",
        "en": "OUTDOOR, CYCLING & CITYWALK",
        "sheet_tab": "G_户外探索与新生活方式",
        "desc": "环太湖阳澄湖骑行 / 周末主题 Citywalk / 宠物友好派对 / 市民夜校体验课 / 非遗手作沙龙",
        "best_window": "每周三至周五组局报名",
        "formula": "城市名 + (Citywalk OR 环湖骑行 OR 宠物派对 OR 市民夜校 OR 手作沙龙) + 周末",
    },
    {
        "code": "H",
        "name": "江南在地文化与古镇夜游",
        "en": "JIANGNAN HERITAGE & NIGHT GARDENS",
        "sheet_tab": "H_江南在地文化与古镇夜游",
        "desc": "苏州园林夜游与红枫菊花展 / 厅堂昆曲与平江路评弹 / 古镇无人机烟花秀 / 古刹秋日赏银杏",
        "best_window": "提前1-3天预约园林夜场门票（周末黄金时段易约满）",
        "formula": "苏州 OR 无锡 + (拙政问雅 OR 网师园夜游 OR 拈花湾无人机 OR 天平山红枫 OR 评弹昆曲)",
    },
    {
        "code": "I",
        "name": "大型商业展会与科技创客",
        "en": "MEGA EXPOS & TECH SUMMITS",
        "sheet_tab": "I_大型商业展会与科技创客",
        "desc": "国家会展中心/博览中心消费级大展(长三角文博会/车展/潮玩展/宠物展) / AI与科技创客沙龙",
        "best_window": "每月月初查看展馆排期；公众开放日通常需提前1天实名登记领票",
        "formula": "(国家会展中心 OR 新国际博览中心 OR 苏州国际博览中心) + 展会排期 + 11月",
    },
    {
        "code": "J",
        "name": "高端生活、运动赛事与亲子",
        "en": "GASTRONOMY, SPORTS & FAMILY",
        "sheet_tab": "J_高端生活与运动亲子",
        "desc": "黑珍珠/五星酒店主厨限时晚宴与秋蟹品鉴 / 马拉松与联赛主场 / 游船亲子魔幻剧场 / 博物馆奇妙夜",
        "best_window": "提前3-7天预订席位",
        "formula": "城市名 + (主厨晚宴 OR 亲子剧场 OR 马拉松 OR 博物馆奇妙夜) + 周末",
    },
]


def now_cst_str() -> str:
    tz = dt.timezone(dt.timedelta(hours=8))
    return dt.datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")


def normalize_event_title(title: str) -> str:
    t = re.sub(r"【[^】]*】|\[[^\]]*\]", "", title or "")
    return re.sub(r"[·\s\-—_《》【】()（）:：,，×x]", "", t.lower())


def compute_event_id(city: str, title: str, start_date: str = "", venue: str = "") -> str:
    norm_t = normalize_event_title(title)
    norm = re.sub(
        r"\s+",
        "",
        f"{city.strip()}::{norm_t}::{start_date.strip()}::{venue.strip().lower()[:12]}",
    )
    return "yrd_" + hashlib.sha1(norm.encode("utf-8")).hexdigest()[:12]


def find_existing_event_id(
    conn: sqlite3.Connection, city: str, title: str, start_date: str = "", venue: str = ""
) -> str | None:
    """Fuzzy deduplication across multi-source scrapes within the same city."""
    import difflib

    norm_new = normalize_event_title(title)
    if not norm_new:
        return None
    rows = conn.execute(
        "SELECT event_id, title, start_date, venue FROM events WHERE city = ?",
        (city.strip(),),
    ).fetchall()
    for r in rows:
        norm_old = normalize_event_title(r["title"])
        if norm_new == norm_old:
            # If exact same normalized title, only keep separate if start_date AND venue clearly differ
            if start_date and r["start_date"] and start_date != r["start_date"]:
                v_new = (venue or "").strip()[:6]
                v_old = (r["venue"] or "").strip()[:6]
                if v_new and v_old and v_new != v_old:
                    continue
            return r["event_id"]
        ratio = difflib.SequenceMatcher(None, norm_new, norm_old).ratio()
        if ratio >= 0.82:
            if not start_date or not r["start_date"] or start_date == r["start_date"]:
                return r["event_id"]
    return None


def get_conn(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path = DB_PATH) -> None:
    with get_conn(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                seq INTEGER,
                city TEXT NOT NULL,
                module_code TEXT NOT NULL,
                category_name TEXT NOT NULL,
                title TEXT NOT NULL,
                weekend_status TEXT NOT NULL,
                heat_label TEXT NOT NULL,
                heat_score INTEGER NOT NULL DEFAULT 88,
                time_display TEXT,
                start_date TEXT,
                end_date TEXT,
                district TEXT,
                venue TEXT,
                price TEXT,
                is_free TEXT,
                highlights TEXT,
                suzhou_transit TEXT,
                tags_json TEXT,
                source TEXT,
                verify_status TEXT,
                url TEXT,
                updated_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
            CREATE INDEX IF NOT EXISTS idx_events_module ON events(module_code);
            CREATE INDEX IF NOT EXISTS idx_events_heat ON events(heat_score DESC);

            CREATE TABLE IF NOT EXISTS venues (
                venue_id TEXT PRIMARY KEY,
                seq INTEGER,
                city TEXT NOT NULL,
                name TEXT NOT NULL,
                venue_type TEXT,
                frequent_modules TEXT,
                official_accounts TEXT,
                search_formula TEXT,
                search_url TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS sync_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_mode TEXT,
                total_events INTEGER,
                total_venues INTEGER,
                ran_at TEXT
            );
            """
        )


def upsert_event(conn: sqlite3.Connection, item: dict[str, Any]) -> str:
    city = item.get("city", "苏州").strip()
    title = item.get("title", "").strip()
    start_date = item.get("start_date", "").strip()
    venue = item.get("venue", "").strip()
    event_id = (
        item.get("event_id")
        or find_existing_event_id(conn, city, title, start_date, venue)
        or compute_event_id(city, title, start_date, venue)
    )
    heat_score = int(item.get("heat_score") or 88)
    heat_label = item.get("heat_label") or f"🔥 {heat_score}"
    tags = item.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]

    conn.execute(
        """
        INSERT INTO events (
            event_id, seq, city, module_code, category_name, title,
            weekend_status, heat_label, heat_score, time_display,
            start_date, end_date, district, venue, price, is_free,
            highlights, suzhou_transit, tags_json, source,
            verify_status, url, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(event_id) DO UPDATE SET
            seq = excluded.seq,
            city = excluded.city,
            module_code = excluded.module_code,
            category_name = excluded.category_name,
            title = excluded.title,
            weekend_status = excluded.weekend_status,
            heat_label = excluded.heat_label,
            heat_score = excluded.heat_score,
            time_display = excluded.time_display,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            district = excluded.district,
            venue = excluded.venue,
            price = excluded.price,
            is_free = excluded.is_free,
            highlights = excluded.highlights,
            suzhou_transit = excluded.suzhou_transit,
            tags_json = excluded.tags_json,
            source = excluded.source,
            verify_status = excluded.verify_status,
            url = excluded.url,
            updated_at = excluded.updated_at
        """,
        (
            event_id,
            int(item.get("seq") or 999),
            city,
            item.get("module_code", "C").strip(),
            item.get("category_name", "小众文艺与先锋艺术").strip(),
            title,
            item.get("weekend_status", "本周末进行中").strip(),
            heat_label,
            heat_score,
            item.get("time_display", "").strip(),
            item.get("start_date", "").strip(),
            item.get("end_date", "").strip(),
            item.get("district", "").strip(),
            item.get("venue", "").strip(),
            item.get("price", "").strip(),
            item.get("is_free", "付费").strip(),
            item.get("highlights", "").strip(),
            item.get("suzhou_transit", "").strip(),
            json.dumps(tags, ensure_ascii=False),
            item.get("source", "").strip(),
            item.get("verify_status", "已核实").strip(),
            item.get("url", "").strip(),
            now_cst_str(),
        ),
    )
    return event_id


def upsert_venue(conn: sqlite3.Connection, v: dict[str, Any]) -> str:
    city = v.get("city", "苏州").strip()
    name = v.get("name", "").strip()
    venue_id = "ven_" + hashlib.sha1(f"{city}::{name}".encode("utf-8")).hexdigest()[:10]
    conn.execute(
        """
        INSERT INTO venues (
            venue_id, seq, city, name, venue_type,
            frequent_modules, official_accounts, search_formula,
            search_url, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(venue_id) DO UPDATE SET
            seq = excluded.seq,
            city = excluded.city,
            name = excluded.name,
            venue_type = excluded.venue_type,
            frequent_modules = excluded.frequent_modules,
            official_accounts = excluded.official_accounts,
            search_formula = excluded.search_formula,
            search_url = excluded.search_url,
            updated_at = excluded.updated_at
        """,
        (
            venue_id,
            int(v.get("seq") or 99),
            city,
            name,
            v.get("venue_type", "").strip(),
            v.get("frequent_modules", "").strip(),
            v.get("official_accounts", "").strip(),
            v.get("search_formula", "").strip(),
            v.get("search_url", "").strip(),
            now_cst_str(),
        ),
    )
    return venue_id


def export_snapshot(db_path: Path = DB_PATH, snapshot_path: Path = SNAPSHOT_PATH) -> dict[str, Any]:
    with get_conn(db_path) as conn:
        event_rows = conn.execute(
            "SELECT * FROM events ORDER BY heat_score DESC, seq ASC"
        ).fetchall()
        venue_rows = conn.execute(
            "SELECT * FROM venues ORDER BY seq ASC"
        ).fetchall()

    events: list[dict[str, Any]] = []
    city_counts: dict[str, int] = {c["city"]: 0 for c in CITIES_META}
    module_counts: dict[str, int] = {m["code"]: 0 for m in MODULES_META}
    free_count = 0
    active_weekend_count = 0

    for row in event_rows:
        d = dict(row)
        d["tags"] = json.loads(d.pop("tags_json", "[]") or "[]")
        events.append(d)
        c = d["city"]
        city_counts[c] = city_counts.get(c, 0) + 1
        m = d["module_code"]
        module_counts[m] = module_counts.get(m, 0) + 1
        if "免费" in d.get("is_free", "") or "免费" in d.get("price", ""):
            free_count += 1
        if "本周末" in d.get("weekend_status", ""):
            active_weekend_count += 1

    venues = [dict(r) for r in venue_rows]

    cities_summary = []
    for c_meta in CITIES_META:
        c_copy = dict(c_meta)
        c_copy["count"] = city_counts.get(c_meta["city"], 0)
        cities_summary.append(c_copy)

    modules_summary = []
    for m_meta in MODULES_META:
        m_copy = dict(m_meta)
        m_copy["count"] = module_counts.get(m_meta["code"], 0)
        modules_summary.append(m_copy)

    search_formulas = []
    if SEEDS_PATH.exists():
        try:
            seeds = json.loads(SEEDS_PATH.read_text(encoding="utf-8"))
            search_formulas = seeds.get("search_formulas", [])
        except Exception:
            pass

    snapshot = {
        "project": "YRD WEEKEND PULSE｜江浙沪周末活动雷达",
        "edition": "ISSUE 2026.47 · SUZHOU 1.5H HSR ISOCHRONE",
        "updated_at": now_cst_str(),
        "window_label": "2026.11.20 (周五) — 11.22 (周日) 及近期跨周档期",
        "cloud_endpoints": {
            "spreadsheet_id": SPREADSHEET_ID,
            "spreadsheet_url": SPREADSHEET_URL,
            "github_repo": GITHUB_REPO,
            "github_repo_url": GITHUB_REPO_URL,
            "github_pages_url": GITHUB_PAGES_URL,
            "actions_cron": "Every 6 Hours (0 */6 * * *)",
        },
        "stats": {
            "total_events": len(events),
            "active_weekend_events": active_weekend_count,
            "free_events": free_count,
            "total_cities": len(CITIES_META),
            "total_modules": len(MODULES_META),
            "total_venues": len(venues),
        },
        "cities": cities_summary,
        "modules": modules_summary,
        "venues": venues,
        "search_formulas": search_formulas,
        "events": events,
    }

    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return snapshot


def sync_persistent_space() -> None:
    """Safely synchronize DB and config to ~/.gemini/spaces/yrd-weekend-pulse using shutil.copyfile."""
    PERSIST_DIR.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        shutil.copyfile(str(DB_PATH), str(PERSIST_DB_PATH))

    config = {
        "space_name": "yrd-weekend-pulse",
        "title": "YRD WEEKEND PULSE｜江浙沪周末活动雷达",
        "spreadsheet_id": SPREADSHEET_ID,
        "spreadsheet_url": SPREADSHEET_URL,
        "github_repo": GITHUB_REPO,
        "github_pages_url": GITHUB_PAGES_URL,
        "last_synced_at": now_cst_str(),
    }
    CONFIG_PATH.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
