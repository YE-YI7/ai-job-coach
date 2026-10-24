# 简历模板预存图与设计依据

2026-10-24。全部为虚构材料，不含用户简历或联系方式。

- `image-concepts.png`：本次使用内置 image 生成的六款视觉参考，不是最终 PDF 的截图，不作为真实性承诺。
- `template-gallery.png`：实际产品模板选择器，使用真实 PDF 的预存 WebP；姓名、正文仍是可选择的文字，不把图片当简历导出。
- `home-mobile.png`：修复重叠后的 390 × 844 实际浏览器截图。
- 线上预存图：`public/resume-templates/v1/`，六张共约 107 KB，已经压缩，不再经过 Next Image 动态转换；不需要实时模型调用。

生成设计图的提示词：

> A production-quality design reference contact sheet for six Chinese professional resume templates for YiZhi, a calm warm job-search mentor product. Landscape canvas, clean 3 columns by 2 rows, each tile one full flat front-facing A4 resume page with generous equal gutters, no perspective mockup, no props, no shadows outside paper, neutral warm-white background. Use fictional name 陈知远, role AI产品经理, no phone or email. All pages readable hierarchy, education, work experience, projects, skills, restrained bullet lists. The six variants in reading order: 1 classic black serif with centered name and traditional thin section rules; 2 modern blue-grey sans serif with left aligned name and clear full-width section headings; 3 warm editorial sans serif with brown headings and airy spacing; 4 compact professional sans serif in deep sage with dense but readable spacing and subtly tinted section heading strips; 5 literary editorial serif with large left-aligned name and crisp double rules above section headings; 6 elegant left-rail section labels in slate blue with continuous full-width body to the right, no complex multi-column content. Every page must remain a credible printable resume, no icons, badges, photos, progress bars, skills charts, colored large blocks or marketing copy. Small template labels below each page: 经典黑白, 简洁蓝灰, 温润纸感, 紧凑专业, 人文书页, 侧标履历. This is a visual concept sheet before implementing actual selectable-text PDF templates, not a screenshot of an existing app.

复现预存图：

1. `node scripts/prepare-resume-template-previews.mjs <绝对临时目录>` 生成与正式 `resumePrintHtml` 共用渲染器的六份 HTML 和来源清单。
2. 通过本机 HTTP 在真实 Chrome 打开；用浏览器打印引擎生成 PDF，保留背景，禁用页眉页脚。不能拿 image 设计稿冒充这个结果。
3. 检查实际 PDF 的页数、首尾文字和排版；本轮六份均为一页，提取均为 519 字符，姓名与末尾完整。
4. 用 Poppler 取 PDF 第一页为 420 × 594 PNG，再用 Sharp 转为 quality 88 WebP；清单记录文件及渲染器 SHA-256。预览资产契约测试会拦住渲染器更新后未同步图片的情况。

本轮未改 PDF 渲染器，不新增高风险多栏正文；生成概念中的个别表现（如浅色侧栏）并未直接照搬为最终 PDF。当前选择图以实际可输出的六种版式为准。
