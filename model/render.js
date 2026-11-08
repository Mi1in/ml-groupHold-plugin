import { PLUGIN_NAME, miaoResDir, selfResDir, toFileUrl } from "./miao.js"

export async function renderTpl(e, tpl, data = {}) {
  if (!e?.runtime?.render) {
    await e.reply("当前运行环境缺少图片渲染器，无法生成图片~")
    return false
  }
  const miaoRes = `${toFileUrl(miaoResDir())}/`
  const selfRes = `${toFileUrl(selfResDir())}/`
  const payload = { ...data, miaoRes, selfRes }

  return e.runtime.render(PLUGIN_NAME, tpl, { ...payload, quality: 96 }, {
    retType: "default",
    beforeRender({ data: d }) {
      return { ...d, miaoRes, selfRes }
    }
  })
}
