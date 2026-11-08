import { loadMiao } from "./miao.js"
import { getMemberBindings } from "./member.js"
import { elemInfo, gameConf, TRAVELER_IDS, isTravelerName } from "./game.js"

const TTL = 5 * 60 * 1000
const MAX_CACHE = 24

const TRAVELER_ID_SET = new Set(TRAVELER_IDS)
const EXCLUDE_IDS = {
  gs: new Set([10000117, 10000118]),
  sr: new Set()
}
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

function relImg(p = "") {
  return String(p || "").replace(/^\/+/, "")
}

function leanOwner(av, binding) {
  return {
    qq: binding.qq,
    nick: binding.nick,
    uid: binding.uid,
    cons: Math.min(6, Math.max(0, num(av.cons))),
    level: num(av.level, 1),
    elem: String(av.elem || ""),
    isProfile: !!av.isProfile
  }
}

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
  const wantTraveler = game === "gs" && isTravelerName(targetName)

  for (const binding of bindings) {
    let player = null
    try {
      player = Player.create(binding.uid, game)
    } catch (err) {
      logger?.warn?.(`[ml-groupHold-plugin] 读取 ${game} uid ${binding.uid} 数据失败：${err?.message || err}`)
      continue
    }
    if (!player || typeof player.forEachAvatar !== "function") continue
    if (typeof player.hasAvatar === "function" && !player.hasAvatar()) continue

    let hasData = false
    try {
      await player.forEachAvatar((av) => {
        if (!av || !av.hasData) return
        const isTraveler = game === "gs" && TRAVELER_ID_SET.has(num(av.id))
        hasData = true
        if (!isTraveler && exclude.has(num(av.id))) return
        if (isTraveler && !wantTraveler) return
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
      logger?.warn?.(`[ml-groupHold-plugin] 解析 ${game} uid ${binding.uid} 角色数据出错：${err?.message || err}`)
    }

    if (hasData) result.players.push({ qq: binding.qq, nick: binding.nick, uid: binding.uid })
  }

  result.chars = [...chars.values()]
  result.conf = { consLabel: conf.consLabel, weaponLabel: conf.weaponLabel, relicLabel: conf.relicLabel }
  return result
}

export async function collectGroup(e, game = "gs") {
  const key = `overview:${game}:${e?.group_id || 0}`
  return fromCache(key, () => scanGroup(e, game, ""))
}

export async function collectChar(e, game = "gs", name = "") {
  const key = `char:${game}:${e?.group_id || 0}:${name}`
  return fromCache(key, () => scanGroup(e, game, name))
}

export function clearCache() {
  cache().clear()
}
