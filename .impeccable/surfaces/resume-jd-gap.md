---
version: 1
slug: "resume-jd-gap"
primary_target: "app/tools/resume-jd-gap/ResumeJdGapClient.tsx"
related_targets: ["app/tools/resume-jd-gap/ResumeJdGap.module.css"]
---

Mode: Operate. First-time job seekers compare two existing materials and leave with a usable evidence checklist before choosing AI coaching.
Direction: narrow code-led refinement. Preserve warm paper, ink, sparse orange actions, existing Outfit/Chinese font fallback, deterministic matcher and career workflow. No new global design system or replacement of cockpit/resume/interview features.
Layout: one white editing workspace, no nested output cards. Desktop paired editors and action/evidence columns; mobile single column. Header 34–52px, body 15–16px, supporting copy 13–14px are route-specific readable scales, not cockpit token replacements.
States: explicit sample label, local live calculation, undo for replacing materials, invalid-input preservation, current-result download/copy, clipboard recovery, auth-required coaching with truthful material boundary.
Focus: neutral bottom rule on textareas; neutral 2px outlines on keyboard controls. No orange square inner textarea borders. Text/placeholder contrast at least 4.5:1, targets at least 44px, reduced-motion scroll honored.
Color adjustments are local tonal variants for contrast (#606570 secondary, #ad461d action, #28684e evidence), not new brand semantics. DESIGN.md advisory drift predates this route and is not globally repaired.
Data: user material remains React memory only. Export is local and explicit; no material in telemetry. Sample use is separate from user-edited material use.
Finish: screenshots, real task interactions, manual detect, independent finish reviewer and documenter; production domain acceptance after promotion.

## Direction contract · 2026-10-21 public explanation extension

THESIS：在既有本地对照下补足可以独立阅读的使用方法和完整案例，不把确定性词面结果说成ATS评分或能力验证。

OWN-WORLD：沿用本路由暖纸底、无衬线与细行线，说明按连续文章排版，不新增图像、卡片墙或全局token。

STORY：用户先试示例与输入，再读门槛→真实经历→结果的顺序，最后通过一个A/B案例分清已知事实和下一问。材料不自动上传，刷新清空。

FIRST VIEWPORT：保留原工具的双输入面、动作与隐私说明，只加就近方法锚点；方法区置于结果之后，最大920px，桌面标签/正文两列，手机纵排。

FORM：已批准的狭窄扩展，seed不适用；代码驱动，不另做新世界选图。交互复用实际结果展开、复制/下载与减少动态效果规则。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance。
