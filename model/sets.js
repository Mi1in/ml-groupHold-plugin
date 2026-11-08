/**
 * 套装归类 / 组合标签
 *
 * 两个游戏对「套装」的用法不一样：
 *   · 原神：5 个部位，常见 4 件套，也有不少 2+2（两件套效果拼起来）。2+2 的组合名太啰嗦
 *     （「角斗士的终幕礼2 + 追忆之注连2」），所以按两件套效果归成「2攻+2攻」这种短标签，
 *     排列组合相同的一律合并统计。
 *   · 星铁：6 个部位 —— 外圈 4 件（隧洞遗器，id 1xx）+ 内圈 2 件（位面饰品，id 3xx），
 *     两者必须分开统计，不能混在一个榜里比。
 *
 * 数据来源：miao-plugin 的 resources/meta-<game>/artifact/data.json
 *   gs 取 skills["2"]（两件套效果描述）来归类
 *   sr 取 id 判断内圈 / 外圈
 */
import fs from "node:fs"
import path from "node:path"
import { miaoResDir } from "./miao.js"
import { gameConf } from "./game.js"

/** game -> Map<套装名, { id, skill2 }> */
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
    logger?.warn?.(`[ml-sgh-plugin] 读取 ${game} 套装表失败：${err?.message || err}`)
  }
  metaCache.set(game, map)
  return map
}

/**
 * 原神两件套效果 -> 单字标签
 * 顺序有意义：「元素战技造成的伤害」不能被后面的「造成的伤害」先吃掉
 */
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

/** 标签的固定排列顺序，保证「2生+2充」与「2充+2生」归成同一个标签 */
const TAG_ORDER = ["攻", "生", "防", "充", "精", "暴", "疗", "物", "火", "水", "冰", "雷", "风", "岩", "草", "普", "技", "爆", "落", "伤", "盾", "抗", "杂"]

const tagRank = (t) => {
  const i = TAG_ORDER.indexOf(t)
  return i < 0 ? TAG_ORDER.length : i
}

const tagCompare = (a, b) => tagRank(a) - tagRank(b)

/** 两件套效果描述 -> 标签（攻 / 生 / 充 / 冰 …），认不出来给「杂」 */
export function gsSetTag(desc = "") {
  const s = String(desc || "")
  if (!s) return "杂"
  const elem = /(火|水|冰|雷|风|岩|草)元素伤害加成/.exec(s)
  if (elem) return elem[1]
  for (const [re, tag] of GS_TAGS) if (re.test(s)) return tag
  return "杂"
}

/** 套装名 -> 标签（带缓存，避免每个持有者都查一遍文件） */
function gsTagOf(name) {
  return gsSetTag(setMeta("gs").get(name)?.skill2 || "")
}

/** 星铁套装归属：inner 内圈（位面饰品）/ outer 外圈（隧洞遗器）/ "" 未知 */
export function srRingOf(name = "") {
  const id = Number(setMeta("sr").get(name)?.id || 0)
  if (!id) return ""
  return id >= 300 ? "inner" : "outer"
}

const byCountThenName = (a, b) => (b.count || 0) - (a.count || 0) || String(a.name).localeCompare(String(b.name))

/** 套装短名：优先用 miao 给好的缩写（绝缘 / 角斗 / 风套 / 系囚） */
const shortOf = (item) => item.abbr || item.name || ""

/**
 * 原神套装标签
 *   单套        绝缘之旗印4  -> 「绝缘4」
 *   2+2         角斗士2+追忆2 -> 「2攻+2攻」（都是两件套攻击力，合并）
 *   认不出效果  回退成名字组合
 */
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
  // 有认不出的套装效果：老实写名字，别硬凑成「2杂」
  return { label: items.map((x) => `${shortOf(x)}${x.count || 2}`).join("+"), img: items[0].img || "" }
}

/**
 * 一个持有者的套装组合
 * @returns {Array<{ring:"all"|"outer"|"inner", label:string, img:string}>}
 */
export function comboRows(game = "gs", list = []) {
  const items = (list || []).filter((x) => x && x.name)
  if (game !== "sr") {
    // 原神：没有成套的也算「散件」，要占一行，否则各档占比加起来不足 100%
    const g = gsCombo(items)
    return [{ ring: "all", label: g.label, img: g.img }]
  }
  if (!items.length) return []
  const buckets = { outer: [], inner: [] }
  for (const item of items) {
    // 套装表里查不到（新套装、数据没更新）时归到外圈，宁可显示出来也别丢
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

/** 套装图标兜底（组合标签本身不是套装名，拼不出路径，只能给通用图标） */
export function iconFallback(game = "gs") {
  return gameConf(game).setIcon("散件")
}
