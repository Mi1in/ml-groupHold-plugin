import fs from "node:fs"

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
    title: "群成员角色持有率",
    consLabel: "命座",
    weaponLabel: "武器",
    relicLabel: "圣遗物",
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

export const LEVEL_BUCKETS = {
  gs: [
    { key: "le90", label: "90级及以下", short: "≤90", color: "#a9a49b", max: 90 },
    { key: "lv95", label: "95级", short: "95", color: "#7fa9d8", max: 99 },
    { key: "lv100", label: "100级", short: "100", color: "#d9a24f", max: Infinity }
  ]
}

export function hasLevelDist(game = "gs") {
  return !!LEVEL_BUCKETS[game]
}

export function levelBuckets(game = "gs") {
  return LEVEL_BUCKETS[game] || []
}

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

export function gameOf(mark = "#") {
  return String(mark).trim() === "*" ? "sr" : "gs"
}

export const TRAVELER_IDS = [10000005, 10000007]

export const TRAVELER_ELEMS = [
  { key: "anemo", name: "风", color: "#74c2a8" },
  { key: "geo", name: "岩", color: "#d3a15a" },
  { key: "electro", name: "雷", color: "#9d7fd0" },
  { key: "dendro", name: "草", color: "#8cb63f" },
  { key: "hydro", name: "水", color: "#4cb8e8" },
  { key: "pyro", name: "火", color: "#e8734b" },
  { key: "cryo", name: "冰", color: "#79c6dc" }
]

export function isTravelerName(name = "") {
  const s = normName(name)
  if (!s) return false
  return /旅行者|主角|^空$|^荧$|^爷$|^[风岩雷草水冰火]主$/.test(s)
}

export function elemDist(owners = []) {
  const rows = TRAVELER_ELEMS.map((e) => ({ ...e, count: 0 }))
  const idx = new Map(rows.map((r, i) => [r.key, i]))
  for (const o of owners) {
    const i = idx.get(elemInfo(o?.elem).key)
    if (i !== undefined) rows[i].count++
  }
  return rows
}

const GAME_WORDS = [
  { game: "sr", re: /^(?:崩坏星穹铁道|崩坏星穹|星穹铁道|星穹|星轨|穹轨|崩铁|星铁|铁道)+/ },
  { game: "gs", re: /^(?:原神|genshin)+/i },
  { game: "zzz", re: /^(?:绝区零|绝区|zenless)+/i }
]

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

export function elemInfo(raw = "") {
  const s = String(raw || "").trim()
  if (!s) return { key: "multi", name: "无" }
  const key = ELEM_TO_KEY[s] || (KEY_TO_ELEM[s] ? s : "")
  if (!key) return { key: "multi", name: s || "无" }
  return { key, name: KEY_TO_ELEM[key] }
}

export function weaponName(raw = "") {
  const s = String(raw || "").trim()
  if (!s) return ""
  return WEAPON_CN[s] || s
}

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
    elemIcon: ef ? pick(`self:icons/elem-gs/${ef}.png`, `meta-gs/public/icons/elem-${ef}.webp`) : "",
    typeIcon: pick(GS_WEAPON_ICON.includes(w) ? `common/item/atk-${w}.webp` : "")
  }
}

export function normName(name = "") {
  return String(name || "").replace(/[·•・∙‧\u00B7\u2022\s]/g, "")
}

export const CN_NUM = ["零", "一", "二", "三", "四", "五", "六"]

const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 满: 6 }

export function consNum(raw = "") {
  const s = String(raw ?? "").trim()
  if (!s) return null
  if (/^[0-6]$/.test(s)) return Number(s)
  const n = CN_DIGITS[s]
  return n === undefined ? null : n
}

export function consLabelOf(n = 0) {
  return Number(n) >= 6 ? "满" : CN_NUM[Number(n)] || ""
}

export function pickBanner(imgs = {}, game = "gs") {
  const common = (p) => !p || String(p).includes("/character/common/")
  if (game === "sr") {
    for (const p of [imgs.splash, imgs.preview]) if (!common(p)) return p
    return imgs.face || ""
  }
  for (const p of [imgs.card, imgs.banner, imgs.splash]) if (!common(p)) return p
  return imgs.face || ""
}

const ANCHOR_FALLBACK = { gs: 36, sr: 33 }

const anchorWarned = new Set()

function srNameOf(img = "") {
  const m = /meta-sr\/character\/([^/]+)\/imgs\/splash[^/]*\.webp$/i.exec(String(img || ""))
  return m ? m[1] : ""
}

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

export function artZoomOf(img = "", game = "gs", charName = "") {
  if (game !== "sr") return 1
  const e = faceEntryOf(img, charName)
  if (!e || !(e.zoom > 1)) return 1
  return Math.min(2.2, e.zoom)
}

export function artAnchorOf(img = "", game = "gs", charName = "") {
  const fallback = ANCHOR_FALLBACK[game] ?? ANCHOR_FALLBACK.gs
  if (game !== "sr") return fallback
  const entry = faceEntryOf(img, charName)
  if (entry) return Math.min(90, Math.max(8, entry.anchor))
  const name = charName || srNameOf(img)
  if (name && !anchorWarned.has(name)) {
    anchorWarned.add(name)
    globalThis.logger?.debug?.(`[ml-groupHold-plugin] 星铁角色「${name}」未标定头图锚点，暂用默认值 ${fallback}；` +
      `可在 resources/sr-face.json 里补一条 "角色名": 锚点值`)
  }
  return fallback
}
