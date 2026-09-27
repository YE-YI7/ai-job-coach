# 简历窄栏回归修复

原因：299897c 模板升级将 warm 强制双栏，仅标准 header/experience/project 跨栏；长 education/other/summary 留在半栏。断点使用 viewport，无法识别三栏工作台的实际中栏宽度。

修复：warm 恢复全宽连续章节，保留纸色与章节底色；modern 按 resume-sheet 容器宽度决定标题/正文并列，窄栏堆叠；页边距自适应，模板工具条可换行。PDF 的 warm 同步取消强制分栏。未修改简历解析、拖拽事件、逐块选择、修改保存、原文保留、质检或当前稿导出逻辑。

验证：94 套 / 804 项测试通过，tsc、改动 TS 文件 ESLint、production build 成功。新增非标准标题长段落导出回归测试。浏览器 warm 长简历：中栏 520px，章节 487px；390px 手机视口章节 312px，无页面横向溢出。实际点击导出 warm PDF 4 页，首尾 RESUME-CHECK-01/18 文本回读存在，预览章节全部占满 658px 打印内容区。样本为虚构预览数据，不冒充真人账户写库验收。

Impeccable 手动一次：仅历史两条 interview 彩色侧边与 Georgia 字体声明警告，本次未引入，未扩大修复。自动 hook 未开启。
