# 模拟面试有总评结果页：统一 Q 版，发布记录

## 授权与范围

本人明确："可以，就基于 Q 那版把有总评的结果页也统一起来，别丢原来的功能和数据，上线。"

基线为正式 `1ddbbfd` / `dpl_Fc4sS1YTXC2bxNcTD8CYJArtUqKQ`（2026-11-16 现场查 alias 确认）。Q 的四文件 `be0efa9` 已包含于该正式基线；不是把 11-15 被否定的墨绿工作室样机发布。独立受管工作树、分支 `codex/interview-summary-unify-1116`，不混共享树未发布的 HR 职责或其他 F6 变化。

## 实现与保留

- 把 Q 的 `InterviewResult` 提取到同名独立文件，由无总评、历史记录及有总评共用；历史列表抓取、分页、URL 接续不变，原导出兼容。
- 有总评页保留整轮评分/等级/评审波动/日期、维度分与说明、优点与缺口、行动优先级与完成标准、每题决定性判断、用户自写复盘及原返回/重练/历史回调。
- 逐题回看保留所有已保存作答与各自反馈，包括待反馈、未评、跳过、零分。旧记录 attempts 为空但 answer 有内容时只在展示层兼容，不回写。
- 搜索覆盖问题、原话、追问、点评、证据与改答计划；最低题/最长回答跳转会展开题目，滚动尊重减少动态偏好。
- 不动首页、三栏外壳、导师/简历 Harness、模型选择、评分生成/保存/计费 API、数据库及既有记录，不运行迁移，不发新的模型请求。

## 发布前检查

- `npm test -- --runInBand --silent`：393 套通过、9 套原跳过；3,626 项通过、31 项原跳过。
- 定向三个套件 20 项通过。视图测试隔离 mock 既有 ESM Markdown 组件，Markdown 安全由原专门测试及浏览器真实 renderer 覆盖；曾直接 Jest/未 mock 的视图测试因 ESM 导入失败，未绕过应用安全策略。
- TypeScript、四文件 ESLint、`git diff --check` 通过；`npm run build` 完成。Next 中间件/Edge API/preferredRegion 旧告警保留，未扩大修复。
- 手动 Impeccable detect 本次四 UI 文件：0 primary；2 项颜色 advisory 均位于 Q 基线原有第 26 行，未改色/未开自动钩子。
- 开发专用真实组件夹具（非线上用户数据）桌面与 390×844 手机检查；手机文档宽 384 / 视口 390，无横溢。实际点验搜索、清空、自动展开跳转、自我复盘、历史 10+2 分页与历史中整轮回看。浏览器扩展有 addEventListener 和不透明 Object 日志，不冒全部 console 零错误。
- 本轮未付费重跑面试、未写生产用户记录，因此不冒新模型质量、真人新面试保存或长期可靠性验收。

## 证据与发布门

私有证据目录：`/Users/yi/Documents/Codex/yizhi-interview-summary-release-20261116-c9YyYL`，含实际桌面截图；源码与测试在本分支。生产同构建候选用 `vercel deploy --prod --skip-domain`，验证后才 promote；不得用开发夹具或 HTTP 200 冒生产用户端验收。切域名前重查 alias，若已被其他工作更新则停止并重新合入。

旧正式 `ai-job-coach-7rxjtn5ha-velmavalienteqejimu22-jpgs-projects.vercel.app` 留作可回滚版本；需要回滚时对原部署执行 `vercel rollback`，不删除任何数据。

## 正式发布完成（2026-11-16）

- 运行源码提交 `cb2dbb2b1bc0f9b64dde8850060e5b17cacd6593` 已推送至 `origin/codex/interview-summary-unify-1116`；与正式基线相比仅本报告及上述五个 UI/测试文件改变，其他受控文件原样。
- [GitHub CI 43878860073](https://github.com/YE-YI7/ai-job-coach/actions/runs/43878860073) 对该 SHA 的 deterministic-and-archived-replay 与 isolated-schema-rebuild 均成功。
- 候选 `dpl_6D4g1F5rQS1Z65Meo5JuEVn7756i` / `ai-job-coach-8dt8dwclc-velmavalienteqejimu22-jpgs-projects.vercel.app`，production 环境、云端构建完成 READY。元数据 `release=interview-summary-ui-1116`、`releaseSource=cb2dbb2`。
- 候选有 Vercel SSO，原始请求 302 到保护页不是应用错误；按既有授权 `vercel curl --deployment` 访问，未关闭/扩大部署保护。候选健康正常；完整 resumeRuntime JSON 的 SHA256 为 `e406683f2b475b0a20ad7a7c35da78b905719ce4242182af01f54e3b46d89e2a`，与切换前正式版完全相同。
- promote 前再次核主域名仍指向旧 Fc4sS1；然后 `vercel promote dpl_6D4g1F5rQS1Z65Meo5JuEVn7756i --yes` 成功，同包切换，没有重建另一版本。
- 发布后 `yizhioffer.com` 与 `www.yizhioffer.com` 的 inspect 均核到上述新 ID / READY，两个 `/api/health` 均 200、database ok、完整 runtime 指纹与旧基线相同。
- 正式首页 200；模拟历史与真实面试历史两个 API 匿名均 401；`/cockpit?tab=interview` 和开发夹具入口匿名均 307 至登录。夹具本身仍有原 `NODE_ENV !== development → notFound` 保护，没把测试入口开放线上。
- Chrome 实际点开正式面试历史入口，登录页正常加载；因已有登录态失效，本轮没有假称已经看过真人云端历史/新面试提交。核心展示交互验收使用开发专用真实组件夹具，不发模型、不写账号数据。
- 旧 Fc4sS1 保留回滚；不做数据迁移或删除。共享 HR 后五类职责候选仍未混入此发布。

实际验收图在私证目录 `result-desktop.jpg`、`result-first-screen.jpg`，内容为明确标注的虚构材料，不是用户真实记录。本报告的后续文档提交不改变已发布源码 SHA。

### 埋点边界补充

停止本轮开发服务器时回读完整日志，看到 5 次原有 `/api/product-events` POST 200。源代码核实：全局页面 tracker 会向 `product_events` 正常 upsert 页面访问事件，本机验收沿用 production 数据连接；因此不能把本轮写成“完全零云写”。这些不是面试提交或改稿操作，未改已有面试/简历/钱包记录，也没有模型调用。为保留可追溯性，没有擅删埋点、改全局 tracker 或重发产品；统计时应按 `host=127.0.0.1` 的本机访问排除，不冒真实用户使用。本轮明确的零写入边界限于既有业务材料、历史作答、个人积分和钱包。
