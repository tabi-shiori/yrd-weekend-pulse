# YRD WEEKEND PULSE｜江浙沪周末活动雷达 · 24/7 云端文化策展中心

> **Awwwards SOTD Swiss Editorial Grid & Kinetic Cultural Magazine** — 以 **苏州（大本营）** 为圆心，覆盖 **上海（25m）· 无锡（18m）· 常州（40m）· 南京（75m）· 杭州（85m）** 的 1.5 小时高铁周末生活圈。

---

## 🌐 云端端点 (24/7 Cloud Endpoints)

| 端点类型 | 云端链接 | 说明 |
| :--- | :--- | :--- |
| **GitHub Pages 云端策展看板** | [`https://tabi-shiori.github.io/yrd-weekend-pulse/`](https://tabi-shiori.github.io/yrd-weekend-pulse/) | 24/7 Awwwards 级双主题瑞士网格 Web 看板（含 6 城高铁等时圈交互星图、检索合成器、周末行程单导出） |
| **Google Sheets 14 分表主数据库** | [`1WQYrkrJcjza0XUQ9HEv1nsTJk1fj0v28Vk99AGJlfdw`](https://docs.google.com/spreadsheets/d/1WQYrkrJcjza0XUQ9HEv1nsTJk1fj0v28Vk99AGJlfdw/edit) | 含 `00_云端导航与检索公式`、`00_总览看板`、`Modules A–J` 十大分类表、`88_6城宝藏场馆与渠道矩阵`、`99_全量主数据库` |
| **GitHub 代码仓库 & 6h Actions** | [`tabi-shiori/yrd-weekend-pulse`](https://github.com/tabi-shiori/yrd-weekend-pulse) | 每 6 小时自动巡检 (`0 */6 * * *`) + GitHub Pages 自动构建发布 |

---

## 🧭 十大全场景活动模块 (Modules A–J)

- **Module A · 明星与顶流现场**：体育场馆演唱会、音乐节主力阵容、明星见面会/签售、品牌代言人一日店长、明星领衔话剧/音乐剧
- **Module B · 网红潮流与限时快闪**：国际大牌/潮牌 Pop-up Store、网红一日店长、核心街区艺术打卡装置（仁恒仓街/十全街/张园/西岸/天目里/德基）
- **Module C · 小众文艺与先锋艺术**：美术馆画廊当代特展、独立书店新书沙龙、原版音乐剧与实验戏剧、交响乐/室内乐/现代舞
- **Module D · Livehouse与喜剧现场**：独立摇滚/爵士/电子/说唱巡演（山丘Hillhouse/瓦肆VAS/MAO/1701等）、单口喜剧/脱口秀开放麦
- **Module E · 主题市集与美食微醺节**：咖啡文化节、精酿啤酒节、面包甜品节、本色东西桥水上美学市集、独立艺术书展
- **Module F · 二次元与ACGN泛娱乐**：B站会员购6城漫展、单一IP同人Only展、谷子痛楼快闪（百联ZX/静安大悦城/星悦汇）、地下偶像 Idol Live
- **Module G · 户外探索与新生活方式**：环太湖/阳澄湖骑行、周末主题 Citywalk、宠物友好派对、市民艺术夜校体验课、非遗手作 Workshop
- **Module H · 江南在地文化与古镇夜游**：苏州园林夜游（拙政问雅/网师园）与天平山红枫季、厅堂版昆曲与平江路评弹、无锡拈花湾无人机烟花大秀
- **Module I · 大型商业展会与科技创客**：上海国家会展中心/新国际博览中心/苏州国际博览中心消费级大展（长三角文博会/潮玩展/宠物展）
- **Module J · 高端生活、运动赛事与亲子**：苏州河游船周末亲子魔幻剧场、黑珍珠/五星酒店主厨限时晚宴与秋蟹品鉴、马拉松赛事、博物馆奇妙夜

---

## ⚙️ 标准云端操作工作流

```bash
# 1. 执行 6 城并发实时采集与去重入库
python3 scripts/collector.py --mode all

# 2. 同步云端 Google Sheets 14 分表数据库
python3 scripts/sync_gsheets.py

# 3. 导出自包含单文件 Awwwards HTML 包
python3 scripts/export_artifact.py dist/yrd_weekend_pulse_awwwards.html
```
