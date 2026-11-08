/**
 * 数字格式化（纯函数）
 */

/** 0.8571 -> "85.7%"；0 -> "0%"；1 -> "100%" */
export function toPercent(rate, digits = 1) {
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= 0) return "0%"
  if (n >= 1) return "100%"
  const v = n * 100
  const fixed = v.toFixed(digits)
  // 去掉多余的 .0，避免 "66.0%" 这种观感
  return `${fixed.replace(/\.0+$/, "")}%`
}

/** 取整或保留一位小数，去掉尾部 .0 */
export function num(v, digits = 1) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "0"
  const fixed = n.toFixed(digits)
  return fixed.replace(/\.0+$/, "")
}

/**
 * 群号打码（保留头尾，中间固定 3 个星号）
 *   123456789 -> 123***789
 *   12345678  -> 123***678 前的规则同样成立
 *   12345     -> 12***45
 *   1234      -> 1***
 */
export function maskId(id = "") {
  const s = String(id ?? "").replace(/\D/g, "")
  if (!s) return ""
  if (s.length <= 4) return `${s.slice(0, 1)}***`
  if (s.length <= 6) return `${s.slice(0, 2)}***${s.slice(-2)}`
  return `${s.slice(0, 3)}***${s.slice(-3)}`
}

/** 2026-11-07 21:05 */
export function timeText(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ""
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
