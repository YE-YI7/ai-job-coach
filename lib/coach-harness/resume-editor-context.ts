import { resumeEditorialAnchors } from './resume-editorial-plan';

/** Presentation only: localize EXISTING fact IDs beside their exact source
 * paragraph and expose sentence units for ordering, never generate evidence. */
export function resumeEditorContext(resume: string, facts: string) {
  const normalize=(s:string)=>s.replace(/\s/g,'');
  const rows=facts.split('\n').map(line=>({line,match:line.match(/^\[([^\]]+)\]\s*(.*)$/)}));
  const anchors=resumeEditorialAnchors(resume).map(anchor=>({
    ...anchor,
    sourceIds:rows.filter(row=>row.match&&normalize(anchor.before).includes(normalize(row.match[2])))
      .map(row=>row.match![1]),
    sourceClauses:anchor.before.split(/(?<=[；;。])\s*/).filter(Boolean),
  }));
  const position=(row:typeof rows[number])=>{
    if(!row.match)return Number.MAX_SAFE_INTEGER;
    const index=normalize(resume).indexOf(normalize(row.match[2]));return index<0?Number.MAX_SAFE_INTEGER:index;
  };
  return {sourceAnchors:anchors,citableFacts:rows.sort((a,b)=>position(a)-position(b)).map(row=>row.line).join('\n')};
}
