import type { Opportunity } from './types';
import { splitResumeBlocks } from './resume-blocks';
import { applyResumeChanges, resolveResumeEdits } from '../coach-harness/application-quality';

const snapshot=(item:Opportunity)=>({text:item.resumeText||'',changes:item.resumeChanges});
/** Only résumé work is reversible here; never touch interviews, originals or chat. */
export function rememberResumeEdit(before:Opportunity,after:Opportunity):Opportunity{
  if(JSON.stringify(snapshot(before))===JSON.stringify(snapshot(after)))return before;
  return {...after,resumeCheckStale:true,frozenStale:after.frozenStale||Boolean(after.applicationQuality),resumeEditHistory:{past:[...(before.resumeEditHistory?.past||[]),snapshot(before)].slice(-15),future:[]}};
}
export function travelResumeEdit(item:Opportunity,direction:'undo'|'redo'):Opportunity{
  const history=item.resumeEditHistory||{past:[],future:[]};
  const from=direction==='undo'?history.past:history.future,entry=from.at(-1);
  if(!entry)return item;
  return {...item,resumeText:entry.text,resumeChanges:entry.changes,resumeCheckStale:true,frozenStale:item.frozenStale||Boolean(item.applicationQuality),resumeEditHistory:direction==='undo'?{past:from.slice(0,-1),future:[...history.future,snapshot(item)].slice(-15)}:{past:[...history.past,snapshot(item)].slice(-15),future:from.slice(0,-1)}};
}
export function editableResumeBlock(item:Opportunity,id:string){
  const before=splitResumeBlocks(item.resumeText||'').find(block=>block.id===id)?.lines.join('\n');
  if(!before)return null;
  const range=resolveResumeEdits(item.resumeText||'',[{id:'manual-anchor',section:'',before,after:before,reason:'',evidenceId:null,status:'pending'}]).edits[0];
  if(!range)return null;
  const edits=resolveResumeEdits(item.resumeText||'',item.resumeChanges.filter(change=>change.status!=='rejected')).edits;
  if(edits.some(edit=>edit.start<range.end&&range.start<edit.end&&(edit.start<range.start||edit.end>range.end)))return null;
  const changes=edits.filter(edit=>edit.start>=range.start&&edit.end<=range.end).map(edit=>edit.change);
  const rendered=applyResumeChanges(before,changes);
  return rendered.findings.length?null:{before,text:rendered.text,start:range.start,end:range.end};
}
export function editResumeBlock(item:Opportunity,id:string,text:string,expectedText:string):Opportunity{
  const block=editableResumeBlock(item,id);
  if(!block||block.text!==expectedText||!text.trim())throw Error('这段文字已变化，请重新打开后编辑。');
  if(block.text===text.trim())return item;
  const resolved=resolveResumeEdits(item.resumeText||'',item.resumeChanges.map(change=>({...change,status:'accepted' as const}))).edits;
  const overlapping=new Set(resolved.filter(edit=>edit.start<block.end&&block.start<edit.end).map(edit=>edit.change.id));
  return rememberResumeEdit(item,{...item,resumeChanges:[...item.resumeChanges.filter(change=>!overlapping.has(change.id)),{id:`manual-${crypto.randomUUID()}`,section:id,before:block.before,after:text.trim(),reason:'你亲自修改的文字',evidenceId:null,status:'accepted',editedByUser:true}]});
}
