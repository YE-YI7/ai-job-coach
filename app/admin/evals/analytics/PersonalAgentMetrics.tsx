import type { AgentInstallSummary } from "@/lib/agent-install-metrics";
import styles from "./BusinessWorkspace.module.css";

export default function PersonalAgentMetrics({ summary }: { summary: AgentInstallSummary }) {
  return <section className={styles.section} aria-labelledby="personal-agent-heading">
    <h2 id="personal-agent-heading">个人 Agent · 安装入口</h2>
    <dl className={styles.facts}>
      <div><dt>点过复制的访客标识</dt><dd>{summary.clickedVisitors}</dd></div>
      <div><dt>复制成功的访客标识</dt><dd>{summary.copiedVisitors}</dd></div>
      <div><dt>复制成功次数</dt><dd>{summary.copied}</dd></div>
      <div><dt>复制失败次数</dt><dd>{summary.failed}</dd></div>
      <div><dt>手动复制动作</dt><dd>{summary.manualCopyActions}</dd></div>
      <div><dt>实际安装／使用人数</dt><dd>未采集</dd></div>
    </dl>
    <p className={styles.muted}>
      按当前日期和筛选统计，排除内部与测试流量。仅包含本次埋点上线后的记录，历史无法补算。
      访客标识按账号或浏览器去重，登录前后和跨浏览器可能重复，不等于真实人数。
    </p>
    <p className={styles.muted}>
      复制成功不代表已安装或使用；手动复制也不保证选中了完整指令。
      本地版没有使用回传，未上传本地简历、聊天或文件内容。
    </p>
  </section>;
}
