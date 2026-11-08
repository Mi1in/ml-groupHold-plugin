/**
 * ml-sgh-plugin
 * 群成员角色持有率统计（角色 / 命座 / 武器 / 圣遗物）
 *
 * 只导出 apps，避免框架把导出的普通函数当作插件类实例化。
 */
import holdRate from "./apps/hold.js"

export const apps = { holdRate }
