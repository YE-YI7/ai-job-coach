---
name: 益职 AI
description: 温暖、清醒、可靠的求职作战工作台
colors:
  action-orange: "#eb6b2b"
  action-orange-deep: "#c94f17"
  action-orange-soft: "#fff0e7"
  guidance-blue: "#536fe8"
  guidance-blue-soft: "#eef1ff"
  evidence-green: "#2d8a61"
  warning-amber: "#a66b17"
  ink: "#24272f"
  text-muted: "#69707d"
  line: "#e7e5e1"
  paper: "#fbfaf8"
  rail: "#f7f5f1"
  surface: "#ffffff"
typography:
  display:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(28px, 3vw, 42px)"
    fontWeight: 760
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  editorial:
    fontFamily: "Songti SC, Noto Serif SC, STSong, serif"
    fontSize: "clamp(32px, 3.4vw, 42px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 760
    lineHeight: 1.4
  body:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  control: "10px"
  card: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "14px"
  md: "22px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-orange}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "37px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "25px 27px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "39px"
---

# Design System: 益职 AI

## Overview

**Creative North Star: “温暖的求职作战桌”**

益职不是营销落地页，也不是游戏化闯关。它像一张整理有序、持续更新的求职作战桌：暖白环境降低压力，橙色只推动关键行动，蓝色提示 Agent 判断，绿色表达已确认的证据。

界面保持亲和但不幼态。复杂信息主要依靠连续的阅读顺序、细边界和稳定网格组织，而不是大面积渐变、装饰光斑或堆叠阴影。

**Key Characteristics:**

- 暖白底、白色工作表面、深色正文。
- 橙色负责行动，蓝绿负责信息和证据语义。
- 中等圆角、细边界、克制阴影。
- 岗位机会是所有页面和状态的主线。
- 公开首页与执行手册可以扩大字号、拉开明暗对比，但不得改变颜色语义或工作台的证据优先级。

## Colors

主色温暖但低占比，状态色必须同时配文字标签，不能只靠颜色传意。

### Primary

- **行动橙**（#eb6b2b）：主按钮、当前标签下划线和需要用户决策的少量强调。
- **柔和橙纸**（#fff0e7）：建议、待处理标签的低强度底色。

### Secondary

- **引导蓝**（#536fe8）：Agent 提示和阶段状态。
- **证据绿**（#2d8a61）：强证据、完成与同步成功。

### Neutral

- **清醒墨色**（#24272f）：标题和正文主信息。
- **说明灰**（#69707d）：时间、来源、解释文本。
- **暖灰线**（#e7e5e1）：结构分隔与卡片边界。
- **暖纸底**（#fbfaf8 / #f7f5f1）：正文背景与左右工作栏。

**The Sparse Accent Rule.** 橙色只服务当前行动和关键结论，不铺满页面。

### Public Route Palette

公开首页与 Agent 执行手册使用一组路由内的轻微色调校准：行动橙（#e9672d）、深行动橙（#b94719）、说明灰（#666d79）和暖灰线（#e3dfd8）；首页的作战盘示意另用暖灰栏（#f5f2ed）。它们继续承担既有的行动、说明、边界和工作栏语义，不替换工作台的全局色板。首页 Agent 运行时直接使用清醒墨色作为整块背景，以表现运行边界，而不是创造新的暗色语义。

**The Semantic Continuity Rule.** 公开路由可以调节同一色族的明度与对比，但橙、蓝、绿仍分别只表达行动、引导与证据。

## Typography

**Display Font:** Noto Sans SC（PingFang SC / Microsoft YaHei / system sans 回退）
**Editorial Font:** Songti SC（Noto Serif SC / STSong / serif 回退）
**Body Font:** Noto Sans SC（同回退）

**Character:** 中文标题紧凑、坚定；正文清晰克制。宋体只用于当天最重要任务和导师建议，用编辑感拉开“判断”与“控件”的语气；导航、数据、按钮和普通区域标题继续使用无衬线字体。

### Hierarchy

- **Display**（760，28–42px，1.08）：岗位名称，一屏只出现一次。
- **Editorial**（700，32–42px，1.18）：当天核心任务，以及导师建议中的一句关键判断。
- **Title**（760，15px）：区域标题和栏标题。
- **Body**（400，11–12px，1.6）：解释、证据与行动原因。
- **Label**（700，9–10px）：状态、来源和辅助元数据。

### Public Surface Scale

公开首页沿用同一无衬线字体栈，把首屏主张扩展到 44–72px、820 字重；Agent 执行手册的入口标题扩展到 48–80px，正文保持 12–14px 的长文阅读密度。它们是 Persuade / Read 路由为建立阅读顺序而使用的局部尺度，不替代工作台 28–42px 的显示层级。

**The Route Intent Rule.** 大字号只属于需要先说服或建立执行上下文的公开路由；进入作战盘后回到紧凑、可扫描的信息尺度。

## Layout

桌面端采用“机会列表 / 岗位档案 / 今日行动”三栏，中心档案获得主要宽度。左右栏独立滚动，中心内容以 32px 垂直节奏推进。900px 以下左右栏改为抽屉；640px 以下压缩标题和内容内边距，并把表格式证据、简历差异改为单列。

## Elevation & Depth

系统以边界和表面色差建立深度。常规内容卡片只用 1px 暖灰边界；阴影保留给顶部悬浮、移动抽屉和极少数可操作浮层，必须带真实偏移和软模糊。

## Shapes

内容容器使用 14–16px 圆角，搜索和按钮使用 8–11px 圆角。胶囊只用于短状态和数量，不能包裹长句或普通卡片。边界始终细而克制。

首页的双运行时选择器使用 20px 外轮廓，官方 logo 在首屏可使用 22px 圆角形成独立品牌物件；内部控件仍遵守 7–12px 的紧凑圆角。Agent 执行手册的规则框、边界摘要和折叠列表保持直角或极小圆角，以维持“执行规范”而非“营销卡片”的语气。这些都是路由级扩展，不上调工作台的默认圆角。

## Components

### Buttons

- **Primary:** 行动橙底、白字、10px 圆角，文案明确动作。
- **Secondary:** 白底、暖灰边界、深色文字。
- **Focus:** 3px 半透明橙色焦点环，不能只改变颜色。

### Chips

- **Style:** 语义浅色底配同色深文字；所有状态都保留文字标签。

### Cards / Containers

- **Corner Style:** 14–16px。
- **Background:** 白色或非常浅的语义色。
- **Border:** 1px 暖灰线；不使用侧边色条。
- **Internal Padding:** 桌面 25–27px，手机 18–22px。

### Inputs / Fields

- **Style:** 白底、1px 暖灰边界、10–11px 圆角。
- **Focus:** 清晰橙色外环；输入内容保持深色高对比。

### Navigation

岗位机会是左侧主导航。当前项以白色表面和暖橙边界识别；岗位内部用水平标签导航，当前标签使用细橙色下划线。移动端通过顶部两个图标按钮打开机会和行动抽屉。

### Two-runtime Chooser

首页专用的“双运行时选择器”是一张连续、上下堆叠的选择表面，而不是两张并列套餐卡。上层用柔和橙纸承载付费托管网页版，下层用清醒墨色承载益职免费的本地 Agent 版；两层都必须在首屏直接暴露动作。选择器和后续对比表使用同一组四项事实：模型由谁提供、益职是否收费、材料默认在哪里、作战盘在哪里。

移动端保持先网页、后 Agent 的堆叠顺序，并让两个主动作都占满可用宽度。深色 Agent 区域是用于区分运行边界的局部高对比平面，不是新的全站暗色主题。

## Do's and Don'ts

### Do:

- **Do** 让一个屏幕快速回答“当前机会是什么、判断是什么、下一步是什么”。
- **Do** 用暖白表面、细边界和稳定留白组织高密度信息。
- **Do** 为演示数据、待确认事实和真实用户数据提供清晰标签。
- **Do** 在首页把模型提供方、益职费用、材料位置和作战盘位置作为完整证据组呈现。
- **Do** 让 Agent 执行手册把用户保持在求职者角色，由读取页面的 Agent 承担安装、接通和验证。

### Don't:

- **Don't** 使用大面积彩色渐变、光斑或营销式玻璃效果。
- **Don't** 用游戏关卡、虚假精确分数或夸张成功率制造激励。
- **Don't** 把每个信息块都做成带阴影的卡片，也不要嵌套卡片。
- **Don't** 把首页的墨色运行时平面或超大标题无条件带入高密度作战盘。
- **Don't** 把“益职免费”写成 Agent 宿主免费，也不要补写未经确认的价格、指标或用户背书。
