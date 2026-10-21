# Cursor 前端、工具栏与打印验收

## 范围

用户委托验收 Cursor 的 9 个在途前端/打印文件。保留左栏、带 logo 的左下模型菜单、已有导师气泡与真实 reply 前缀展示、原编辑/保存/计费路径。没有改模型编排、认证或数据库结构。

## 修复

- 正式导师欢迎区不重新引入宋体，沿用共享无衬线正文。
- 首页虚构简历、面试演示、生成的分享卡明确标明示例。图片生成失败可回退文字，下载延迟回收对象URL，生成时禁止重复点击；不读取用户简历。
- 移除采纳后整个文档的模糊入场；句子显隐只过渡透明度，不逐帧改高度/间距。减少动态效果选择器覆盖动态最终态，手机分享动作44px。
- 打印明确禁用动画/过渡，修改墨迹恢复完整透明度与清晰度。屏幕入场不污染 PDF。

## 验收进度

- TypeScript通过；任务TSX/打印ESLint零错误，CockpitApp保留2条未改动的历史未使用变量warning。
- 最终9套61项定向测试通过，覆盖模型菜单、逐步回复、Markdown、输入焦点、简历 motion 与打印。
- Impeccable一次初检、必要修正后一次复核：386项中3项primary均为CockpitApp历史侧线/Georgia；本次新增高度动画问题已修，未扩修历史或启用自动hook。
- Chrome：首页采纳改变唯一示例句；分享图片成功，恢复原剪贴板。390宽无横溢出，按钮44px，减少动态效果transition=0s。
- 真实导师组件用无模型延迟夹具：12个实际前缀帧、strong与列表渲染、无裸星号/内部字段；完整刷新恢复同一回复，不重演打字。此为界面夹具，不冒充真实模型调用。
- 新建虚构岗位 `8c9a0ebf-35ad-427c-be8e-b69fef15960c`，仅此档案手工修改。真实云保存回执后整页刷新恢复 `QA-CURSOR-SAVE-1`。未编辑任何既有机会或作答。
- Chrome原生另存为PDF：首页示例1页A4、203640bytes；渲染核看完整正文、末尾技能，无工具栏/编辑控件或浅墨。Poppler有Type3 glyph bounding-box警告，实际渲染正常；不隐瞒警告。

## 数据基线

整行聚合 `md5(string_agg(t::text,'' order by t::text))`：作答41 / `4e13749d834d65ba1213c5da9faedd54`；钱包1 / `911203ce80ef77ab10df3a333e393dab`；转账1 / `772e13a5cd6cb3bc100c6caf337f56da`；预留6 / `d9074173be468ca74a52a9f975befdfd`。原35机会同算法 `356190a4e026afd0dae438646366cf85`；发布后排除本次唯一QA再复核。

## 发布状态

已上线 https://yizhioffer.com ：`cada9db8c0a914c8b3313d95496e87735380cc43` / `dpl_AspXhB1gbwKdmbGDaEkU1Rn5jYwt` / Production / READY / 2m34s / 136页。CLI旧登录失效及MCP旧team403边界未扩大；使用现有Chrome Vercel网页登录，对精确提交进行普通Production重建并分配域名，不冒称staged+promote或同一Preview构建。运行URL `ai-job-coach-cftvwx8cg-velmavalienteqejimu22-jpgs-projects.vercel.app`。

正式验收：

- 同一QA档案点击“保存这段文字”，真实“正在保存”→“已保存到工作区”；整页刷新恢复`QA-CURSOR-SAVE-2`。服务端回查编辑在metadata内保存，源resumeText尾标仍在；不把原文未覆写误判为保存失败。
- 正式导出并在Chrome原生打印窗口另存`cursor-long-production.pdf`，2页A4、66508bytes；两页均渲染核看，24条长文、真实圆点、日期、保存尾标与最终技能完整，无裁切、编辑控件或浅墨。经典黑白长文与首页简洁蓝灰单页均通过。`pdftotext`未安装，没将失败的文本命令当成通过；采用实际AX文字和逐页图像检查。
- 正式模型入口仍输入面左下，DeepSeek选择未改；12个logo完整、前5行44px、Escape关闭回焦。导师欢迎字体是Outfit/PingFang无衬线。390宽模型和发送均44px且不重叠，菜单left18/right372/top247/bottom691.5，无横溢出；视口已恢复。
- 正式health200/database ok，匿名session401；首页正式HTML可读新版示例标签。部署可见请求日志包含正常200/304及预期匿名401；这不是全量或长期无错证明，Drains历史缺口未扩修。
- 最终41旧作答、钱包/转账/预留、原35份机会的整行hash与上述基线逐一相同。没有短信、真实模型、付费推荐、充值或兑换操作。
- 本次唯一QA档案已归档，原文和测试结果可恢复，未永久删除；不是旧用户资料。回到原美团档案并刷新，输入可用。隔离服务与本轮本机/打印标签已关闭，夹具未进入发布。

证据目录：`/tmp/yizhi-cursor-acceptance.S1rQOw`，包含首页、移动工具栏、聊天恢复、正式模型/工具栏截图及两份Chrome写出的PDF与逐页图。临时界面没有服务端密钥；本机埋点因无DB返回503，明确不计作云端验收；正式埋点200。
