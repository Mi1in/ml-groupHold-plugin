import { toPercent } from "./format.js"
import { elemInfo, weaponName, gameConf, levelDist, hasLevelDist, consLabelOf, elemDist } from "./game.js"
import { comboRows, iconFallback } from "./sets.js"

export const CONS_COLORS = ["#c9bda3", "#dfc389", "#d9a95b", "#cd8e3c", "#bb7226", "#a4581f", "#8b3f13"]

const clampCons = (n) => Math.min(6, Math.max(0, Number(n) || 0))

export const consShortOf = (game = "gs") => (game === "sr" ? "魂" : "命")

export function summarizeCons(owners = []) {
  const consDist = [0, 0, 0, 0, 0, 0, 0]
  let consSum = 0
  let fullCount = 0
  let profileCount = 0
  for (const o of owners) {
    const c = clampCons(o?.cons)
    consDist[c]++
    consSum += c
    if (c >= 6) fullCount++
    if (o?.isProfile) profileCount++
  }
  const count = owners.length
  return {
    count,
    consDist,
    consSum,
    avgCons: count ? consSum / count : 0,
    fullCount,
    profileCount
  }
}

export function consStrip(consDist = [], count = 0) {
  return consDist.map((n, c) => ({
    c,
    n,
    w: count ? (n / count) * 100 : 0,
    color: CONS_COLORS[c]
  }))
}

function tally(list, getKey, makeItem, acc) {
  const map = new Map()
  for (const item of list) {
    if (!item) continue
    const key = getKey(item)
    if (!key) continue
    let row = map.get(key)
    if (!row) {
      row = makeItem(item)
      row.count = 0
      map.set(key, row)
    }
    row.count++
    if (acc) acc(row, item)
  }
  return [...map.values()]
}

export function buildOverview(scan = {}, opts = {}) {
  const game = opts.game || scan.game || "gs"
  const conf = gameConf(game)
  const total = scan.players?.length || 0
  const star = Number(opts.star) || 0
  const chars = (scan.chars || []).filter((c) => (c.owners?.length || 0) > 0)
  const rawFocus = Number(opts.focusCons)
  const focus = Number.isInteger(rawFocus) && rawFocus >= 0 && rawFocus <= 6 ? rawFocus : null
  const consShort = consShortOf(game)

  const allOwned = chars.length
  const picked = chars.filter((c) => !star || Number(c.star) === star)

  const list = picked.map((c) => {
    const sum = summarizeCons(c.owners)
    const elem = elemInfo(c.elem)
    const consCells = sum.consDist.map((n, k) => ({
      c: k,
      n,
      w: total ? (n / total) * 100 : 0,
      rateText: toPercent(total ? n / total : 0),
      color: CONS_COLORS[k],
      zero: n === 0
    }))
    const cell = focus === null ? null : consCells[focus]
    return {
      name: c.name,
      id: c.id,
      star: Number(c.star) || 4,
      stars: "★".repeat(Math.min(5, Number(c.star) || 4)),
      elem: elem.key,
      elemName: elem.name || c.elemName || "无",
      face: c.face || "",
      count: sum.count,
      rate: total ? sum.count / total : 0,
      rateText: toPercent(total ? sum.count / total : 0),
      avgCons: sum.avgCons,
      avgConsText: sum.avgCons.toFixed(1),
      fullCount: sum.fullCount,
      focusCount: cell ? cell.n : 0,
      focusRate: cell ? cell.n / (total || 1) : 0,
      focusRateText: cell ? cell.rateText : "0%",
      consCells
    }
  })

  if (focus === null) {
    list.sort((a, b) => b.star - a.star || b.rate - a.rate || b.count - a.count || a.id - b.id)
  } else {
    list.sort((a, b) => b.focusRate - a.focusRate || b.rate - a.rate || b.star - a.star || a.id - b.id)
  }

  const fiveOwned = chars.filter((c) => Number(c.star) === 5).length
  const fourOwned = chars.filter((c) => Number(c.star) !== 5).length

  return {
    game,
    gameName: conf.name,
    title: conf.title,
    consLabel: conf.consLabel,
    consShort,
    hasFocus: focus !== null,
    focus: focus === null ? -1 : focus,
    focusLabel: focus === null ? "" : `${consLabelOf(focus)}${consShort}`,
    scope: star === 5 ? "5" : star === 4 ? "4" : "all",
    scopeLabel: star === 5 ? "五星角色" : star === 4 ? "四星角色" : "全部角色",
    groupName: opts.groupName || "",
    groupNoMask: opts.groupNoMask || "",
    credit: opts.credit || { name: "ml-sgh-plugin", version: "", time: "" },
    total,
    allOwned,
    ownedCount: picked.length,
    fiveOwned,
    fourOwned,
    list
  }
}

export function buildDetail(scan = {}, meta = {}) {
  const game = meta.game || scan.game || "gs"
  const conf = gameConf(game)
  const total = scan.players?.length || 0
  const stat = (scan.chars || []).find((c) => c.name === meta.name) || { owners: [] }
  const owners = stat.owners || []
  const sum = summarizeCons(owners)
  const isTraveler = !!(meta.isTraveler ?? stat.isTraveler)

  const weapons = tally(
    owners.map((o) => o.weapon),
    (w) => w.name,
    (w) => ({ name: w.name, img: w.img || "", star: Number(w.star) || 4, affixSum: 0 }),
    (row, w) => (row.affixSum += Number(w.affix) || 0)
  )
    .map((w) => ({
      name: w.name,
      img: w.img,
      star: w.star,
      count: w.count,
      rateText: toPercent(sum.count ? w.count / sum.count : 0),
      affixText: w.count ? `R${(w.affixSum / w.count).toFixed(1)}` : "",
      rate: sum.count ? w.count / sum.count : 0
    }))
    .sort((a, b) => b.count - a.count || b.star - a.star || a.name.localeCompare(b.name))

  const setBuckets = { all: [], outer: [], inner: [] }
  for (const o of owners) {
    for (const row of comboRows(game, o.setList)) {
      const bucket = setBuckets[row.ring] || setBuckets.all
      bucket.push(row)
    }
  }
  const setBoard = (list) =>
    tally(
      list,
      (r) => r.label,
      (r) => ({ name: r.label, img: r.img || iconFallback(game) })
    )
      .map((s) => ({
        name: s.name,
        img: s.img,
        count: s.count,
        rate: sum.count ? s.count / sum.count : 0,
        rateText: toPercent(sum.count ? s.count / sum.count : 0)
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const consInfo = Object.entries(meta.cons || {})
    .map(([k, v]) => ({
      c: Number(k),
      name: v?.name || "",
      desc: (Array.isArray(v?.desc) ? v.desc.join("") : String(v?.desc || ""))
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    }))
    .filter((x) => x.c >= 1 && x.c <= 6 && (x.name || x.desc))
    .sort((a, b) => a.c - b.c)

  const consInfoMap = Object.fromEntries(consInfo.map((x) => [x.c, x]))
  const consMerged = consStrip(sum.consDist, sum.count).map((row) => {
    const info = consInfoMap[row.c]
    return {
      c: row.c,
      n: row.n,
      w: row.w,
      color: row.color,
      rateText: toPercent(sum.count ? row.n / sum.count : 0),
      name: row.c === 0 ? (meta.name || "") : (info?.name || ""),
      desc: info?.desc || ""
    }
  })

  const elem = elemInfo(meta.elem || stat.elem || "")
  const elems = isTraveler
    ? elemDist(owners, game).map((e) => ({
        ...e,
        rate: sum.count ? e.count / sum.count : 0,
        rateText: toPercent(sum.count ? e.count / sum.count : 0)
      }))
    : []

  return {
    game,
    gameName: conf.name,
    title: conf.title,
    consLabel: conf.consLabel,
    consShort: consShortOf(game),
    weaponLabel: conf.weaponLabel,
    relicLabel: conf.relicLabel,
    hero: {
      name: meta.name,
      title: meta.title || "",
      desc: meta.desc || "",
      star: Number(meta.star) || 5,
      stars: "★".repeat(Math.min(5, Number(meta.star) || 5)),
      elem: elem.key,
      elemName: meta.elemName || elem.name || "无",
      elemIcon: meta.elemIcon || "",
      typeIcon: meta.typeIcon || "",
      weapon: meta.weapon || "",
      weaponName: weaponName(meta.weapon),
      face: meta.face || stat.face || "",
      banner: meta.banner || meta.face || stat.face || "",
      artAnchor: Number.isFinite(Number(meta.artAnchor)) ? Number(meta.artAnchor) : 30,
      artZoom: Number.isFinite(Number(meta.artZoom)) && Number(meta.artZoom) >= 1 ? Number(meta.artZoom) : 1,
      birthday: meta.birthday || "",
      cncv: meta.cncv || "",
      astro: meta.astro || ""
    },
    groupName: meta.groupName || "",
    groupNoMask: meta.groupNoMask || "",
    credit: meta.credit || { name: "ml-sgh-plugin", version: "", time: "" },
    stat: {
      total,
      count: sum.count,
      rate: total ? sum.count / total : 0,
      rateText: toPercent(total ? sum.count / total : 0),
      avgConsText: sum.avgCons.toFixed(1),
      fullCount: sum.fullCount,
      fullRateText: toPercent(sum.count ? sum.fullCount / sum.count : 0),
      profileCount: sum.profileCount
    },
    isSr: game === "sr",
    isTraveler,
    elems,
    elemTotal: sum.count,
    hasLevels: hasLevelDist(game),
    levels: levelDist(owners, game).map((l) => ({
      ...l,
      rate: sum.count ? l.count / sum.count : 0,
      rateText: toPercent(sum.count ? l.count / sum.count : 0)
    })),
    consMerged,
    weapons: weapons.slice(0, 5),
    sets: setBoard(setBuckets.all).slice(0, 5),
    setsOuter: setBoard(setBuckets.outer).slice(0, 3),
    setsInner: setBoard(setBuckets.inner).slice(0, 3)
  }
}
