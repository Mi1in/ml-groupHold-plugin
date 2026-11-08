/**
 * 游戏差异层
 *
 * 原神（gs）与星穹铁道（sr）在 miao-plugin 里的字段差异集中在这里：
 *   · 元素：gs 是英文 key（anemo/cryo…），sr 是中文（风/冰/量子…）
 *   · 武器：gs 是英文 key（sword/bow…），sr 是命途中文（毁灭/同谐…）
 *   · 套装：名称相同概念不同（圣遗物 / 遗器），图标路径规则也不同
 *          sr 的遗器还分内圈（位面饰品）/ 外圈（隧洞遗器），见 model/sets.js
 *   · 等级：gs 需分档（90 / 95 / 100），sr 都是 80 级不需要
 *
 * 统一后的产物：
 *   · 元素一律转成英文 key（char-hold.css / hold-rate.css 的 .elem-xxx 只需一套）
 *   · 武器/套装标签一律中文
 */
import fs from "node:fs"

/** 中文元素 -> 英文 key */
const ELEM_TO_KEY = {
  风: "anemo",
  岩: "geo",
  雷: "electro",
  草: "dendro",
  水: "hydro",
  火: "pyro",
  冰: "cryo",
  物理: "phys",
  量子: "quantum",
  虚数: "imaginary"
}

/** 英文 key -> 中文 */
const KEY_TO_ELEM = {
  anemo: "风",
  geo: "岩",
  electro: "雷",
  dendro: "草",
  hydro: "水",
  pyro: "火",
  cryo: "冰",
  phys: "物理",
  quantum: "量子",
  imaginary: "虚数"
}

/** 武器类型 / 命途 */
const WEAPON_CN = {
  sword: "单手剑",
  claymore: "双手剑",
  polearm: "长柄武器",
  bow: "弓",
  catalyst: "法器",
  毁灭: "毁灭",
  巡猎: "巡猎",
  智识: "智识",
  同谐: "同谐",
  虚无: "虚无",
  存护: "存护",
  丰饶: "丰饶",
  记忆: "记忆",
  欢愉: "欢愉"
}

export const GAMES = {
  gs: {
    key: "gs",
    mark: "#",
    name: "原神",
    /** 图标题用的名字 */
    title: "群成员角色持有率",
    consLabel: "命座",
    weaponLabel: "武器",
    relicLabel: "圣遗物",
    /** 套装图标（相对 miao resources） */
    setIcon: (name) => (name && name !== "散件" ? `meta-gs/artifact/imgs/${name}/1.webp` : "common/item/artifact-icon.webp")
  },
  sr: {
    key: "sr",
    mark: "*",
    name: "星穹铁道",
    title: "群成员角色持有率",
    consLabel: "星魂",
    weaponLabel: "光锥",
    relicLabel: "遗器",
    setIcon: (name) => (name && name !== "散件" ? `meta-sr/artifact/${name}/arti-1.webp` : "common/item/artifact-icon.webp")
  }
}

/**
 * 等级分档
 *
 * 只有原神需要：角色满级 90，但存在提升等级上限的道具（本服数据确有 95 / 100 级的面板），
 * 所以「90及以下 / 95 / 100」三档能看出成员练度。星铁角色几乎都卡在 80 级，分档没有意义，不做。
 */
export const LEVEL_BUCKETS = {
  gs: [
    { key: "le90", label: "90级及以下", short: "≤90", color: "#a9a49b", max: 90 },
    { key: "lv95", label: "95级", short: "95", color: "#7fa9d8", max: 99 },
    { key: "lv100", label: "100级", short: "100", color: "#d9a24f", max: Infinity }
  ]
}

/** 当前游戏是否统计等级分布 */
export function hasLevelDist(game = "gs") {
  return !!LEVEL_BUCKETS[game]
}

/** 等级分档定义（没有分档的游戏返回空数组） */
export function levelBuckets(game = "gs") {
  return LEVEL_BUCKETS[game] || []
}

/**
 * 等级分布计数
 * @param {Array} owners 持有者列表（需要 level 字段）
 * @param {string} game gs | sr
 * @returns {Array<{key,label,short,color,count}>}
 */
export function levelDist(owners = [], game = "gs") {
  const buckets = levelBuckets(game)
  if (!buckets.length) return []
  const rows = buckets.map((b) => ({ ...b, count: 0 }))
  for (const o of owners) {
    const lv = Number(o?.level) || 0
    const idx = buckets.findIndex((b) => lv <= b.max)
    rows[idx < 0 ? buckets.length - 1 : idx].count++
  }
  return rows
}

/** 命令前缀 -> game key（# 原神 / * 星铁） */
export function gameOf(mark = "#") {
  return String(mark).trim() === "*" ? "sr" : "gs"
}

/* ---------------- 旅行者（主角） ---------------- */

/**
 * 旅行者在面板数据里的角色 id
 *
 * miao 的角色表里旅行者是 id 20000000（elem = multi），但 PlayerData 里存的是
 * 空（10000005）/ 荧（10000007），name 也写成「空」「荧」，elem 则是「当前共鸣的元素」。
 * 所以统计时要按 id 认人、统一记成「旅行者」，别按名字认。
 */
export const TRAVELER_IDS = [10000005, 10000007]

/** 七元素（按解锁顺序排）：旅行者七元素分布用 */
export const TRAVELER_ELEMS = [
  { key: "anemo", name: "风", color: "#74c2a8" },
  { key: "geo", name: "岩", color: "#d3a15a" },
  { key: "electro", name: "雷", color: "#9d7fd0" },
  { key: "dendro", name: "草", color: "#8cb63f" },
  { key: "hydro", name: "水", color: "#4cb8e8" },
  { key: "pyro", name: "火", color: "#e8734b" },
  { key: "cryo", name: "冰", color: "#79c6dc" }
]

/** 是不是旅行者的名字（旅行者 / 主角 / 空 / 荧 / 爷 / 冰主 …） */
export function isTravelerName(name = "") {
  const s = normName(name)
  if (!s) return false
  return /旅行者|主角|^空$|^荧$|^爷$|^[风岩雷草水冰火]主$/.test(s)
}

/** 元素分布计数：按持有者各自面板里的 elem 归类（只有旅行者用得上） */
export function elemDist(owners = []) {
  const rows = TRAVELER_ELEMS.map((e) => ({ ...e, count: 0 }))
  const idx = new Map(rows.map((r, i) => [r.key, i]))
  for (const o of owners) {
    const i = idx.get(elemInfo(o?.elem).key)
    if (i !== undefined) rows[i].count++
  }
  return rows
}

/**
 * 前缀里可能出现的游戏词
 *
 * 关键：框架（lib/plugins/loader.js）在规则匹配之前就把 `*` 标准化成了 `#星铁`：
 *   srReg = /^#?(\*|星铁|星轨|穹轨|星穹|崩铁|星穹铁道|崩坏星穹铁道|铁道)+/
 *   if (srReg.test(e.msg)) { e.game = "sr"; e.msg = e.msg.replace(srReg, "#星铁") }
 * 所以用户发 `*昔涟持有率`，插件拿到的 e.msg 其实是 `#星铁昔涟持有率`。
 * 只按 `#` / `*` 判断游戏，就会去原神库里找「星铁昔涟」这个不存在的角色。
 */
const GAME_WORDS = [
  { game: "sr", re: /^(?:崩坏星穹铁道|崩坏星穹|星穹铁道|星穹|星轨|穹轨|崩铁|星铁|铁道)+/ },
  { game: "gs", re: /^(?:原神|genshin)+/i },
  { game: "zzz", re: /^(?:绝区零|绝区|zenless)+/i }
]

/**
 * 拆命令前缀：`#星铁昔涟持有率` -> { game:"sr", mark:"*", body:"昔涟持有率" }
 * 没有前缀也能拆（`星铁昔涟持有率` 同样认），拆不出游戏词就按 # / * 判断。
 * @returns {{ mark: string, game: string, body: string }}
 */
export function parsePrefix(msg = "") {
  const raw = String(msg || "").trim()
  const m = /^([#*])?\s*/.exec(raw)
  const mark = m?.[1] || ""
  let body = raw.slice(m?.[0]?.length || 0)
  let game = mark === "*" ? "sr" : "gs"
  for (const w of GAME_WORDS) {
    if (!w.re.test(body)) continue
    game = w.game
    body = body.replace(w.re, "").trim()
    break
  }
  return { mark: game === "sr" ? "*" : "#", game, body }
}

export function gameConf(game = "gs") {
  return GAMES[game] || GAMES.gs
}

/** 元素归一化：输入中文或英文 key，输出 { key, name } */
export function elemInfo(raw = "") {
  const s = String(raw || "").trim()
  if (!s) return { key: "multi", name: "无" }
  const key = ELEM_TO_KEY[s] || (KEY_TO_ELEM[s] ? s : "")
  if (!key) return { key: "multi", name: s || "无" }
  return { key, name: KEY_TO_ELEM[key] }
}

/** 武器/命途中文名 */
export function weaponName(raw = "") {
  const s = String(raw || "").trim()
  if (!s) return ""
  return WEAPON_CN[s] || s
}

/**
 * 头图图标候选：resolve 把相对路径解析成可直接用的 img src，查不到返回空串。
 * 全部候选都缺失时模板自动降级为文字标签——本仓库不内置任何第三方图片。
 */
const SR_ELEM_ICON_FILE = {
  火: "elem-fire.webp", 冰: "elm-ice.webp", 雷: "elem-elec.webp", 风: "elem-wind.webp",
  物理: "elem-phy.webp", 量子: "elem-auantum.webp", 虚数: "elem-imaginary.webp"
}
const SR_PATH_ICON_FILE = {
  毁灭: "type-毁灭.webp", 巡猎: "type-巡猎.webp", 智识: "type-智识.webp", 同谐: "type-同谐.webp",
  虚无: "type-虚无.webp", 存护: "type-存护.webp", 丰饶: "type-丰饶.webp",
  记忆: "type-记忆.webp", 欢愉: "type-欢愉.webp"
}
const GS_WEAPON_ICON = ["sword", "claymore", "polearm", "bow", "catalyst"]
const GS_ELEM_ICON_FILE = {
  火: "pyro", 水: "hydro", 冰: "cryo", 雷: "electro", 风: "anemo", 岩: "geo", 草: "dendro",
  pyro: "pyro", hydro: "hydro", cryo: "cryo", electro: "electro", anemo: "anemo", geo: "geo", dendro: "dendro"
}

/** @param {(p: string) => string} resolve 返回可渲染 URL，通常为 apps/hold.js 的 iconSrc */
export function heroIcons(rawElem = "", rawWeapon = "", game = "gs", resolve = () => "") {
  const raw = String(rawElem || "").trim()
  const w = String(rawWeapon || "").trim()
  const pick = (...ps) => {
    for (const p of ps) {
      const u = p ? resolve(p) : ""
      if (u) return u
    }
    return ""
  }
  if (game === "sr") {
    return {
      elemIcon: pick(`meta-sr/public/icons/${SR_ELEM_ICON_FILE[raw] || "elem-phy.webp"}`),
      typeIcon: pick(SR_PATH_ICON_FILE[w] ? `meta-sr/public/icons/${SR_PATH_ICON_FILE[w]}` : "")
    }
  }
  const ef = GS_ELEM_ICON_FILE[raw] || GS_ELEM_ICON_FILE[raw.toLowerCase()]
  return {
    // 优先本插件可选自备图标（不随仓库分发），其次 miao 资源，都没有就文字
    elemIcon: ef ? pick(`self:icons/elem-gs/${ef}.png`, `meta-gs/public/icons/elem-${ef}.webp`) : "",
    typeIcon: pick(GS_WEAPON_ICON.includes(w) ? `common/item/atk-${w}.webp` : "")
  }
}

/** 角色名归一化：去掉各类间隔符与空白（阮·梅 / 阮•梅 / 阮梅 视为同一人） */
export function normName(name = "") {
  return String(name || "").replace(/[·•・∙‧\u00B7\u2022\s]/g, "")
}

/** 中文数字（命座序号用） */
export const CN_NUM = ["零", "一", "二", "三", "四", "五", "六"]

const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 满: 6 }

/**
 * 命座/星魂序号：`二` / `2` / `两` / `满` -> 2 / 6，超范围返回 null
 * @param {string|number} raw
 * @returns {number|null}
 */
export function consNum(raw = "") {
  const s = String(raw ?? "").trim()
  if (!s) return null
  if (/^[0-6]$/.test(s)) return Number(s)
  const n = CN_DIGITS[s]
  return n === undefined ? null : n
}

/** 命座序号的展示名：6 用「满」（「满命 / 满魂」比「六命」更像人话） */
export function consLabelOf(n = 0) {
  return Number(n) >= 6 ? "满" : CN_NUM[Number(n)] || ""
}

/**
 * 挑头图
 *
 * 坑：星铁的 card / banner 是「通用星空占位图」（meta-sr/character/common/imgs/…），
 * 不是角色立绘，直接用会得到一张没有角色的背景。所以星铁优先用 splash 立绘。
 */
export function pickBanner(imgs = {}, game = "gs") {
  const common = (p) => !p || String(p).includes("/character/common/")
  if (game === "sr") {
    for (const p of [imgs.splash, imgs.preview]) if (!common(p)) return p
    return imgs.face || ""
  }
  for (const p of [imgs.card, imgs.banner, imgs.splash]) if (!common(p)) return p
  return imgs.face || ""
}

/* ---------------- 头图锚点 ---------------- */

/** 锚点兜底：gs 名片固定 36；sr 取立绘中线往上 1/3（50 - 50/3 ≈ 33） */
const ANCHOR_FALLBACK = { gs: 36, sr: 33 }

/** 已提示过「未标定」的角色，避免重复刷日志 */
const anchorWarned = new Set()

/** 从立绘路径取角色名：meta-sr/character/<角色>/imgs/splash.webp */
function srNameOf(img = "") {
  const m = /meta-sr\/character\/([^/]+)\/imgs\/splash[^/]*\.webp$/i.exec(String(img || ""))
  return m ? m[1] : ""
}

/** 星铁头图标定表（resources/sr-face.json，懒加载一次；值可为数字或 {a, z}） */
let faceTable = null
function faceTableOf() {
  if (faceTable) return faceTable
  try {
    faceTable = JSON.parse(fs.readFileSync(new URL("../resources/sr-face.json", import.meta.url), "utf8")) || {}
  } catch (err) {
    faceTable = {}
  }
  return faceTable
}

function faceEntryOf(img = "", charName = "") {
  const v = faceTableOf()[charName || srNameOf(img)]
  if (v === undefined || v === null) return null
  if (typeof v === "object") {
    const anchor = Number(v.a)
    const zoom = Number(v.z)
    if (!Number.isFinite(anchor)) return null
    return { anchor, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1 }
  }
  const anchor = Number(v)
  return Number.isFinite(anchor) ? { anchor, zoom: 1 } : null
}

/** 头图缩放：人物太小的立绘要放大一点，其余 1 */
export function artZoomOf(img = "", game = "gs", charName = "") {
  if (game !== "sr") return 1
  const e = faceEntryOf(img, charName)
  if (!e || !(e.zoom > 1)) return 1
  return Math.min(2.2, e.zoom)
}

/** 头图垂直锚点：把立绘里「头部」对齐到头图中线，其余由 CSS 裁掉 */
export function artAnchorOf(img = "", game = "gs", charName = "") {
  const fallback = ANCHOR_FALLBACK[game] ?? ANCHOR_FALLBACK.gs
  if (game !== "sr") return fallback
  const entry = faceEntryOf(img, charName)
  if (entry) return Math.min(90, Math.max(8, entry.anchor))
  const name = charName || srNameOf(img)
  if (name && !anchorWarned.has(name)) {
    anchorWarned.add(name)
    globalThis.logger?.debug?.(`[ml-sgh-plugin] 星铁角色「${name}」未标定头图锚点，暂用默认值 ${fallback}；` +
      `可在 resources/sr-face.json 里补一条 "角色名": 锚点值`)
  }
  return fallback
}
