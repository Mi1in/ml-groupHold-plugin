import path from "node:path"
import { pathToFileURL } from "node:url"

export const PLUGIN_NAME = "ml-sgh-plugin"

export const botRoot = () => process.cwd()
export const miaoDir = () => path.join(botRoot(), "plugins", "miao-plugin")
export const miaoResDir = () => path.join(miaoDir(), "resources")
export const selfResDir = () => path.join(botRoot(), "plugins", PLUGIN_NAME, "resources")

export function toFileUrl(p = "") {
  let s = String(p).replace(/\\/g, "/")
  if (!s.startsWith("/")) s = "/" + s
  return "file://" + encodeURI(s)
}

let miaoMod = null
let loading = null

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

export async function hasMiao() {
  try {
    await loadMiao()
    return true
  } catch (err) {
    globalThis.logger?.error?.(`[ml-sgh-plugin] 加载 miao-plugin 模型失败：${err?.stack || err}`)
    return false
  }
}
