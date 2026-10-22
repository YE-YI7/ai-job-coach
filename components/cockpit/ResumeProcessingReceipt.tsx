import type {ResumeProcessingSummary} from '@/lib/coach-harness/resume-processing';
import styles from './ResumeAgentConversation.module.css';

export default function ResumeProcessingReceipt({processing}:{processing:ResumeProcessingSummary}){
  const status=processing.saved?'已保存':processing.outcome==='running'?'处理中':processing.outcome==='needs_detail'?'等一条补充':processing.outcome==='quota_denied'?'尚未开始修改':'本次未完成';
  const checkLabel={passed:'通过',failed:'未通过',performed:'已执行'};
  return <details className={styles.receipt} aria-label="本次简历处理记录">
    <summary>本次改稿 · {status}{processing.changedCount!==null&&processing.changedCount>0?` · ${processing.changedCount} 处可用修改`:''}</summary>
    <dl>
      <div><dt>已读材料</dt><dd>{processing.materials.length?processing.materials.join('、'):'尚无读取完成记录'}</dd></div>
      <div><dt>写法参考</dt><dd>{processing.knowledge.length?<ul>{processing.knowledge.map(item=><li key={item.id}>{item.title}</li>)}</ul>:'本次尚无参考记录'}</dd></div>
      <div><dt>经过阶段</dt><dd>{processing.stages.length?processing.stages.join(' → '):'任务已建立，等待处理记录'}</dd></div>
      {processing.checks.length>0&&<div><dt>检查记录</dt><dd><ul>{processing.checks.map(check=><li key={check.label}>{check.label} · {checkLabel[check.status]}</li>)}</ul></dd></div>}
      {processing.elapsedMs>0&&<div><dt>处理用时</dt><dd>{Math.ceil(processing.elapsedMs/1000)} 秒</dd></div>}
      {!processing.saved&&processing.outcome!=='running'&&<div><dt>当前结果</dt><dd>本次未保存新的修改，原稿仍保留。</dd></div>}
    </dl>
    <p className={styles.receiptId}>记录编号：{processing.traceId}</p>
  </details>;
}
