import fs from "node:fs"
import path from "node:path"
import { loadMiao, hasMiao, miaoResDir, selfResDir, toFileUrl } from "../model/miao.js"
import { collectGroup, collectChar } from "../model/collect.js"
import { buildOverview, buildDetail } from "../model/stat.js"
import { renderTpl } from "../model/render.js"
import { maskId } from "../model/format.js"
import { credit } from "../model/credit.js"
import { helpData } from "../model/help.js"
import { updatePlugin, updateReply } from "../model/update.js"
import { gameConf, normName, pickBanner, parsePrefix, consNum, TRAVELER_ELEMS, artAnchorOf, artZoomOf, heroIcons } from "../model/game.js"

const TIP_NO_MIAO = "本插件依赖 miao-plugin 的角色数据，请先安装/启用 miao-plugin 后再试~"

const GAME_WORD_ANY = "(?:崩坏星穹铁道|崩坏星穹|星穹铁道|星穹|星轨|穹轨|崩铁|星铁|铁道|原神|genshin)"
const GAME_WORD = `${GAME_WORD_ANY}?`

const CONS_DIGIT = "[0-6零一二两三四五六满]"
const CONS_ANY = "[0-9零一二两三四五六七八九十满]\\s*[命魂]"
const STAR_WORD = "(五星|5星|四星|4星|五|四)"

const CMD_OVERVIEW = new RegExp(
  `^([#*])\\s*${GAME_WORD}\\s*(?:群\\s*)?(?:(` +
    CONS_DIGIT +
    `)\\s*[命魂]\\s*)?(?:全部(?:角色)?持有率|` +
    STAR_WORD +
    `?\\s*角色持有率)\\s*$`
)
const CMD_ALL_ROLE = /^[#*]\s*(?:群\s*)?全部(?:角色)?持有率\s*$/
const CMD_STAR_ROLE = /^[#*]\s*(?:群\s*)?(五星|5星|四星|4星|五|四)?\s*角色持有率\s*$/
const CMD_CHAR = new RegExp(
  `^([#*])\\s*${GAME_WORD}\\s*(?:群\\s*)?((?!群)(?!${GAME_WORD_ANY})(?!${CONS_ANY})[\\u4e00-\\u9fa5·•・A-Za-z0-9.&]{1,12})\\s*持有率\\s*$`
)

const STAR_MAP = { 全部角色: 0, 全部: 0, 五星: 5, "5星": 5, 五: 5, 四星: 4, "4星": 4, 四: 4 }

const CMD_HELP = /^[#*]\s*(?:群\s*)?持有率(?:插件)?帮助\s*$/
const CMD_UPDATE = /^[#*]\s*(?:群\s*)?持有率(?:插件)?更新\s*$/

const DEFAULT_STAR = 5

const NOT_CHAR_NAME = /^(?:全部|全部角色|角色|五星角色|四星角色|五星|四星|五|四|5星角色|4星角色)$/

const nameIndexCache = new Map()

function metaNameIndex(game) {
  if (nameIndexCache.has(game)) return nameIndexCache.get(game)
  const map = new Map()
  try {
    const file = path.join(miaoResDir(), `meta-${game}`, "character", "data.json")
    const data = JSON.parse(fs.readFileSync(file, "utf8"))
    for (const v of Object.values(data || {})) {
      if (!v?.name) continue
      map.set(normName(v.name), v.name)
    }
  } catch (err) {
    logger?.warn?.(`[ml-groupHold-plugin] 读取 ${game} 角色表失败：${err?.message || err}`)
  }
  nameIndexCache.set(game, map)
  return map
}

export function parseCommand(msg = "") {
  const { mark, game, body } = parsePrefix(msg)
  if (game === "zzz") return null
  const text = `${mark}${body}`
  const ov = CMD_OVERVIEW.exec(text)
  if (ov) {
    const focusCons = consNum(ov[2]) ?? -1
    const star = /全部(?:角色)?持有率\s*$/.test(text) ? 0 : (STAR_MAP[ov[3]] ?? DEFAULT_STAR)
    return { type: "overview", game, star, focusCons, name: "" }
  }
  const ch = CMD_CHAR.exec(text)
  if (ch) {
    const name = ch[2]
    if (NOT_CHAR_NAME.test(name)) return null
    return { type: "char", game, star: 0, focusCons: -1, name }
  }
  return null
}

export default class holdRate extends plugin {
  constructor() {
    super({
      name: "ml-groupHold-plugin:群成员角色持有率",
      dsc: "统计本群成员的角色 / 命座 / 武器 / 圣遗物持有情况（原神 # / 星铁 *），支持 #群二命角色持有率 按指定命座排名",
      event: "message",
      priority: -1000000,
      rule: [
        { reg: CMD_HELP, fnc: "holdHelp" },
        { reg: CMD_UPDATE, fnc: "holdUpdate" },
        { reg: CMD_OVERVIEW, fnc: "holdOverview" },
        { reg: CMD_CHAR, fnc: "holdChar" }
      ]
    })
  }

  groupInfo(e) {
    const name = String(e?.group_name || e?.group?.name || e?.group?.group_name || "").trim()
    const id = e?.group_id || e?.group?.group_id || e?.group?.gid || ""
    return { groupName: name, groupNoMask: maskId(id) }
  }

  async holdHelp(e) {
    const data = helpData()
    data.credit = credit()
    return renderTpl(e, "hold-help", data)
  }

  async holdUpdate(e) {
    if (!e.isMaster) return e.reply("插件更新需要机器人主人权限~")
    const dir = path.resolve(selfResDir(), "..")
    const result = await updatePlugin(dir)
    return e.reply(updateReply(result))
  }

  async holdOverview(e) {
    const parsed = parseCommand(e.msg)
    if (!parsed || parsed.type !== "overview") return false
    const { game, star, focusCons } = parsed
    const conf = gameConf(game)

    if (!e.isGroup) return e.reply(`【${conf.name}·群成员角色持有率】需要在群聊中使用，统计的是本群成员的角色~`)
    if (!(await hasMiao())) return e.reply(TIP_NO_MIAO)

    let scan
    try {
      scan = await collectGroup(e, game)
    } catch (err) {
      logger.error(`[ml-groupHold-plugin] 群持有率统计失败：${err?.stack || err}`)
      return e.reply("统计数据读取失败，请稍后再试~")
    }

    const total = scan?.players?.length || 0
    if (!total) return e.reply(this.emptyTip(scan, conf))

    let data
    try {
      data = buildOverview(scan, { game, star, focusCons, ...this.groupInfo(e), credit: credit() })
    } catch (err) {
      logger.error(`[ml-groupHold-plugin] 持有率聚合失败：${err?.stack || err}`)
      return e.reply("统计数据整理失败，请稍后再试~")
    }

    return renderTpl(e, "hold-rate", data)
  }

  async holdChar(e) {
    const parsed = parseCommand(e.msg)
    if (!parsed || parsed.type !== "char") return false
    const { game, name: raw } = parsed
    const conf = gameConf(game)

    if (!e.isGroup) return e.reply(`【${conf.name}·群成员角色持有率】需要在群聊中使用，统计的是本群成员的角色~`)
    if (!(await hasMiao())) return e.reply(TIP_NO_MIAO)

    const { Character } = await loadMiao()
    const char = resolveChar(Character, raw, game)
    if (!char?.name) return e.reply(`没有找到${conf.name}的角色「${raw}」，检查一下名字~`)

    const vt = travelerView(Character, char, raw)

    let scan
    try {
      scan = await collectChar(e, game, char.name)
    } catch (err) {
      logger.error(`[ml-groupHold-plugin] 角色持有率统计失败：${err?.stack || err}`)
      return e.reply("统计数据读取失败，请稍后再试~")
    }

    const total = scan?.players?.length || 0
    if (!total) return e.reply(this.emptyTip(scan, conf))

    const view = vt?.model || char
    const rawImgs = (() => {
      try {
        return view.getImgs?.(0) || {}
      } catch (err) {
        return {}
      }
    })()
    const imgs = char.isTraveler ? pickTravelerImgs(rawImgs) : rawImgs
    let info = {}
    try {
      info = view.getData("title,desc,birthday,cncv,cons,astro") || {}
    } catch (err) {
      info = {}
    }

    const icons = heroIcons(char.elem || "", char.weapon || "", game, iconSrc)

    const meta = {
      game,
      name: char.name,
      title: info.title || "",
      desc: (info.desc || "").replace(/<\/?br\s*\/?>/g, " ").trim(),
      star: char.star || 5,
      elem: char.isTraveler ? "multi" : char.elem || "",
      elemName: char.isTraveler ? "七元素" : "",
      elemIcon: icons.elemIcon,
      typeIcon: icons.typeIcon,
      isTraveler: !!char.isTraveler,
      weapon: char.weapon || "",
      face: imgs.face || "",
      banner: pickBanner(imgs, game),
      artAnchor: artAnchorOf(pickBanner(imgs, game), game, char.name),
      artZoom: artZoomOf(pickBanner(imgs, game), game, char.name),
      birthday: info.birthday || "",
      cncv: info.cncv || "",
      astro: char.isTraveler && vt ? `${vt.elemName}形态 · ${info.astro || "旅人座"}` : info.astro || "",
      cons: info.cons || {},
      ...this.groupInfo(e),
      credit: credit()
    }

    let data
    try {
      data = buildDetail(scan, meta)
    } catch (err) {
      logger.error(`[ml-groupHold-plugin] 角色详情聚合失败：${err?.stack || err}`)
      return e.reply("统计数据整理失败，请稍后再试~")
    }

    return renderTpl(e, "char-hold", data)
  }

  emptyTip(scan, conf = gameConf("gs")) {
    if (!scan || !scan.memberCount) return "没拿到本群的成员列表，稍后再试试~"
    if (!scan.bindings) {
      return [
        `本群还没有可以统计的${conf.name}成员~`,
        `让群友先发送【#更新面板】同步一次游戏角色数据（或【#绑定uid】），之后再来统计`
      ]
    }
    return [
      `本群有 ${scan.bindings} 位成员绑定了${conf.name} UID，但还没有可用的角色数据~`,
      "发送【#更新面板】同步角色展柜后即可参与统计"
    ]
  }
}

export function resolveChar(Character, raw = "", game = "gs") {
  const name = String(raw || "").trim()
  if (!name) return null
  try {
    const hit = Character.get(name, game)
    if (hit?.name) return hit
  } catch (err) {
  }
  const real = metaNameIndex(game).get(normName(name))
  if (!real) return null
  try {
    const hit = Character.get(real, game)
    if (hit?.name) return hit
  } catch (err) {
  }
  return null
}

const ELEM_CHAR = { 风: "anemo", 岩: "geo", 雷: "electro", 草: "dendro", 水: "hydro", 火: "pyro", 冰: "cryo" }

export function travelerView(Character, char, raw = "") {
  if (!char?.isTraveler) return null
  const s = normName(raw)
  const hit = /[风岩雷草水冰火]/.exec(s)
  const key = (hit && ELEM_CHAR[hit[0]]) || "cryo"
  const info = TRAVELER_ELEMS.find((e) => e.key === key) || TRAVELER_ELEMS[TRAVELER_ELEMS.length - 1]
  let model = null
  try {
    model = new Character({ id: 20000000, name: "旅行者", elem: key, game: "gs" })
  } catch (err) {
    model = null
  }
  return { model: model || char, elem: key, elemName: info.name }
}

const TRAVELER_ROOT_IMG = "meta-gs/character/旅行者/imgs"

function imgExists(rel = "") {
  if (!rel) return false
  try {
    return fs.existsSync(path.join(miaoResDir(), String(rel).replace(/^\/+/, "")))
  } catch (err) {
    return false
  }
}

function iconSrc(rel = "") {
  const p = String(rel || "").replace(/^\/+/, "")
  if (!p) return ""
  const self = p.startsWith("self:")
  const sub = self ? p.slice(5) : p
  const root = self ? selfResDir() : miaoResDir()
  try {
    if (!fs.existsSync(path.join(root, sub))) return ""
    return `${toFileUrl(root)}/${sub.replace(/\\/g, "/")}`
  } catch (err) {
    return ""
  }
}

export function pickTravelerImgs(imgs = {}) {
  const out = { ...imgs }
  for (const k of ["card", "banner", "splash", "gacha", "side", "face"]) {
    if (!imgExists(out[k])) out[k] = `${TRAVELER_ROOT_IMG}/${k}.webp`
  }
  return out
}
