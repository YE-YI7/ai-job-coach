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

待本地表驱动/真实Git回归、远端首次配置Preview与后续纯文档真实跳过证据、云端保留值回读及正式/旧数据核对。不能将脚本写完称为云端生效。
