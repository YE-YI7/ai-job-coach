import { ArrowRight, FileText, MessageSquareText } from "lucide-react";
import styles from "./CockpitApp.module.css";

export default function SalaryOverview({ onManage, onCoach }: { onManage: () => void; onCoach: () => void }) {
  return <section className={styles.salaryOverview}>
    <div className={styles.salaryIntro}><h2>谈薪与 Offer</h2><p>核对总包、薪酬结构与答复期限。</p></div>
    <div className={styles.salaryCards}>
      <button type="button" className={styles.salaryCard} onClick={onManage}>
        <span className={styles.salaryCardIcon} aria-hidden="true"><FileText size={19} /></span>
        <span className={styles.salaryCardCopy}>
          <strong>管理 Offer</strong><small>把总包、薪酬结构与答复期限放在一处核对。</small>
        </span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>
      <button type="button" className={styles.salaryCard} onClick={onCoach}>
        <span className={styles.salaryCardIcon} aria-hidden="true"><MessageSquareText size={19} /></span>
        <span className={styles.salaryCardCopy}>
          <strong>准备谈薪沟通</strong><small>让导师先问清最影响决定的一条，再练怎么谈。</small>
        </span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </div>
    <div className={styles.salaryChecklist}>
      <span>谈之前先核对</span><ul><li>总包</li><li>薪酬结构</li><li>答复期限</li></ul>
      <small>先确认事实，再决定怎么谈。</small>
    </div>
  </section>;
}
