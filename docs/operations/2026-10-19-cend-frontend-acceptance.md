# 2026-10-19 · Qoder C 端前端验收

## 发布边界

用户要求验收并上线 Qoder 的 C 端改动。仅修改导师栏及简历补问的输入区、设置入口与历史菜单；不改左栏、简历渲染/PDF、Agent、认证、数据库、支付或积分规则。不夹带本地未跟踪的真实 Eval JSON、截图和 Supabase 临时资料。

Qoder 去除了常驻模式与模型入口，但状态及调用仍存在。为避免隐藏选择无法更改，验收补上标题旁低频“辅导设置”；输入区仍仅保留语音与发送。已向用户说明该实现假设，未收到位置偏好的进一步答复。删除旧 ModelPicker 文件，保留既有模型目录、价格顺序与原调用参数，不触发自动发送。

## 本次修正

- 撤除 Qoder 重新引入的灰色聚焦边框，保留白色单层书写面与既有柔影。
- 历史菜单外点关闭、Escape 分层关闭、返回触发器焦点。
- 设置使用原生 top-layer popover，坐标限制视口内；修复窄屏被导师面板 overflow 裁切，支持关闭与监听清理。
- 手机输入 16px、语音和发送至少 44×44px；标题设置同样 44px。
- 简历补问动作位于输入面内，说明和题目仍在外面；保存失败不清空输入。

## 已完成的验收

- TypeScript 通过；AgentConversation/ResumeAgentConversation ESLint 无错误。CockpitApp 两条历史未使用变量警告未扩大修复。
- 4 套定向测试 31/31 通过。全量 2498 passed / 4 failed / 10 skipped；4 项均为此前已存在的 Manus、Greenhouse、Lever、Ashby 岗位导入失败，不放宽网络安全规则刷绿。
- Chrome 使用本机虚构、无数据库/密钥/模型的接口夹具验证：普通辅导失败保留输入；补问失败后重试成功，本地刷新恢复；历史 A/B 切换、外点与双层 Escape；设置切换模式/模型不发送；Escape 回焦。
- 实际 Cockpit preview 在桌面 1440×900 与手机 390×844 检查：左栏/纸面保持；手机文档宽度等于视口无横向溢出；设置在视口内完整显示；普通输入 font-size 16px、border/outline/inner shadow 均无，按钮实测 44×44px。
- Impeccable 自动 hooks 保持关闭，仅一次手动初检及一次必要复核。最终 339 条中 3 条 primary 均为未改动 CockpitApp 历史侧线/字体；无本次新增 primary。其余历史 advisory 未扩修，新增 13px 圆角已改为现有 12px。
- 夹具输入保存属于本机状态恢复，不冒充云端改稿或真实模型验收；PDF 渲染与云端保存链路本次未改，未重复发起模型或支付测试。

## 发布前原数据只读基线

统一口径 `md5(coalesce(string_agg(row_to_json(t)::text,'' order by t.id),''))`：旧作答 41 条 `0881efbb0a4a159ba1e7b5460c6007d8`；全站工作区 33 条 `10387ab8df982aabc46f6e5acd85d09f`；本人工作区 10 条 `ae949dcd2e71a2bd443842ed6af7e853`。本人 wallet/transfer/reservation 各 0 行。无业务写入或 schema 操作。

发布前正式部署 `dpl_2Tnu4P7EXiE67hp24R5bGdVhbnGy` / source `6d743b5`。待干净提交归档构建、候选验收后 promote 同一 Production 构建，再记录正式刷新与数据回读。
