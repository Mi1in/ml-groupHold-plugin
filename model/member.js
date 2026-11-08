/**
 * 群成员 UID 绑定收集
 *
 * 「只统计本群成员」这件事靠两层保证：
 *   1. 先取本群成员列表，之后所有绑定都要过 `members.has(qq)` 这一关，
 *      非本群成员的绑定（哪怕 redis 里存着）一律丢弃；
 *   2. 同一个 UID 被多人绑定时只保留一个人（seenUid 去重），避免一人多号重复计数。
 *
 * 数据源（按优先级）：
 *   1. miao:rank:uid-info:<game>:<uid>  { qq, uidType, totalCount } —— #更新面板 / 群排行时写入
 *   2. Yz:genshin:mys:qq-uid:<qq> / genshin:id-uid:<qq> —— 框架级 qq→uid 绑定
 *   3. e.runtime.NoteUser —— Miao-Yunzai 的 NoteUser（存在才用）
 */
const UID_RE = /^\d{9,10}$/
const QQ_RE = /^\d{5,12}$/
const BIND_PREFIXES = ["Yz:genshin:mys:qq-uid:", "genshin:id-uid:"]
/** 预设面板/官方示例 uid，不参与统计 */
const PRESET_UID_MAX = 100000006

/** 取群成员 Map<qq, member>，跨适配器兜底 */
async function getGroupMembers(e) {
  const group = e?.group
  const map = new Map()
  if (!group) return map

  try {
    const ret = await group.getMemberMap?.()
    if (ret && typeof ret.forEach === "function") {
      for (const [qq, m] of ret) if (qq) map.set(String(qq), m)
      if (map.size) return map
    }
  } catch (err) {
    logger?.warn?.(`[ml-sgh-plugin] getMemberMap 失败：${err?.message || err}`)
  }
  try {
    const list = (await group.getMemberList?.()) || []
    for (const m of list) {
      const qq = m?.user_id ?? m?.qq
      if (qq) map.set(String(qq), m)
    }
  } catch (err) {
    logger?.warn?.(`[ml-sgh-plugin] getMemberList 失败：${err?.message || err}`)
  }
  return map
}

function nickOf(m, qq) {
  const nick = String(m?.card || m?.nickname || m?.name || "").trim()
  return nick || String(qq)
}

/** redis.mGet 在个别实现里可能没有，退化为逐个 get */
async function batchGet(keys) {
  if (!keys?.length) return []
  if (typeof redis?.mGet === "function") {
    try {
      const ret = await redis.mGet(keys)
      if (Array.isArray(ret) && ret.length === keys.length) return ret
    } catch (err) {
      /* 落到逐个取 */
    }
  }
  const ret = []
  for (const key of keys) {
    try {
      ret.push(await redis.get(key))
    } catch (err) {
      ret.push(null)
    }
  }
  return ret
}

/**
 * 收集「本群成员 → 已绑定游戏 UID」
 * @param {object} e 事件对象
 * @param {string} game gs | sr
 * @returns {Promise<{bindings: Array<{qq:string,nick:string,uid:string,type:string}>, memberCount:number}>}
 */
export async function getMemberBindings(e, game = "gs") {
  const memberMap = await getGroupMembers(e)
  const members = new Map()
  for (const [qq, m] of memberMap) {
    const key = String(qq)
    if (!QQ_RE.test(key)) continue
    members.set(key, nickOf(m, key))
  }
  if (!members.size) return { bindings: [], memberCount: 0 }

  /** 候选绑定：同一 qq 可能命中多个 uid，后面按权重取一个 */
  const candidates = []
  const seenUid = new Set()
  const add = (qq, uid, type = "bind", weight = 0) => {
    qq = String(qq ?? "").trim()
    uid = String(uid ?? "").trim()
    if (!QQ_RE.test(qq) || !UID_RE.test(uid)) return
    if (uid * 1 <= PRESET_UID_MAX) return
    // 关键：非本群成员直接丢弃
    if (!members.has(qq)) return
    if (seenUid.has(uid)) return
    seenUid.add(uid)
    candidates.push({ qq, uid, type: type === "ck" ? "ck" : "bind", weight: Number(weight) || 0 })
  }

  // 1. miao 写入的 uid-info（totalCount = 该账号有数据的角色数，用作主号判定）
  try {
    const keys = (await redis.keys(`miao:rank:uid-info:${game}:*`)) || []
    const vals = await batchGet(keys)
    keys.forEach((key, idx) => {
      const uid = /:(\d{9,10})$/.exec(key)?.[1]
      if (!uid) return
      let info = null
      try {
        info = JSON.parse(vals?.[idx] || "null")
      } catch (err) {
        info = null
      }
      if (info?.qq) add(info.qq, uid, info.uidType, info.totalCount)
    })
  } catch (err) {
    logger?.warn?.(`[ml-sgh-plugin] 读取 miao 绑定信息失败：${err?.message || err}`)
  }

  // 2. 框架级 qq→uid 绑定
  const boundQQ = new Set(candidates.map((c) => c.qq))
  const pending = [...members.keys()].filter((qq) => !boundQQ.has(qq))
  if (pending.length) {
    const pairs = []
    for (const prefix of BIND_PREFIXES) for (const qq of pending) pairs.push({ qq, key: `${prefix}${qq}` })
    const vals = await batchGet(pairs.map((p) => p.key))
    pairs.forEach((p, idx) => {
      const uid = String(vals?.[idx] ?? "").trim()
      if (uid) add(p.qq, uid, "bind", 0)
    })
  }

  // 3. Miao-Yunzai NoteUser（存在才用）
  try {
    const NoteUser = e?.runtime?.NoteUser
    if (NoteUser && typeof NoteUser.forEach === "function") {
      const still = [...members.keys()].filter((qq) => !candidates.some((c) => c.qq === qq))
      if (still.length) {
        await NoteUser.forEach(async (user) => {
          const qq = String(user?.qq ?? "")
          if (!still.includes(qq)) return true
          for (const ds of user.getUidList?.(game) || []) if (ds?.uid) add(qq, ds.uid, ds.type, 0)
        })
      }
    }
  } catch (err) {
    /* NoteUser 不是必须的 */
  }

  // 同一 qq 只留权重最高的那个 uid
  const byQQ = new Map()
  for (const c of candidates) {
    const cur = byQQ.get(c.qq)
    if (!cur || c.weight > cur.weight) byQQ.set(c.qq, c)
  }

  const bindings = [...byQQ.values()]
    .map((c) => ({ qq: c.qq, nick: members.get(c.qq), uid: c.uid, type: c.type }))
    .sort((a, b) => (a.uid > b.uid ? 1 : -1))

  return { bindings, memberCount: members.size }
}
