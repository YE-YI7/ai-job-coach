# 输入细节、登录落点与原账号手机号关联

2026-10-18。运行提交 `2a7ba73` 与 `be3dd2f`。本报告区分本地交互、数据库事务检查和真实短信；未用前两者冒充短信验收。

## 用户要求与参考

用户否决中性灰色输入框，要求参考奇思喵想的细节与交互动效，同时修复登录被送旧引导和未绑定手机号生成空账号的问题。保留已认可的左栏、原件、纸面/PDF几何及旧作答。

本轮 Chrome 重新浏览奇思喵想动效分类与“输入”搜索结果。现有 Chrome 登录已过期，点击详情会要求登录，没有绕过。实际观察公开预览 `work_1228.mp4` 的发送/失败状态、`work_1118.mp4` 的文件夹展开中间态，以及 `work_1183_01.png` 的输入面和紧邻菜单。观察的是分段状态和公开预览，不声称完整体验登录后案例或复刻精确缓动。借鉴对象连续、操作贴近对象、白色书写面与偏移柔影，没有复制作品资产。

## 已实现

- 文本焦点去除灰色/彩色环和底线；白色写作面、光标和轻微偏移阴影给局部反馈。手机号复合输入只有一个外层表面，内层不再重复焦点框。按钮、链接、复选框仍有键盘指示，错误边界不被普通状态覆盖。
- 原位编辑、采纳弹层、短信步骤及实际保存确认使用短过渡。保存动画只跟随真实派生的 saved 状态，不提前显示完成；采纳只称“已采纳”，不称云端已保存。新增动态有 reduced-motion 退出路径。
- 一句可关闭的首次提示为“点选正文，再点‘编辑’”，使用或关闭后记住；存储不可用不阻塞操作。采纳/保留反馈停留在原弹层位置并限于视口内，滚动/缩放后消失；live region 不按消息重建。
- 手机、邮箱/邀请码和观猹成功登录共用安全落点：默认 `/cockpit`；明确的内部目标保留。三个旧 onboarding 路由变为兼容跳转，不再更新用户画像。
- `/account/phone?recover=1` 先要求登录原账号，再显式同意短信验证。新建手机号账号只有在无内容、无付费额度、默认免费配额且身份纯 phone 时，才能把经过验证码验证的号码关联到原账号。不删除账号、不移动简历/作答、不合并余额。已失去号码的纯手机号会话不能继续作为有效身份使用。

## 验证证据

- 9 套定向回归：76 通过、1 可选项跳过；类型检查与本地构建通过。改动文件 lint 无新增 error；旧登录页 img 与工作台两个未用变量 warning 保留。
- 全量 Jest 使用 `NODE_OPTIONS=--experimental-vm-modules`：2382 通过、9 跳过、4 个既有 JD 链接导入断言失败（Manus/Greenhouse/Lever/Ashby）。不称全绿；首次未加 VM 参数的 PDF 环境失败已按正确运行方式复核通过。
- 迁移 `20261018074409_verified_phone_recovery` 已实际应用，生产 schema 快照已按 information_schema 更新。新增审计表启用 RLS，匿名/普通用户不可读写或执行恢复函数；只有服务端角色可调用。
- `supabase/tests/phone_recovery.sql` 在真实数据库事务内使用虚构用户和模拟 provider PASS：用途/原账号检查、浏览器证明、重复 claim busy、未授权 recovery 标记、错误 lease/验证码、内容/付费拒绝、service_role 成功关联、目标其余列/额度不变、审计及重放拒绝均通过，最后回滚。不是阿里云真实短信测试。
- Chrome 本地实际原位编辑、按钮键盘焦点、关闭提示/刷新不重复、390px 无横溢出、就地采纳/可撤销反馈均检查；减弱动态下 iframe editor 的 animation-name 为 none。没有提交用户简历或触发模型。虚构预览本身刷新重置，不把它说成云端保存。
- 手动 Impeccable detect 一次，扫描含大量全文件历史令牌/风格告警；未扩大历史修复、不重新启用自动钩子、不宣称零告警。独立复核先要求重拍编辑输入，后指出引导文案和离屏反馈两项；均修复并回审为 resolved，disposition=ship 仅限这两项修复范围。
- 截图保留 `.impeccable/review/detail-recovery-20261018/`，属于虚构组件交互及真实登录表面证据，不含用户作答或凭证。

## 数据与剩余边界

迁移和事务检查前后，`interview_answers` 都为 41 条；同一 `md5(string_agg(row_to_json(a)::text,'' order by a.id))` 为 `0881efbb0a4a159ba1e7b5460c6007d8`。用户数 57、正式恢复审计 0。没有改绑当前用户、注销其会话、读取完整号码/OTP/密钥、充值或自动发送短信。

本人原账号认证、亲自输入号码/验证码并提交关联之后，才能完成该号码登录及刷新同一旧身份的真实闭环。不能把历史“已绑定账号的短信登录通过”当成这次恢复路径也通过。

## 发布记录

第一份 Production staged build `dpl_1PoGihg5wZ9mBjaX7QogDRDJvvFi` 的实际 Chrome 路径暴露同页恢复链接缺陷：URL 已更新，但 LoginClient 保留手机号方式的 useState。该构建没有 promote。`be3dd2f` 加入按明确 method 参数区分的 LoginRoute key，并在清理 OAuth 错误时保留 email method；类型、改动 lint 及 27 项登录回归通过。

最终 Production `--skip-domain` 构建 `dpl_7tmQ7vsWuiskwstvnuvkg3ctZcgn`（https://ai-job-coach-7bfnbbq0n-velmavalienteqejimu22-jpgs-projects.vercel.app）READY。Chrome 实际从手机号页激活“用原账号继续”，邮箱方式成为 pressed，邮箱输入可见，观猹链接保留恢复目标。没有只校验 href。

切换前再次确认正式裸域仍指向旧 `dpl_9WchAcdrfhRNnF2Lq5LfyHLBD3Gp`，没有覆盖另一会话的新版本；随后 promote 同一已测最终构建。裸域和 www 的 health 均 HTTP 200 / database ok。

正式 Chrome 已完成：旧 `/onboarding` → `/cockpit`，显示原有 8 个岗位；从“找回原来的工作区”选择原观猹账号，走正常已有授权回到 `/account/phone?recover=1`；只读会话端点确认身份是原 Watcha 用户，不是新手机号用户。真实导师输入聚焦时 textarea 与 form 的 outline 都 none，输入仅有新偏移柔影；未输入、提交或改动其简历/作答。真实恢复页保留空号码、未勾同意状态，已交本人输入号码/OTP并提交，当前未发送新短信、未产生正式恢复审计，完整关联后的手机号登录/刷新尚待本人这一步，不宣称通过。

手机输入的 Production 构建中内层 outline/shadow 为 none、外层 border 为 0，只有偏移柔影；Tab 到复选框仍有 2px 键盘提示，390px innerWidth/scrollWidth 都为 390，临时视口 override 已清理。真实焦点截图只留本机 `/tmp/yizhi-live-writing-detail.png` 与空手机号恢复页 `/tmp/yizhi-original-account-phone-recovery.png`，不提交真实资料图片。该次正式截图还见导师栏按钮在现有窄宽度下贴近右缘；本轮未改其尺寸与布局，不作为全工作台质量通过。

### Deploy Result

- URL： https://www.ai-job-coach.xin （裸域同构建）
- Target / Status：production / READY
- Runtime commit：`be3dd2f`（包含 `2a7ba73`）
- Framework：Next.js 16.3.0；Vercel 项目 Node 22 配置未改
- Cloud build：日志约 2 分钟，包含类型及 132 页构建
- 回退：可回到 `dpl_9WchAcdrfhRNnF2Lq5LfyHLBD3Gp`；新 DB 仅增加列/表/显式入口函数，无回填，不需要删除表以回退应用

Post-Deploy Observability：只完成双域健康检查、实际页面路径和数据库聚合核验；未把短时健康当长期监控，没有本轮 error=0 或 Drains 已配置的证据。
