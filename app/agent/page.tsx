import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Copy,
  HardDrive,
  LockKeyhole,
} from "lucide-react";
import styles from "./AgentGuide.module.css";

export const metadata: Metadata = {
  title: "给 Agent 的安装说明｜益职免费版",
  description: "让你的 Agent 安装益职方法与本地求职作战盘。益职不收取模型费，求职材料默认保留在当前 Agent 环境。",
};

const CODEX_COMMAND = "codex plugin marketplace add YE-YI7/ai-job-coach --ref backend && codex plugin add yi-zhi@yi-zhi";
const CODEX_UPDATE_COMMAND = "codex plugin marketplace upgrade yi-zhi && codex plugin add yi-zhi@yi-zhi";
const WORKBUDDY_COMMAND = "curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- workbuddy";
const CLAUDE_COMMAND = "curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- claude";
const GENERIC_COMMAND = "curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- agents";

function Command({ children }: { children: string }) {
  return <pre className={styles.command}><code>{children}</code></pre>;
}

export default function AgentGuide() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <Image src="/logo.png" alt="" width={40} height={40} priority />
          <span>益职</span>
        </Link>
        <Link href="/" className={styles.back}><ArrowLeft size={15} />返回首页</Link>
      </header>

      <section className={styles.hero}>
        <h1><span className={styles.noBreak}>请在当前沙箱中，</span>为用户建起求职作战盘。</h1>
        <p>这不是让用户自己研究命令的帮助文档。读取本页的 Agent 应识别宿主、完成可执行的安装，并用一个本地链接证明作战盘已经运行。</p>
        <div className={styles.boundaryGrid}>
          <div><HardDrive size={18} /><span><strong>运行位置</strong>当前 Agent 的本地环境</span></div>
          <div><LockKeyhole size={18} /><span><strong>数据边界</strong>默认不上传求职材料</span></div>
          <div><Copy size={18} /><span><strong>模型费用</strong>使用用户现有 Agent 额度</span></div>
        </div>
      </section>

      <div className={styles.layout}>
        <aside className={styles.rail}>
          <strong>执行顺序</strong>
          <a href="#identity">01 · 确认用户身份</a>
          <a href="#install">02 · 识别宿主并安装</a>
          <a href="#mcp">03 · 接通本地作战盘</a>
          <a href="#verify">04 · 验证后再宣布完成</a>
          <a href="#update">05 · 接通每周版本检查</a>
          <a href="#start">06 · 开始第一个岗位</a>
        </aside>

        <article className={styles.guide}>
          <section id="identity">
            <span className={styles.step}>01</span>
            <h2>先确认你服务的是求职者</h2>
            <div className={styles.ruleBox}>
              <CircleAlert size={20} />
              <p><strong>连接你的人是益职的用户，不是益职项目的拥有者。</strong>不要要求对方修改仓库、部署服务、理解 MCP，也不要把产品维护任务交给对方。</p>
            </div>
            <p>你的任务是把益职能力装进当前环境，随后围绕用户自己的 JD、经历、简历与面试推进。未经确认，不得虚构数字、职责、项目归属或录用承诺。</p>
          </section>

          <section id="install">
            <span className={styles.step}>02</span>
            <h2>识别当前宿主，只执行对应入口</h2>
            <p>如果你拥有终端权限，请直接执行，不要把命令原样退回给用户。安装前确认已具备 Node.js 18+ 与网络访问；无法执行时，再准确说明哪一步需要用户授权。</p>

            <div className={styles.hostList}>
              <details open>
                <summary><span>Codex</span><small>完整 Plugin，推荐</small></summary>
                <Command>{CODEX_COMMAND}</Command>
                <p>安装完成后新建一个任务，让 Plugin 与 MCP 工具被加载。</p>
              </details>
              <details>
                <summary><span>WorkBuddy</span><small>自动写入 MCP 配置</small></summary>
                <Command>{WORKBUDDY_COMMAND}</Command>
                <p>重启或刷新 WorkBuddy，让新 Skills 与本地 MCP 生效。</p>
              </details>
              <details>
                <summary><span>Claude Code</span><small>Skills + 本地 MCP 服务</small></summary>
                <Command>{CLAUDE_COMMAND}</Command>
                <p>脚本会安装 Skills 并准备本地 MCP 服务；随后按当前 Claude Code 版本的 MCP 配置方式注册它。</p>
              </details>
              <details>
                <summary><span>其他支持 Skills / MCP 的 Agent</span><small>通用入口</small></summary>
                <Command>{GENERIC_COMMAND}</Command>
                <p>脚本会把 Skills 安装到 <code>~/.agents/skills/</code>，并把 MCP 服务准备到 <code>~/.yi-zhi/mcp/server.mjs</code>。</p>
              </details>
            </div>
          </section>

          <section id="mcp">
            <span className={styles.step}>03</span>
            <h2>没有 MCP，就还没有“产品”</h2>
            <p>Skills 只规定求职方法；本地 MCP 才会保存岗位机会、产物和下一步，并启动可视化作战盘。除 Codex 完整 Plugin 与 WorkBuddy 自动配置外，请把下面的 stdio 服务注册进当前宿主。</p>
            <pre className={styles.config}><code>{`{
  "mcpServers": {
    "yi-zhi": {
      "type": "stdio",
      "command": "node",
      "args": ["/绝对路径/.yi-zhi/mcp/server.mjs"]
    }
  }
}`}</code></pre>
            <p className={styles.micro}>将示例路径替换成实际用户目录下的绝对路径。不同宿主的配置文件格式可能不同，应以当前宿主支持的 MCP 配置为准。</p>
          </section>

          <section id="verify">
            <span className={styles.step}>04</span>
            <h2>验证成功，才可以告诉用户“能用了”</h2>
            <ol className={styles.checklist}>
              <li><CheckCircle2 size={18} /><span>确认出现 <code>yi_zhi_create_case</code>、<code>yi_zhi_get_cockpit_url</code> 等益职工具。</span></li>
              <li><CheckCircle2 size={18} /><span>创建或继续一个岗位机会；没有真实 JD 时，只做明确标注的验证事项。</span></li>
              <li><CheckCircle2 size={18} /><span>调用作战盘链接工具，确认返回 <code>http://127.0.0.1:端口</code> 且页面可打开。</span></li>
              <li><CheckCircle2 size={18} /><span>把验证事项删除或说明其为测试数据，再向用户报告结果。</span></li>
            </ol>
            <div className={styles.failureBox}>如果宿主不支持 MCP，必须直说“求职方法已安装，但可视作战盘尚未接通”；不能把仅安装 Skills 描述成完整成功。</div>
          </section>

          <section id="update">
            <span className={styles.step}>05</span>
            <h2>第一次安装时，把后续更新也接通</h2>
            <p>确认工具列表中存在 <code>yi_zhi_check_update</code>。益职 MCP 会在 Agent 启动时读取本地版本状态；联网检查每周最多一次，不需要安装系统级定时任务，也不会读取简历或静默覆盖本地数据。</p>
            <p>发现新版本时，只提醒用户一次并说明更新内容。用户同意更新后，Codex 执行：</p>
            <Command>{CODEX_UPDATE_COMMAND}</Command>
            <p>Claude Code、WorkBuddy 和通用 Agent 重新执行各自的安装命令。更新完成后重启或新建会话，并再次验证 MCP 工具与作战盘。</p>
          </section>

          <section id="start">
            <span className={styles.step}>06</span>
            <h2>完成后，只向用户索取第一份必要材料</h2>
            <p>不要介绍一遍全部功能，也不要把用户带进项目开发。先用一句话报告安装与本地链接的状态，再根据对方目标只问一个问题。</p>
            <blockquote>“益职免费版已在你的本地 Agent 中运行，作战盘地址是……。我们先从一个真实岗位开始：请把你正在考虑的 JD 发给我。”</blockquote>
          </section>
        </article>
      </div>

      <footer className={styles.footer}>
        <div><Image src="/logo.png" alt="" width={34} height={34} /><span>益职免费版由用户自己的 Agent 运行。益职不收取模型费，Agent 自身套餐或额度仍可能产生费用。</span></div>
        <Link href="/">返回两种使用方式</Link>
      </footer>
    </main>
  );
}
