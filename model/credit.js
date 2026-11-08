/**
 * 出图署名信息
 *
 * 每张图底部都要写清「这张图出自哪个插件」，版本号直接读插件自己的 package.json，
 * 避免手写常量与 package.json 脱节。
 */
import fs from "node:fs"
import { PLUGIN_NAME } from "./miao.js"
import { timeText } from "./format.js"

/** 作者署名（图上固定展示） */
export const AUTHOR = "Mi1in"

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    return String(pkg.version || "1.0.0")
  } catch (err) {
    return "1.0.0"
  }
}

export const PLUGIN_VERSION = readVersion()

/** 模板里直接用 {{credit.version}} / {{credit.author}} / {{credit.time}} */
export function credit() {
  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    author: AUTHOR,
    time: timeText(new Date())
  }
}
