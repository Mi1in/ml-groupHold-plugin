/**
 * 群成员角色持有率
 *
 * 指令（# 原神 / * 星穹铁道）：
 *   #群角色持有率        默认只看五星角色（最常关心的范围）
 *   #群全部角色持有率    全部角色（五星 + 四星）
 *   #群五星角色持有率    只看五星（与默认等价）
 *   #群四星角色持有率    只看四星
 *   #群二命角色持有率    只看五星，按「二命」持有率由高到低排（数字 0-6 或 一二三四五六 都认）
 *   #群甘雨持有率        单个角色详情：等级分布 / 命座信息 / 命座分布 / 武器穿戴 / 圣遗物套装
 *   #旅行者持有率        旅行者（空/荧）：额外多一块「七元素分布」，命座默认取冰形态
 *                        #冰主持有率 / #火旅行者持有率 可指定形态
 *
 *   *群角色持有率 / *群全部角色持有率 / *群五星角色持有率 / *群四星角色持有率 / *群二魂角色持有率 / *群昔涟持有率
 *
 * 「群」字可省略（#角色持有率 也认），仅为可读性。
 *
 * 注意：框架会把 `*` 开头的消息标准化成 `#星铁…`（lib/plugins/loader.js 的 srReg），
 *      所以 `#星铁昔涟持有率` / `#星铁群角色持有率` 这类真实到达的消息也要能解析，
 *      详见 model/game.js 的 parsePrefix。
 *
 * 数据来源：miao-plugin 的 data/PlayerData/<游戏>/<uid>.json（#更新面板 同步下来的面板数据），
 *          成员范围严格限定为「本群成员」——非本群成员的绑定一律丢弃。
 */
import fs from "node:fs"
import path from "node:path"
import { loadMiao, hasMiao, miaoResDir, selfResDir, toFileUrl } from "../model/miao.js"
import { collectGroup, collectChar } from "../model/collect.js"
import { buildOverview, buildDetail } from "../model/stat.js"
import { renderTpl } from "../model/render.js"
import { maskId } from "../model/format.js"
import { credit } from "../model/credit.js"
import { gameConf, normName, pickBanner, parsePrefix, consNum, TRAVELER_ELEMS, artAnchorOf, artZoomOf, heroIcons } from "../model/game.js"

const TIP_NO_MIAO = "本插件依赖 miao-plugin 的角色数据，请先安装/启用 miao-plugin 后再试~"

/**
 * 前缀里的游戏词（可选）
 *
 * 框架 lib/plugins/loader.js 会把 `*` 开头的消息改写成 `#星铁…`（并置 e.game='sr'），
 * 所以规则的正则必须容忍 `#星铁` / `#原神` 这种前缀，否则 `*流萤持有率` 根本进不来。
 * 长的词排在前面，避免 `星穹` 抢在 `星穹铁道` 之前匹配。
 */
const GAME_WORD_ANY = "(?:崩坏星穹铁道|崩坏星穹|星穹铁道|星穹|星轨|穹轨|崩铁|星铁|铁道|原神|genshin)"
const GAME_WORD = `${GAME_WORD_ANY}?`

/** 命座/星魂序号：0-6 或 零一二两三四五六满 + 「命」/「魂」（「满」= 6） */
const CONS_DIGIT = "[0-6零一二两三四五六满]"
/** 用于排除角色名：只要长得像「七命 / 3魂 / 满命」就不当角色名（即使超出 0-6 范围） */
const CONS_ANY = "[0-9零一二两三四五六七八九十满]\\s*[命魂]"
const STAR_WORD = "(五星|5星|四星|4星|五|四)"

/**
 * 总览：可带「x命 / x魂」排序范围 + 星级限定
 *   全部——#群全部角色持有率 / #群全部持有率
 *   星级——#群五星角色持有率 / #群四星角色持有率（不写就默认五星）
 *   命座——#群二命角色持有率 / *群二魂角色持有率（按该命座持有率由高到低排）
 * 注意「全部角色持有率」里已经含「角色」，不能和「××角色持有率」共用一个后缀，得分两条式子。
 */
const CMD_OVERVIEW = new RegExp(
  `^([#*])\\s*${GAME_WORD}\\s*(?:群\\s*)?(?:(` +
    CONS_DIGIT +
    `)\\s*[命魂]\\s*)?(?:全部(?:角色)?持有率|` +
    STAR_WORD +
    `?\\s*角色持有率)\\s*$`
)
const CMD_ALL_ROLE = /^[#*]\s*(?:群\s*)?全部(?:角色)?持有率\s*$/
const CMD_STAR_ROLE = /^[#*]\s*(?:群\s*)?(五星|5星|四星|4星|五|四)?\s*角色持有率\s*$/
/**
 * 单角色：角色名允许中文、间隔符、英文字母（Saber / Archer）、数字与点（银狼LV.999）、&（托帕&账账）
 * 角色名首位排除「群」：否则 #群持有率 会被当成「群」这个角色名
 * 也排除「二命 / 2魂」这类命座前缀：那是总览指令（#二命角色持有率），不该拿去当角色名
 */
const CMD_CHAR = new RegExp(
  `^([#*])\\s*${GAME_WORD}\\s*(?:群\\s*)?((?!群)(?!${GAME_WORD_ANY})(?!${CONS_ANY})[\\u4e00-\\u9fa5·•・A-Za-z0-9.&]{1,12})\\s*持有率\\s*$`
)

const STAR_MAP = { 全部角色: 0, 全部: 0, 五星: 5, "5星": 5, 五: 5, 四星: 4, "4星": 4, 四: 4 }

/** 不写范围时的默认值：五星（群里最关心的就是五星角色的持有与命座） */
const DEFAULT_STAR = 5

/** 这些不是角色名，是总览指令的残留匹配 */
const NOT_CHAR_NAME = /^(?:全部|全部角色|角色|五星角色|四星角色|五星|四星|五|四|5星角色|4星角色)$/

/** 角色名归一化索引：game -> Map<去分隔符名字, 正式名> */
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
    logger?.warn?.(`[ml-sgh-plugin] 读取 ${game} 角色表失败：${err?.message || err}`)
  }
  nameIndexCache.set(game, map)
  return map
}

/**
 * 解析指令
 *
 * 先把前缀里的游戏词剥掉再匹配：框架会把 `*` 统一改写成 `#星铁`（见 model/game.js 的 parsePrefix），
 * 所以实际收到的可能是 `#星铁昔涟持有率` / `#星铁群角色持有率`，这里还原成 `*昔涟持有率` 再判断。
 *
 * focusCons：按第几命排序（-1 表示不按命座排；「零命」是 0，不能用 falsy 判断）
 *
 * @returns {{ type: "overview"|"char", game: string, star: number, focusCons: number, name: string }|null}
 */
export function parseCommand(msg = "") {
  const { mark, game, body } = parsePrefix(msg)
  // 绝区零不在统计范围内，别把「绝区零××」当成原神角色名去查
  if (game === "zzz") return null
  const text = `${mark}${body}`
  const ov = CMD_OVERVIEW.exec(text)
  if (ov) {
    const focusCons = consNum(ov[2]) ?? -1
    // 「全部」不分星级；否则按显式星级，没写就默认五星
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
      name: "ml-sgh-plugin:群成员角色持有率",
      dsc: "统计本群成员的角色 / 命座 / 武器 / 圣遗物持有情况（原神 # / 星铁 *），支持 #群二命角色持有率 按指定命座排名",
      event: "message",
      /**
       * -1000000：必须小到能盖过 StarRail-plugin 的 -114514。
       * 它的 `^rulePrefix(卡片|探索|角色)` 没加 `$` 锚点，`*角色持有率` 被框架改写成
       * `#星铁角色持有率` 之后正好撞上它的「角色」分支，于是被当作星铁角色卡查询吃掉。
       * 我们的两条正则都以 `持有率$` 结尾，范围够窄，抢到最前面不会误伤别的指令。
       */
      priority: -1000000,
      rule: [
        { reg: CMD_OVERVIEW, fnc: "holdOverview" },
        { reg: CMD_CHAR, fnc: "holdChar" }
      ]
    })
  }

  /** 群名 / 群号（打码）：所有图都会在页眉展示 */
  groupInfo(e) {
    const name = String(e?.group_name || e?.group?.name || e?.group?.group_name || "").trim()
    const id = e?.group_id || e?.group?.group_id || e?.group?.gid || ""
    return { groupName: name, groupNoMask: maskId(id) }
  }

  /** 总览 */
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
      logger.error(`[ml-sgh-plugin] 群持有率统计失败：${err?.stack || err}`)
      return e.reply("统计数据读取失败，请稍后再试~")
    }

    const total = scan?.players?.length || 0
    if (!total) return e.reply(this.emptyTip(scan, conf))

    let data
    try {
      data = buildOverview(scan, { game, star, focusCons, ...this.groupInfo(e), credit: credit() })
    } catch (err) {
      logger.error(`[ml-sgh-plugin] 持有率聚合失败：${err?.stack || err}`)
      return e.reply("统计数据整理失败，请稍后再试~")
    }

    return renderTpl(e, "hold-rate", data)
  }

  /** 单个角色 */
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

    /**
     * 旅行者（主角）：面板里是空 / 荧，可以共鸣七种元素，命座说明随元素不同。
     * 用户的常见诉求是「看冰主那套命座」，所以：
     *   · 没指定形态（#旅行者持有率）→ 默认冰
     *   · 指定了形态（#火主持有率 / #风旅行者持有率）→ 用指定的
     */
    const vt = travelerView(Character, char, raw)

    let scan
    try {
      scan = await collectChar(e, game, char.name)
    } catch (err) {
      logger.error(`[ml-sgh-plugin] 角色持有率统计失败：${err?.stack || err}`)
      return e.reply("统计数据读取失败，请稍后再试~")
    }

    const total = scan?.players?.length || 0
    if (!total) return e.reply(this.emptyTip(scan, conf))

    // 旅行者用「指定形态」的 Character 取图与命座说明，其它角色就是它自己
    const view = vt?.model || char
    const rawImgs = (() => {
      try {
        return view.getImgs?.(0) || {}
      } catch (err) {
        return {}
      }
    })()
    // 旅行者的 cryo 形态没有 card / banner 立绘，直接用会出一块空白头图
    const imgs = char.isTraveler ? pickTravelerImgs(rawImgs) : rawImgs
    let info = {}
    try {
      info = view.getData("title,desc,birthday,cncv,cons,astro") || {}
    } catch (err) {
      info = {}
    }

    // 头图图标从本机资源里探测，缺哪张就由模板降级成文字
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
      // 头图：原神用角色卡横版立绘，星铁用 splash 立绘（星铁 card/banner 是通用星空图）
      banner: pickBanner(imgs, game),
      // 头图锚点 / 缩放：星铁按 sr-face.json 逐角色标定（把「头部」对齐头图中线）
      artAnchor: artAnchorOf(pickBanner(imgs, game), game, char.name),
      artZoom: artZoomOf(pickBanner(imgs, game), game, char.name),
      birthday: info.birthday || "",
      cncv: info.cncv || "",
      // 旅行者的命座按形态区分，标题上标一下是哪一套（如「冰形态 · 旅人座」）
      astro: char.isTraveler && vt ? `${vt.elemName}形态 · ${info.astro || "旅人座"}` : info.astro || "",
      cons: info.cons || {},
      ...this.groupInfo(e),
      credit: credit()
    }

    let data
    try {
      data = buildDetail(scan, meta)
    } catch (err) {
      logger.error(`[ml-sgh-plugin] 角色详情聚合失败：${err?.stack || err}`)
      return e.reply("统计数据整理失败，请稍后再试~")
    }

    return renderTpl(e, "char-hold", data)
  }

  /** 没数据时给一句能指导动作的话 */
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

/**
 * 按名字查角色，容忍角色名里的间隔符（阮·梅 / 阮•梅 / 阮梅 都能命中）
 * @param {object} Character miao 的 Character 模型
 */
export function resolveChar(Character, raw = "", game = "gs") {
  const name = String(raw || "").trim()
  if (!name) return null
  // 1. 直接查（miao 自己有一套别名与去点处理）
  try {
    const hit = Character.get(name, game)
    if (hit?.name) return hit
  } catch (err) {
    /* 落到归一化匹配 */
  }
  // 2. 归一化后再查（把 · • ・ 全部去掉）
  const real = metaNameIndex(game).get(normName(name))
  if (!real) return null
  try {
    const hit = Character.get(real, game)
    if (hit?.name) return hit
  } catch (err) {
    /* ignore */
  }
  return null
}

/** 元素字 -> 英文 key（识别「冰主 / 火旅行者」这类形态写法） */
const ELEM_CHAR = { 风: "anemo", 岩: "geo", 雷: "electro", 草: "dendro", 水: "hydro", 火: "pyro", 冰: "cryo" }

/**
 * 旅行者的「形态」
 *
 * 面板里空 / 荧 是同一个角色（id 20000000），七种共鸣元素各有一套命座说明与立绘，
 * 但 Character.get("旅行者") 默认给的是风，分不清用户到底想看哪一套。所以从指令原文里抠元素：
 *   · 没写形态（#旅行者持有率）→ 冰（群里最常见，也是主线最新的那套）
 *   · 写了（#冰主持有率 / #火旅行者持有率）→ 用写的那套
 *
 * @returns {{ model: object, elem: string, elemName: string }|null} 非旅行者返回 null
 */
export function travelerView(Character, char, raw = "") {
  if (!char?.isTraveler) return null
  const s = normName(raw)
  const hit = /[风岩雷草水冰火]/.exec(s)
  const key = (hit && ELEM_CHAR[hit[0]]) || "cryo"
  const info = TRAVELER_ELEMS.find((e) => e.key === key) || TRAVELER_ELEMS[TRAVELER_ELEMS.length - 1]
  let model = null
  try {
    // 必须带上 name：miao 的 Character 有全局缓存（key = character:gs:id:elem），
    // 用 new Character({ id, elem }) 造出来的实例 name 是空串，会把后面 Character.get("冰主")
    // 的查询一并污染成「找不到角色」。
    model = new Character({ id: 20000000, name: "旅行者", elem: key, game: "gs" })
  } catch (err) {
    model = null
  }
  return { model: model || char, elem: key, elemName: info.name }
}

/** 旅行者的通用立绘（各形态没单独出图时用它兜底） */
const TRAVELER_ROOT_IMG = "meta-gs/character/旅行者/imgs"

/** miao 资源里这张图真的存在吗 */
function imgExists(rel = "") {
  if (!rel) return false
  try {
    return fs.existsSync(path.join(miaoResDir(), String(rel).replace(/^\/+/, "")))
  } catch (err) {
    return false
  }
}

/** 图标 URL：self: 前缀读本插件可选自备图标，其余读 miao resources */
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

/**
 * 旅行者头图兜底
 *
 * 坑：meta-gs/character/旅行者/<elem>/imgs 只有 anemo…pyro 有 card/banner，cryo 目录是空的，
 * 直接用 getImgs 给的路径会得到一块空白头图。缺图就退回 旅行者/imgs 的通用立绘。
 */
export function pickTravelerImgs(imgs = {}) {
  const out = { ...imgs }
  for (const k of ["card", "banner", "splash", "gacha", "side", "face"]) {
    if (!imgExists(out[k])) out[k] = `${TRAVELER_ROOT_IMG}/${k}.webp`
  }
  return out
}
