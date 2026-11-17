# 面试设置递进试用

用户原话：「试试」。承接上一轮先看分隔背景、按任务关系组织交互的要求。本轮只试模拟面试设置，不把导师建议、复盘路径或全产品都改成向导。

入口：<http://127.0.0.1:3430/cockpit/preview?tab=interview&interviewDetail=1&interviewFlow=1>

对照：<http://127.0.0.1:3423/progressive-comparison.html>

## 行为

1. 先选几面（复用原RoundPicker，含自填和归一化）。
2. 轮次变为可回改摘要，再一起比较出题视角与题数。
3. 确认后显示实际设置与原开始按钮。确认本身不启动面试；可回改、不丢其他选择。

保留「用当前设置直接练」捷径；不假称跨会话记住上次设置。阶段轻入场与箭头悬浮响应，减少动态偏好下关闭。新组件仅管理展示阶段；真实选择仍归原父组件，原启动/历史/计费/保存回调不改。

## 边界

- 仅development + demo + explicit interviewFlow开关。正常正式/其他tab保持已发Qoder版，两侧不改。
- 当前首次出题没有接roundOrdinalLabel，实验文案不承诺轮次强度；未改后端或推断所有后续模型行为。
- 本轮本地示例启动已核，二面/项目深挖/5题正确展示；0付费模型调用/生产数据写入/部署/push。
- 这不是整个产品横线整改，也不是用户视觉验收。

## 证据与交接

完整本轮检查见根目录`design-qa.md`。全仓410套3729条、定点14条、类型lint及diff检查通过；9套31条既有条件跳过。图在`/Users/yi/Documents/Codex/yizhi-interview-detail-preview-20261117/progressive-*`。桌面1280×720与390手机宽度核过；原始Qoder对照也来自本机同组件，不冒新线上截图。

源码独立checkout：`/Users/yi/Documents/Codex/yizhi-qoder-release-20261117-1GLAtw/source`，分支`codex/qoder-center-release-1117`，HEAD175106e。本轮未提交；不要从其他共享脏树发布。3430开发服务保留供本人点看。等本人确认节奏与视觉，再决定是否接正式；上一轮上线授权不沿用。

## 后续本人认可与发布授权

本人随后明确：「可以，挺不错的，上线了。」本地试用阶段以上状态保留作历史；本轮把同一设置组件默认用于正式Qoder大厅，开发对照仍能显式关闭，preview路由的production404保护不变。只改默认展示门，不改出题、轮次语义、答案、历史、额度或费用。发布回执另见`2026-11-17-progressive-interview-setup-release.md`。
