/**
 * 群成员角色数据采集
 *
 * 通过 miao-plugin 的 Player 模型读取 data/PlayerData/<game>/<uid>.json（即 #更新面板 拉下来的数据），
 * 汇总成「角色 -> 持有者列表」的结构，供 model/stat.js 做统计。
 *
 * 两种模式：
 *   overview —— 只要 命座/星级/元素/头像，尽量快（群里几十人 × 上百角色）
 *   detail   —— 针对单个角色，额外算武器、套装、圣遗物评分、属性面板
 */
import { loadMiao } from "./miao.js"
import { getMemberBindings } from "./member.js"
import { elemInfo, gameConf, TRAVELER_IDS, isTravelerName } from "./game.js"

const TTL = 5 * 60 * 1000
const MAX_CACHE = 24

/**
 * 旅行者（空 / 荧）与占位角色
 *
 * 总览里不统计：旅行者人人都有，还会分七种元素形态，塞进「五星持有率」排名永远是第一名，
 * 没信息量。只有明确点名「旅行者」时才按 id 单独收（见 scanGroup 的 wantTraveler），
 * 并统一记到「旅行者」名下——面板里它的名字是「空」「荧」，按名字认会漏。
 */
const TRAVELER_ID_SET = new Set(TRAVELER_IDS)
const EXCLUDE_IDS = {
  gs: new Set([10000117, 10000118]),
  sr: new Set()
}
/** 旅行者在角色表里的 id（elem = multi），统一用它当统计键 */
const TRAVELER_CHAR_ID = 20000000
const TRAVELER_NAME = "旅行者"

const cache = () => (globalThis.__mlSghCache ||= new Map())

async function fromCache(key, producer) {
  const store = cache()
  const hit = store.get(key)
  if (hit && Date.now() - hit.time < TTL) return hit.data
  const data = await producer()
  store.set(key, { time: Date.now(), data })
  while (store.size > MAX_CACHE) store.delete(store.keys().next().value)
  return data
}

function num(v, def = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

function round1(v) {
  return Math.round(num(v) * 10) / 10
}

/** miao 的图片路径有的带前导 /，统一去掉（模板里拼 miaoRes 前缀） */
function relImg(p = "") {
  return String(p || "").replace(/^\/+/, "")
}

/** 简单持有者（总览用） */
function leanOwner(av, binding) {
  return {
    qq: binding.qq,
    nick: binding.nick,
    uid: binding.uid,
    cons: Math.min(6, Math.max(0, num(av.cons))),
    level: num(av.level, 1),
    /** 面板里的元素（旅行者按它做七元素分布） */
    elem: String(av.elem || ""),
    isProfile: !!av.isProfile
  }
}

/** 完整持有者（单角色详情用） */
function richOwner(av, binding, game) {
  const owner = leanOwner(av, binding)

  const w = av.weapon
  if (w && w.name) {
    owner.weapon = {
      name: w.name,
      star: num(w.star, 4),
      affix: num(w.affix, 0),
      level: num(w.level, 1),
      img: relImg(w.img || "")
    }
  } else {
    owner.weapon = null
  }

  let set = null
  try {
    set = av.artisSet
  } catch (err) {
    set = null
  }
  // miao 的 getSetData() 只收录「>=2 件」的套装：
  //   sets = {套装名: 4|2}，names / abbrs / imgs 与之一一对应（abbrs 前半段是缩写+件数）
  const counts = (set && set.sets) || {}
  const names = (set && set.names) || []
  const abbrs = (set && set.abbrs) || []
  const imgs = (set && set.imgs) || []
  owner.setList = Object.keys(counts).map((name, i) => ({
    name,
    count: Number(counts[name]) || 2,
    abbr: String(abbrs[i] || "").replace(/\d+$/, "") || name,
    img: relImg(imgs[i] || "")
  }))
  owner.game = game

  owner.mark = 0
  owner.markClass = ""
  if (owner.isProfile) {
    try {
      if (av.hasArtis?.()) {
        const mark = av.getArtisMark(false)
        owner.mark = round1(mark?._mark)
        owner.markClass = mark?.markClass || ""
      }
    } catch (err) {
      owner.mark = 0
    }
    const attr = av.attr
    if (attr) {
      owner.attr = {
        atk: Math.round(num(attr.atk)),
        cpct: round1(attr.cpct),
        cdmg: round1(attr.cdmg),
        dmg: round1(attr.dmg),
        recharge: round1(attr.recharge),
        mastery: Math.round(num(attr.mastery))
      }
    }
    const t = av.talent
    if (t) owner.talent = [num(t.a?.original), num(t.e?.original), num(t.q?.original)]
  }
  return owner
}

/**
 * 扫描本群已绑定成员的角色数据
 * @param {object} e 事件对象
 * @param {string} game gs | sr
 * @param {string} targetName 只收集该角色（详情模式），空串表示全部角色
 */
async function scanGroup(e, game = "gs", targetName = "") {
  const { bindings, memberCount } = await getMemberBindings(e, game)
  const conf = gameConf(game)
  const result = {
    time: Date.now(),
    game,
    memberCount,
    bindings: bindings.length,
    players: [],
    chars: [],
    targetName
  }
  if (!bindings.length) return result

  const { Player } = await loadMiao()
  const chars = new Map()
  const withDetail = !!targetName
  const exclude = EXCLUDE_IDS[game] || new Set()
  /** 只有点名「旅行者」时才收它 */
  const wantTraveler = game === "gs" && isTravelerName(targetName)

  for (const binding of bindings) {
    let player = null
    try {
      player = Player.create(binding.uid, game)
    } catch (err) {
      logger?.warn?.(`[ml-sgh-plugin] 读取 ${game} uid ${binding.uid} 数据失败：${err?.message || err}`)
      continue
    }
    if (!player || typeof player.forEachAvatar !== "function") continue
    if (typeof player.hasAvatar === "function" && !player.hasAvatar()) continue

    let hasData = false
    try {
      await player.forEachAvatar((av) => {
        if (!av || !av.hasData) return
        const isTraveler = game === "gs" && TRAVELER_ID_SET.has(num(av.id))
        // 有可用角色数据就计入分母（持有率的分母是"有数据的成员"，不是"持有该角色的人"）
        // 旅行者也一样算：只同步了主角的人同样该进分母
        hasData = true
        if (!isTraveler && exclude.has(num(av.id))) return
        // 旅行者默认不进总览（人人都有，且会按元素拆成七份），只有点名时才收
        if (isTraveler && !wantTraveler) return
        // 面板里旅行者的名字是「空」「荧」，统一并到「旅行者」名下
        const name = isTraveler ? TRAVELER_NAME : av.name
        if (!name) return
        if (withDetail && name !== targetName) return

        let stat = chars.get(name)
        if (!stat) {
          const elem = elemInfo(isTraveler ? "multi" : av.char?.elem || av.elem || "")
          stat = {
            name,
            id: isTraveler ? TRAVELER_CHAR_ID : num(av.id),
            star: num(av.star, isTraveler ? 5 : 4),
            elem: elem.key,
            elemName: elem.name,
            face: relImg(av.imgs?.face || ""),
            isTraveler,
            owners: []
          }
          chars.set(name, stat)
        }
        stat.owners.push(withDetail ? richOwner(av, binding, game) : leanOwner(av, binding))
      })
    } catch (err) {
      logger?.warn?.(`[ml-sgh-plugin] 解析 ${game} uid ${binding.uid} 角色数据出错：${err?.message || err}`)
    }

    // 只有真正读到角色数据的成员才计入分母，避免"绑了但没同步数据"的人拉低持有率
    if (hasData) result.players.push({ qq: binding.qq, nick: binding.nick, uid: binding.uid })
  }

  result.chars = [...chars.values()]
  result.conf = { consLabel: conf.consLabel, weaponLabel: conf.weaponLabel, relicLabel: conf.relicLabel }
  return result
}

/** 总览：全部角色的持有情况 */
export async function collectGroup(e, game = "gs") {
  const key = `overview:${game}:${e?.group_id || 0}`
  return fromCache(key, () => scanGroup(e, game, ""))
}

/** 单角色详情 */
export async function collectChar(e, game = "gs", name = "") {
  const key = `char:${game}:${e?.group_id || 0}:${name}`
  return fromCache(key, () => scanGroup(e, game, name))
}

/** 清空缓存（调试/强制刷新用） */
export function clearCache() {
  cache().clear()
}
