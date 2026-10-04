# 图匣 · 批量取图

一键抓出当前网页的全部图片（含懒加载、CSS 背景图），按尺寸 / 格式 / 关键词过滤，单选或批量下载。

无广告、无追踪、零账号。原生 JS + Manifest V3，无构建链，解压即装。

## 安装（Edge / Chrome 开发者模式）

1. 打开 `edge://extensions/`
2. 左侧打开「**开发人员模式**」
3. 点「**加载解压缩的扩展**」，选择本文件夹（含 `manifest.json` 的这层）
4. 工具栏出现「图匣」图标（可固定）

详细图文步骤见 `安装指南.html`。

## 使用

- 点工具栏图标 → 自动扫描当前页
- 长页面 / 懒加载页面：勾「滚动后再扫」→「重扫」
- 过滤：格式、最小尺寸（默认 ≥150px）、URL 关键词
- 「下载所选」→ 存到 `下载/图匣/<域名>_<时间戳>/`
- 单张：hover 图片，右下角 `↓` 下载 / `↗` 打开原图

## 权限说明

| 权限 | 用途 |
|------|------|
| activeTab | 点图标时才向当前页注入扫描器 |
| scripting | 注入 `scanner.js` |
| downloads | 批量保存图片 |

不申请 host_permissions，无任何后台联网，不收集任何数据。

## 文件结构

```
manifest.json   扩展清单（MV3）
popup.html/.css/.js   弹窗界面
scanner.js      页面图片扫描器（按需注入）
background.js   下载队列 service worker
icons/          图标（assets/make_icons.py 生成）
安装指南.html    图文安装步骤
v1.0需求.md      需求与调研结论
```

## License

MIT
