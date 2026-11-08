/**
 * 持有率统计聚合（纯函数，无 IO，便于单测）
 */
import { toPercent } from "./format.js"
import { elemInfo, weaponName, gameConf, levelDist, hasLevelDist, consLabelOf, elemDist } from "./game.js"
import { comboRows, iconFallback } from "./sets.js"

/** 命座 0~6 的色阶（浅 -> 深金，最浅一档也保证在米色底上可辨） */
export const CONS_COLORS = ["#c9bda3", "#dfc389", "#d9a95b", "#cd8e3c", "#bb7226", "#a4581f", "#8b3f13"]

const clampCons = (n) => Math.min(6, Math.max(0, Number(n) || 0))

/** 命座/星魂的短称（「均命 / 满命」 vs 「均魂 / 满魂」） */
export const consShortOf = (game = "gs") => (game === "sr" ? "魂" : "命")

/** 命座分布与均值 */
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

/** 把命座分布压成一条比例条 */
export function consStrip(consDist = [], count = 0) {
  return consDist.map((n, c) => ({
    c,
    n,
    w: count ? (n / count) * 100 : 0,
    color: CONS_COLORS[c]
  }))
}

/** 武器/套装按出现次数统计；acc(row, item) 用于累加衍生值 */
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

/**
 * 总览数据
 * @param {object} scan collectGroup 的返回值
 * @param {object} opts { game, star: 0|5|4, focusCons: -1|0-6, groupName, groupNoMask, credit }
 */
export function buildOverview(scan = {}, opts = {}) {
  const game = opts.game || scan.game || "gs"
  const conf = gameConf(game)
  const total = scan.players?.length || 0
  const star = Number(opts.star) || 0
  const chars = (scan.chars || []).filter((c) => (c.owners?.length || 0) > 0)
  // 按第几命排序（「零命」= 0，是有效值，所以用 -1 表示「不按命座排」）
  const rawFocus = Number(opts.focusCons)
  const focus = Number.isInteger(rawFocus) && rawFocus >= 0 && rawFocus <= 6 ? rawFocus : null
  const consShort = consShortOf(game)

  const allOwned = chars.length
  const picked = chars.filter((c) => !star || Number(c.star) === star)

  const list = picked.map((c) => {
    const sum = summarizeCons(c.owners)
    const elem = elemInfo(c.elem)
    // 每个命座各自的「群内持有率」= 该命座人数 / 参统成员数（7 段加起来正好等于整体持有率）
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
      /** 指定命座的人数 / 占比（焦点模式下卡片右上角显示的就是它） */
      focusCount: cell ? cell.n : 0,
      focusRate: cell ? cell.n / (total || 1) : 0,
      focusRateText: cell ? cell.rateText : "0%",
      consCells
    }
  })

  if (focus === null) {
    list.sort((a, b) => b.star - a.star || b.rate - a.rate || b.count - a.count || a.id - b.id)
  } else {
    // 焦点模式：严格按该命座持有率排（不能先按星级，否则四星永远垫底，看不出排名）
    list.sort((a, b) => b.focusRate - a.focusRate || b.rate - a.rate || b.star - a.star || a.id - b.id)
  }

  // 副标题要分开报五星 / 四星的数量（不是只在筛选时才分）
  const fiveOwned = chars.filter((c) => Number(c.star) === 5).length
  const fourOwned = chars.filter((c) => Number(c.star) !== 5).length

  return {
    game,
    gameName: conf.name,
    title: conf.title,
    consLabel: conf.consLabel,
    /** 命座/星魂的短称，用于卡片上的「均命 / 满命」小标签 */
    consShort,
    /** 焦点命座：-1 表示不按命座排序 */
    hasFocus: focus !== null,
    focus: focus === null ? -1 : focus,
    /** 「二命 / 满命」，用于标题徽章与卡片右上角 */
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

/**
 * 单角色详情
 * @param {object} scan collectChar 的返回值
 * @param {object} meta { game, name, title, desc, star, elem, elemName, isTraveler, weapon, face, banner, birthday, cncv, cons, astro }
 */
export function buildDetail(scan = {}, meta = {}) {
  const game = meta.game || scan.game || "gs"
  const conf = gameConf(game)
  const total = scan.players?.length || 0
  const stat = (scan.chars || []).find((c) => c.name === meta.name) || { owners: [] }
  const owners = stat.owners || []
  const sum = summarizeCons(owners)
  /** 旅行者：面板里按元素分成七种形态，单独给一块「七元素分布」 */
  const isTraveler = !!(meta.isTraveler ?? stat.isTraveler)

  // 武器穿戴统计
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

  // 套装统计：原神按组合标签（4件套写「绝缘4」，2+2 按两件套效果归成「2攻+2攻」）；
  //           星铁分成外圈（4件隧洞遗器）/ 内圈（2件位面饰品）两个榜
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

  // 命座/星魂信息（名称 + 效果，取 miao 的角色 meta）
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

  // 命座信息与分布融合：C0~C6 每行 = 分布 + 名称 + 效果（C0 用角色名）
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
  // 七元素分布：只统计持有者各自当前的共鸣形态（占持有者，不是占全群）
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
    /** 命座/星魂的短称（「满命 / 满魂」） */
    consShort: consShortOf(game),
    weaponLabel: conf.weaponLabel,
    relicLabel: conf.relicLabel,
    // 注意：键名不能叫 char —— art-template 编译模板时 char 会撞名（RuntimeError: char is not defined）
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
    /** 旅行者：详情页多一块「七元素分布」，命座取指定形态（默认冰） */
    isTraveler,
    elems,
    elemTotal: sum.count,
    /** 等级分布：只有原神有（星铁满级固定 80，分档没意义） */
    hasLevels: hasLevelDist(game),
    levels: levelDist(owners, game).map((l) => ({
      ...l,
      rate: sum.count ? l.count / sum.count : 0,
      rateText: toPercent(sum.count ? l.count / sum.count : 0)
    })),
    /** 命座信息与分布融合（C0~C6 每行 = 分布 + 名称 + 效果） */
    consMerged,
    weapons: weapons.slice(0, 5),
    /** 原神：单榜（4件套 / 2+2 归并后的标签） */
    sets: setBoard(setBuckets.all).slice(0, 5),
    /** 星铁：外圈隧洞遗器 / 内圈位面饰品，分开统计 */
    setsOuter: setBoard(setBuckets.outer).slice(0, 3),
    setsInner: setBoard(setBuckets.inner).slice(0, 3)
  }
}
