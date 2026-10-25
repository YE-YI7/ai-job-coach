# Outfit 字体来源

## 简历 PDF 衬线字体（2026-10-25）

- `noto-serif-sc-print-{regular,semibold}.woff2` 来自 Google Fonts 的 Noto Serif SC TrueType 源，固定提交 `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`。
- 官方源：`https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoserifsc`。许可随附 `OFL-NotoSerifSC-Print.txt`，哈希与覆盖见 `noto-serif-sc-print.provenance.json`。
- 400 / 600 两个静态字重，避免本机 Chrome 把合成粗体或变量字重导出成 Type 3 路径。覆盖 GB2312 可编码字、拉丁、标点、货币、箭头、全角等共 8061 个码位；罕用字仍有设备回退，不宣称全 Unicode 或所有 ATS 都支持。
- 仅做字体实例化与标准字符集子集化，未更改正文字符或轮廓。两文件合计约 2.8 MB，仅衬线纸面需要，未增加外部字体请求或付费服务。

- 包：`@fontsource-variable/outfit@5.3.0`
- 原文件：https://cdn.jsdelivr.net/npm/@fontsource-variable/outfit@5.3.0/files/outfit-latin-wght-normal.woff2
- 仅重命名为 `outfit-latin-wght.woff2`，未修改内容。
- SHA-256：`6c18d579fd87c3776be068b762cbc83fde3acb543d49eabd3ade842eb987e887`
- 授权：SIL Open Font License 1.1；完整版权与许可随附 `OFL-Outfit.txt`。
- 许可来源：https://cdn.jsdelivr.net/npm/@fontsource-variable/outfit@5.3.0/LICENSE
- 仅覆盖西文字形；中文由设备可用的 Noto Sans SC / 苹方 / 微软雅黑等回退，不代表项目加载了 Noto Sans SC 网络字体。
