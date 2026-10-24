import type { Opportunity } from "@/lib/opportunities/types";
import styles from "./CockpitApp.module.css";

type Coverage = Opportunity["evidenceCoverage"];
const PARTS = [
  { key: "strong", label: "强证据" },
  { key: "weak", label: "弱证据" },
  { key: "unverified", label: "待确认" },
  { key: "missing", label: "缺口" },
] as const;

export function CoverageBar({ coverage }: { coverage: Coverage }) {
  const label = PARTS.map(part => `${part.label} ${coverage[part.key]} 条`).join("，");
  return <div className={styles.coverageBar} role="img" aria-label={label}>
    {PARTS.filter(part => coverage[part.key] > 0).map(part =>
      <span key={part.key} data-kind={part.key} style={{ flexGrow: coverage[part.key] }} />)}
  </div>;
}

export function EvidenceSummary({ coverage }: { coverage: Coverage }) {
  return <div className={styles.evidenceSummary} role="group" aria-label="证据分布">
    <span className={styles.evidenceSummaryLabel}>证据分布</span>
    <div className={styles.evidenceSummaryCounts}>
      {PARTS.map(part => <span key={part.key} data-kind={part.key}>
        <i aria-hidden="true" />{part.label} <b>{coverage[part.key]}</b>
      </span>)}
    </div>
  </div>;
}
