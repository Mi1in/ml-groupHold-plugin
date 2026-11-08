import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)

const EXEC_OPTS = { timeout: 60000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }

let running = false

async function git(cwd, args) {
  try {
    const { stdout = "", stderr = "" } = await run("git", args, { cwd, ...EXEC_OPTS })
    return { ok: true, out: String(stdout).trim(), err: String(stderr).trim() }
  } catch (err) {
    return {
      ok: false,
      out: String(err?.stdout || "").trim(),
      err: String(err?.stderr || err?.message || "").trim()
    }
  }
}

const short = (sha = "") => String(sha).slice(0, 7)

function reasonOf(text = "") {
  if (/ENOENT|not recognized|不是内部或外部命令|command not found/i.test(text)) return "没有找到 git 命令，请先安装 git"
  if (/not a git repository/i.test(text)) return "当前插件不是通过 git 安装的，无法自动更新"
  if (/could not read Username|Authentication failed|Permission denied|publickey/i.test(text)) {
    return "仓库认证未通过，请检查访问权限"
  }
  if (/local changes|Please commit your changes|would be overwritten|unmerged/i.test(text)) {
    return "插件目录里有未提交的修改，已中止更新"
  }
  if (/CONFLICT|Merge conflict/i.test(text)) return "代码存在冲突，已中止更新"
  if (/Could not resolve host|unable to access|Failed to connect|Connection timed out|Operation timed out/i.test(text)) {
    return "网络连接失败，请检查网络后重试"
  }
  if (/SSL certificate|local issuer|certificate verify failed/i.test(text)) return "HTTPS 证书校验失败"
  if (/index\.lock|Another git process/i.test(text)) return "git 正被其他操作占用，请稍后再试"
  if (/no tracking information|no upstream/i.test(text)) return "当前分支没有跟踪远程分支"
  return "git 返回了错误"
}

async function pull(dir) {
  let r = await git(dir, ["pull", "--ff-only"])
  if (r.ok) return r
  if (/SSL certificate|local issuer|certificate verify failed/i.test(r.err)) {
    r = await git(dir, ["-c", "http.sslVerify=false", "pull", "--ff-only"])
    if (r.ok) return r
  }
  if (/no tracking information|no upstream/i.test(r.err)) {
    r = await git(dir, ["pull", "--ff-only", "origin", "main"])
  }
  return r
}

export async function updatePlugin(dir) {
  if (running) return { status: "fail", reason: "上一次更新还没结束，请稍等一下" }
  running = true
  try {
    const head = await git(dir, ["rev-parse", "HEAD"])
    if (!head.ok) return { status: "fail", reason: reasonOf(head.err), detail: head.err }
    const before = head.out

    const pulled = await pull(dir)
    if (!pulled.ok) return { status: "fail", reason: reasonOf(pulled.err), detail: pulled.err, before }

    const after = (await git(dir, ["rev-parse", "HEAD"])).out || before
    if (after === before) return { status: "latest", before, after }

    const log = await git(dir, ["log", "--oneline", "--no-decorate", `${before}..${after}`])
    const commits = log.ok ? log.out.split("\n").filter(Boolean) : []
    return { status: "updated", before, after, commits }
  } finally {
    running = false
  }
}

export function updateReply(result = {}) {
  if (result.status === "latest") {
    return `插件已是最新版本（${short(result.after)}），不需要更新~`
  }
  if (result.status === "updated") {
    const lines = [`插件更新完成：${short(result.before)} → ${short(result.after)}`]
    if (result.commits.length) {
      lines.push(`本次拉取 ${result.commits.length} 个提交：`)
      for (const c of result.commits.slice(0, 8)) lines.push(`· ${c}`)
      if (result.commits.length > 8) lines.push(`· 还有 ${result.commits.length - 8} 个提交未列出`)
    }
    lines.push("请重启云崽，让新版本生效~")
    return lines.join("\n")
  }
  const lines = [`更新失败：${result.reason || "未知原因"}`]
  if (result.reason === "git 返回了错误" && result.detail) {
    lines.push(...String(result.detail).split("\n").filter(Boolean).slice(0, 4))
  }
  return lines.join("\n")
}
