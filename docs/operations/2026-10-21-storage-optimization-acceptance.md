# 部署存储优化执行记录

2026-10-21（America/Los_Angeles）。授权：先做纯文档跳构建/减少重复与预览保留一周，保护当前正式及上一稳定版，不购买服务、不动旧作答和积分。不是函数依赖瘦身授权。

## 固定保护

- 当前正式：bb70d9c / `dpl_FZGGjoTQZhMwvQ9DvJ2yWmicmKbj`。
- 上一稳定：e7f6cb5 / `dpl_9d3XJNTbQqBoaffrjohy4fK8fTCs`。
- 两者均为Production，本轮不重新构建/提升正式、不降低Production30天、不改其别名、不手工删除部署。只将本项目Pre-Production30天改7天，其他项目和Canceled/Errored不变。

## 构建规则

`scripts/vercel-ignore-build.mjs`：只对白名单内文档路径跳过。使用Vercel该项目/分支上次成功部署SHA比较完整范围；不按HEAD^猜边界。无基准、浅克隆缺历史、历史分叉、当前checkout不匹配、空diff或Git错误一律继续构建。`VERCEL_FORCE_BUILD=1`可显式继续。代码、知识库markdown、data、运行时eval夹具、配置、锁文件与未知路径均构建，删除/改名同样检查。

仅 `codex/production-release` 专用发布分支禁Git自动部署；普通开发/PR分支仍有Preview，不断开Git、不关闭保护。今后正式发布先把已验提交推到该分支，再从同提交干净快照执行暂存Production→验收→promote，禁止再从普通工作分支另造同代码正式包。本轮不需要发布新应用代码，正式仍bb70d9c。

## 验收状态

本地5组测试通过，包含真实临时Git仓库的多提交push、改名/删除与中文/空格/换行文件名；首次测试发现白名单`.`不匹配换行文件名，已补`s`标记并复测，不把该本地失败冒充线上错误。lint通过。全部测试只写自身临时夹具。

实施提交63ad726已推原工作分支，仅7明确文件，未混Cursor的打印/全局设计/模板偏好和日检未提交文件。Vercel自动Preview `dpl_Dc7LYhtq5FJxtNuFFjZpvLszN8Co` / ijvoxgnkj… READY，日志17:15:37 UTC明确执行`node scripts/vercel-ignore-build.mjs`，返回`build/runtime-or-unknown-change/changedFiles:7`；随后完整构建成功，正向控制证明配置/脚本变更没有被当文档跳过。无手工Production构建或正式提升。

保留设置通过益职项目UI仅修改Pre-Production为1 week，保存后API回读 `expirationDays:7, expirationDaysProduction:30, expirationDaysCanceled:30, expirationDaysErrored:30, deploymentsToKeep:10`。没有改团队所有项目，没有手工删除部署；历史Preview可能按平台规则进入删除/恢复期，不能承诺窗口用量立即减少。正式与上稳Production不在缩短范围，最新READY回读都在。

本报告下一次提交只改此markdown，用作真实纯文档负向控制；待其实际日志回显后再本地补结果，不提前称已跳过。
