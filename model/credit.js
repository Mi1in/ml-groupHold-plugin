import fs from "node:fs"
import { PLUGIN_NAME } from "./miao.js"
import { timeText } from "./format.js"

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

export function credit() {
  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    author: AUTHOR,
    time: timeText(new Date())
  }
}
