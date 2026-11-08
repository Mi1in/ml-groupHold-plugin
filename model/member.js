const UID_RE = /^\d{9,10}$/
const QQ_RE = /^\d{5,12}$/
const BIND_PREFIXES = ["Yz:genshin:mys:qq-uid:", "genshin:id-uid:"]
const PRESET_UID_MAX = 100000006

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
    logger?.warn?.(`[ml-groupHold-plugin] getMemberMap 失败：${err?.message || err}`)
  }
  try {
    const list = (await group.getMemberList?.()) || []
    for (const m of list) {
      const qq = m?.user_id ?? m?.qq
      if (qq) map.set(String(qq), m)
    }
  } catch (err) {
    logger?.warn?.(`[ml-groupHold-plugin] getMemberList 失败：${err?.message || err}`)
  }
  return map
}

function nickOf(m, qq) {
  const nick = String(m?.card || m?.nickname || m?.name || "").trim()
  return nick || String(qq)
}

async function batchGet(keys) {
  if (!keys?.length) return []
  if (typeof redis?.mGet === "function") {
    try {
      const ret = await redis.mGet(keys)
      if (Array.isArray(ret) && ret.length === keys.length) return ret
    } catch (err) {
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

export async function getMemberBindings(e, game = "gs") {
  const memberMap = await getGroupMembers(e)
  const members = new Map()
  for (const [qq, m] of memberMap) {
    const key = String(qq)
    if (!QQ_RE.test(key)) continue
    members.set(key, nickOf(m, key))
  }
  if (!members.size) return { bindings: [], memberCount: 0 }

  const candidates = []
  const seenUid = new Set()
  const add = (qq, uid, type = "bind", weight = 0) => {
    qq = String(qq ?? "").trim()
    uid = String(uid ?? "").trim()
    if (!QQ_RE.test(qq) || !UID_RE.test(uid)) return
    if (uid * 1 <= PRESET_UID_MAX) return
    if (!members.has(qq)) return
    if (seenUid.has(uid)) return
    seenUid.add(uid)
    candidates.push({ qq, uid, type: type === "ck" ? "ck" : "bind", weight: Number(weight) || 0 })
  }

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
    logger?.warn?.(`[ml-groupHold-plugin] 读取 miao 绑定信息失败：${err?.message || err}`)
  }

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
  }

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
