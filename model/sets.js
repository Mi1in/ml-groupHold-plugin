import fs from "node:fs"
import path from "node:path"
import { miaoResDir } from "./miao.js"
import { gameConf } from "./game.js"

const metaCache = new Map()

export function setMeta(game = "gs") {
  if (metaCache.has(game)) return metaCache.get(game)
  const map = new Map()
  try {
    const file = path.join(miaoResDir(), `meta-${game}`, "artifact", "data.json")
    const data = JSON.parse(fs.readFileSync(file, "utf8"))
    for (const v of Object.values(data || {})) {
      if (!v?.name) continue
      map.set(v.name, { id: String(v.id || ""), skill2: String(v?.skills?.["2"] || "") })
    }
  } catch (err) {
    logger?.warn?.(`[ml-groupHold-plugin] 读取 ${game} 套装表失败：${err?.message || err}`)
  }
  metaCache.set(game, map)
  return map
}

const GS_TAGS = [
  [/攻击力/, "攻"],
  [/生命值/, "生"],
  [/防御力/, "防"],
  [/元素充能效率/, "充"],
  [/元素精通/, "精"],
  [/暴击率/, "暴"],
  [/治疗/, "疗"],
  [/物理伤害/, "物"],
  [/普通攻击与重击/, "普"],
  [/元素战技/, "技"],
  [/元素爆发/, "爆"],
  [/下落攻击/, "落"],
  [/元素抗性/, "抗"],
  [/护盾强效/, "盾"],
  [/造成的伤害/, "伤"]
]

const TAG_ORDER = ["攻", "生", "防", "充", "精", "暴", "疗", "物", "火", "水", "冰", "雷", "风", "岩", "草", "普", "技", "爆", "落", "伤", "盾", "抗", "杂"]

const tagRank = (t) => {
  const i = TAG_ORDER.indexOf(t)
  return i < 0 ? TAG_ORDER.length : i
}

const tagCompare = (a, b) => tagRank(a) - tagRank(b)

export function gsSetTag(desc = "") {
  const s = String(desc || "")
  if (!s) return "杂"
  const elem = /(火|水|冰|雷|风|岩|草)元素伤害加成/.exec(s)
  if (elem) return elem[1]
  for (const [re, tag] of GS_TAGS) if (re.test(s)) return tag
  return "杂"
}

function gsTagOf(name) {
  return gsSetTag(setMeta("gs").get(name)?.skill2 || "")
}

export function srRingOf(name = "") {
  const id = Number(setMeta("sr").get(name)?.id || 0)
  if (!id) return ""
  return id >= 300 ? "inner" : "outer"
}

const byCountThenName = (a, b) => (b.count || 0) - (a.count || 0) || String(a.name).localeCompare(String(b.name))

const shortOf = (item) => item.abbr || item.name || ""

export function gsCombo(list = []) {
  const items = (list || []).filter((x) => x && x.name).sort(byCountThenName)
  if (!items.length) return { label: "散件", img: "" }
  if (items.length === 1) {
    return { label: `${shortOf(items[0])}${items[0].count || 2}`, img: items[0].img || "" }
  }
  const tags = items.map((x) => gsTagOf(x.name))
  if (tags.every((t) => t !== "杂")) {
    const ordered = [...tags].sort(tagCompare)
    return { label: ordered.map((t) => `2${t}`).join("+"), img: items[0].img || "" }
  }
  return { label: items.map((x) => `${shortOf(x)}${x.count || 2}`).join("+"), img: items[0].img || "" }
}

export function comboRows(game = "gs", list = []) {
  const items = (list || []).filter((x) => x && x.name)
  if (game !== "sr") {
    const g = gsCombo(items)
    return [{ ring: "all", label: g.label, img: g.img }]
  }
  if (!items.length) return []
  const buckets = { outer: [], inner: [] }
  for (const item of items) {
    const ring = srRingOf(item.name) === "inner" ? "inner" : "outer"
    buckets[ring].push(item)
  }
  const rows = []
  for (const ring of ["outer", "inner"]) {
    const part = buckets[ring]
    if (!part.length) continue
    part.sort(byCountThenName)
    rows.push({ ring, label: part.map((x) => `${shortOf(x)}${x.count || 2}`).join("+"), img: part[0].img || "" })
  }
  return rows
}

export function iconFallback(game = "gs") {
  return gameConf(game).setIcon("散件")
}
