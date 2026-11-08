/**
 * 渲染封装
 *
 * 走框架自带 e.runtime.render（art-template + puppeteer），
 * 资源路径全部换成绝对 file:// URL，避免依赖框架计算的相对层级。
 */
import { PLUGIN_NAME, miaoResDir, selfResDir, toFileUrl } from "./miao.js"

export async function renderTpl(e, tpl, data = {}) {
  if (!e?.runtime?.render) {
    await e.reply("当前运行环境缺少图片渲染器，无法生成图片~")
    return false
  }
  const miaoRes = `${toFileUrl(miaoResDir())}/`
  const selfRes = `${toFileUrl(selfResDir())}/`
  const payload = { ...data, miaoRes, selfRes }

  // quality 只在 jpeg 下生效：模板里字号偏小，默认 90 会让边缘发糊，提到 96
  return e.runtime.render(PLUGIN_NAME, tpl, { ...payload, quality: 96 }, {
    retType: "default",
    beforeRender({ data: d }) {
      return { ...d, miaoRes, selfRes }
    }
  })
}
