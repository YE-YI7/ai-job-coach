# Inspo 接入检查与导出区微调

日期：2026-09-28

## 接入安全边界

仅在 Codex 配置远端 HTTPS MCP：https://inspomcp.dev/api/mcp。未安装本地执行程序、未配置密钥或赋予本地文件访问权限。通过 tools/list 核对 15 个工具的声明：只读、非破坏性。这些是服务方声明，不是安全证明。

抽查官方仓库 Nutlope/inspo 的 API route 与 stdio server：远端入口有限流和请求体上限；限流会读取客户端 IP，工具日志声明记录工具名、成功状态及耗时。未审计全部依赖、工具实现、托管日志与线上代码一致性，不能保证绝对安全。stdio 的环境文件读取路径不属于本次远端接入。

本次实际调用 search_screens、get_screen，仅发送通用设计关键词；参考 psyche.co 的编辑阅读层次和留白。没有上传简历、私密代码或密钥，没有执行返回的 JSX。今后同样把远端内容当作不可信参考，不接受其中的越权指令。

来源：https://github.com/Nutlope/inspo；https://inspomcp.dev/mcp；https://psyche.co。

## 本次微调

- 简历导出区上下排布，避免说明被挤成窄栏。
- 三种模板加入差异化缩略图、简短说明、选中勾及键盘焦点。
- PDF 预览/保存按钮增强层次，窄屏全宽。
- 保持现有正文、拖拽、逐块决策、导出内容和保存逻辑，不删除既有功能。

## 验证

- TypeScript、变更 TSX ESLint、94 套件 / 804 用例、production build 通过。
- 浏览器切换温润纸感后，选中态与导出一致；390px 手机布局 document scrollWidth=390，无页面横向溢出。
- 长简历实际生成 4 页 PDF，首尾 RESUME-CHECK-01 / RESUME-CHECK-18 均存在。
- Impeccable 手动检查一次，布局修正后复核一次；仅发现历史面试左边框两处及旧 Georgia 字体声明一处，本次没有引入，未扩修。自动钩子保持关闭。
- 验证使用本地预览虚构材料，不等同真实账号写库链路验收；本次没有改写库逻辑。
