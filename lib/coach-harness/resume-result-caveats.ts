import {splitResumeBlocks,stripResumeMarkdown} from '@/lib/opportunities/resume-blocks';

const unresolved=/(?:未|没有|无法|不能|未能)[^。！？!?；;\n]{0,12}(?:复现|证实|验证|证明|确认)/;
const metrics=/点击率|转化率|留存率|正确率|准确率|命中率|成功率|使用时长|生成耗时|响应时间|成本|收入|收益|增量|正向信号|负向信号|实验效果/g;
const measuredResult=/(?:提升|提高|下降|降低|增加|减少|改善|增长|上升|回落|显著|正向|负向|\d)/;

/** A favourable observation and a later unresolved validation are not an
 * established uplift. Dropping the entire result remains allowed; retaining
 * its metric requires retaining the uncertainty in the SAME experience.
 * This deterministic check covers explicit verification caveats, not every
 * possible semantic error, and is never an independent quality approval. */
export function resumeResultCaveatIssues(before:string,after:string):string[]{
  const candidates=splitResumeBlocks(after);
  const issues:string[]=[];
  for(const block of splitResumeBlocks(before)){
    const source=block.lines.join('\n');
    if(!unresolved.test(source))continue;
    const metricNames=[...new Set(source.match(metrics)||[])];
    if(!metricNames.length)continue;
    const title=stripResumeMarkdown(block.title);
    const anchor=title.split(/[\s|｜·—–/（(]/).find(part=>part.length>=2);
    const local=candidates.filter(item=>{
      const heading=stripResumeMarkdown(item.title);
      return heading===title||Boolean(anchor&&heading.includes(anchor));
    });
    // An omitted experience cannot retain its outcome. If authoring changed
    // the heading beyond recognition, do not borrow another project's caveat.
    if(!local.length)continue;
    const retained=local.map(item=>item.lines.join('\n')).join('\n');
    const keepsMeasuredResult=retained.split(/[。！？!?；;\n]/)
      .some(sentence=>metricNames.some(name=>sentence.includes(name))&&measuredResult.test(sentence));
    if(keepsMeasuredResult&&!unresolved.test(retained)){
      issues.push('同一经历保留了指标表现，却删除了原文尚未复现、验证或确认结果的限定；不能将初步信号交付成已确认增益。');
    }
  }
  return [...new Set(issues)];
}
