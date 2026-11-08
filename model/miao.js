/**
 * miao-plugin 资源 / 模型桥接
 *
 * 本插件不复制角色与武器数据，直接复用本机 miao-plugin 的：
 *   · models/index.js  —— Player / Character / Weapon / Artifact / ArtifactSet
 *   · resources/       —— 角色头像、立绘、武器图标、圣遗物图标、字体
 *
 * 注意：models/index.js 内部用 miao-plugin 自己 package.json 的 imports（#miao 等），
 * 必须用「文件 URL 绝对路径」动态 import，不能从本插件里直接 import "#miao"。
 */
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PLUGIN_NAME = "ml-sgh-plugin"

export const botRoot = () => process.cwd()
export const miaoDir = () => path.join(botRoot(), "plugins", "miao-plugin")
export const miaoResDir = () => path.join(miaoDir(), "resources")
export const selfResDir = () => path.join(botRoot(), "plugins", PLUGIN_NAME, "resources")

/** 本地绝对路径 -> file:// URL（中文目录名会被百分号编码，Chromium 能正常加载） */
export function toFileUrl(p = "") {
  let s = String(p).replace(/\\/g, "/")
  if (!s.startsWith("/")) s = "/" + s
  return "file://" + encodeURI(s)
}

let miaoMod = null
let loading = null

/**
 * 加载 miao-plugin 的 models
 * @returns {Promise<object>} { Player, Character, Weapon, Artifact, ArtifactSet, ProfileRank, ... }
 */
export async function loadMiao() {
  if (miaoMod) return miaoMod
  if (loading) return loading
  loading = (async () => {
    const entry = path.join(miaoDir(), "models", "index.js")
    const mod = await import(pathToFileURL(entry).href)
    miaoMod = mod
    return mod
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

/** miao 是否可用（用于给用户更准确的报错） */
export async function hasMiao() {
  try {
    await loadMiao()
    return true
  } catch (err) {
    globalThis.logger?.error?.(`[ml-sgh-plugin] 加载 miao-plugin 模型失败：${err?.stack || err}`)
    return false
  }
}
