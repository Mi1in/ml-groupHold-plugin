# NOTICE / 第三方声明

本文件列出 ml-sgh-plugin 使用到的第三方项目与素材归属。本仓库采用 MIT 协议，见 [LICENSE](LICENSE)。

## 本仓库不含第三方素材

ml-sgh-plugin **不附带任何角色数据、立绘、图标、字体或其他游戏素材的二进制文件**。所有素材在运行时从使用者本机已安装的 `plugins/miao-plugin/resources/` 读取；本仓库不提供下载渠道、镜像、token 或绕过方式。

## miao-plugin

角色元数据（名称、命座、简介、星级、元素、武器）、角色立绘与头像、武器 / 套装图标、字体均来自
[miao-plugin](https://github.com/yoimiya-kokomi/miao-plugin)，MIT 协议，Copyright (c) 2023 Yoimiya。

本插件通过动态 `import()` 调用其 `models`（`Character` / `Player` / `ProfileRank` 等）并引用其资源相对路径，**未复制其源码或资源文件**。

以下为 miao-plugin 的 MIT 协议全文，按其要求随本项目一并保留：

```
MIT License

Copyright (c) 2023 Yoimiya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Yunzai-Bot

本插件运行于 [Yunzai-Bot](https://github.com/Le-niao/Yunzai-Bot)（GPL-3.0），仅在运行时调用框架提供的 `plugin` 基类、`logger`、`e.reply` 等 API，未复制或改写框架源码，也未在仓库内分发框架文件。使用者将其与本插件组合使用时，应自行遵守框架协议。

## 游戏素材

原神、崩坏：星穹铁道相关角色名称、立绘、图标等版权归上海米哈游网络科技股份有限公司及其关联方所有。本仓库不附带、不分发上述素材，仅在运行时读取使用者本机已安装的资源；本插件代码按 MIT 授权，涉及游戏素材的商业使用需自行取得权利方授权。如涉及侵权，请联系删除。

## 署名

出图页脚保留 `Design by Mi1in` 与插件版本信息，插件名为 `ml-sgh-plugin`。
