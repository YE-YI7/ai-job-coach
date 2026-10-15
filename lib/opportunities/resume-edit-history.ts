import type { Opportunity } from './types';
import { splitResumeBlocks, stripResumeMarkdown } from './resume-blocks';
import { applyResumeChanges, resolveResumeEdits } from '../coach-harness/application-quality';

const snapshot=(item:Opportunity)=>({text:item.resumeText||'',changes:item.resumeChanges});
export const currentResumeEditHistory=(item:Opportunity)=>item.resumeEditHistory?.generationId===item.resumeGenerationId?item.resumeEditHistory:undefined;
/** Only résumé work is reversible here; never touch interviews, originals or chat. */
export function rememberResumeEdit(before:Opportunity,after:Opportunity):Opportunity{
  if(JSON.stringify(snapshot(before))===JSON.stringify(snapshot(after)))return before;
  return {...after,resumeCheckStale:true,frozenStale:after.frozenStale||Boolean(after.applicationQuality),resumeEditHistory:{generationId:after.resumeGenerationId,past:[...(currentResumeEditHistory(before)?.past||[]),snapshot(before)].slice(-15),future:[]}};
}
export function travelResumeEdit(item:Opportunity,direction:'undo'|'redo'):Opportunity{
  const history=currentResumeEditHistory(item)||{past:[],future:[]};
  const from=direction==='undo'?history.past:history.future,entry=from.at(-1);
  if(!entry)return item;
  return {...item,resumeText:entry.text,resumeChanges:entry.changes,resumeCheckStale:true,frozenStale:item.frozenStale||Boolean(item.applicationQuality),resumeEditHistory:{generationId:item.resumeGenerationId,...(direction==='undo'?{past:from.slice(0,-1),future:[...history.future,snapshot(item)].slice(-15)}:{past:[...history.past,snapshot(item)].slice(-15),future:from.slice(0,-1)})}};
}
export function editableResumeBlock(item:Opportunity,id:string){
  const selected=splitResumeBlocks(item.resumeText||'').find(block=>block.id===id);
  const headingOnly=Boolean(selected?.heading&&!selected.lines.length);
  const before=selected?.lines.join('\n')||selected?.heading;
  if(!before)return null;
  const range=resolveResumeEdits(item.resumeText||'',[{id:'manual-anchor',section:'',before,after:before,reason:'',evidenceId:null,status:'pending'}]).edits[0];
  if(!range)return null;
  const edits=resolveResumeEdits(item.resumeText||'',item.resumeChanges.filter(change=>change.status!=='rejected')).edits;
  if(edits.some(edit=>edit.start<range.end&&range.start<edit.end&&(edit.start<range.start||edit.end>range.end)))return null;
  const changes=edits.filter(edit=>edit.start>=range.start&&edit.end<=range.end).map(edit=>edit.change);
  const rendered=applyResumeChanges(before,changes);
  return rendered.findings.length?null:{before,text:headingOnly?stripResumeMarkdown(rendered.text):rendered.text,start:range.start,end:range.end,headingOnly};
}
export function editResumeBlock(item:Opportunity,id:string,text:string,expectedText:string):Opportunity{
  const block=editableResumeBlock(item,id);
  if(!block||block.text!==expectedText)throw Error('这段文字已变化，请重新打开后编辑。');
  if(block.text===text.trim())return item;
  const source=item.resumeText||'';
  let start=block.start;
  const end=block.end;
  if(!text.trim()){
    // Delete this block, not its neighbours. A shared section heading survives
    // while it still labels another entry; a now-empty section is removed too.
    const blocks=splitResumeBlocks(source),index=blocks.findIndex(entry=>entry.id===id),selected=blocks[index];
    if(!block.headingOnly&&selected.heading&&blocks[index-1]?.heading!==selected.heading&&blocks[index+1]?.heading!==selected.heading){
      const headingStart=source.lastIndexOf(selected.heading,start);
      if(headingStart>=0&&!source.slice(headingStart+selected.heading.length,start).trim())start=headingStart;
    }
  }
  const resolved=resolveResumeEdits(item.resumeText||'',item.resumeChanges.map(change=>({...change,status:'accepted' as const}))).edits;
  const overlapping=new Set(resolved.filter(edit=>edit.start<end&&start<edit.end).map(edit=>edit.change.id));
  const remaining=item.resumeChanges.filter(change=>!overlapping.has(change.id));
  if(!text.trim()||block.headingOnly){
    // Structural edits update the working text, keeping displayed block IDs in
    // sync after a deletion/rename. The uploaded original and evidence stay put.
    const replacement=text.trim()?`${block.before.match(/^\s*#{2,6}\s+/)?.[0]||'## '}${stripResumeMarkdown(text.trim())}`:'';
    const nextText=source.slice(0,start)+replacement+source.slice(end);
    // An empty autosave intentionally cannot erase the persisted source. Keep
    // a final-block deletion as a reversible decision over that source instead.
    if(!nextText.trim())return rememberResumeEdit(item,{...item,resumeChanges:[{id:`manual-${crypto.randomUUID()}`,section:id,before:source,after:'',reason:'你删除了这块内容',evidenceId:null,status:'accepted',editedByUser:true}]});
    return rememberResumeEdit(item,{...item,resumeText:nextText,resumeChanges:remaining});
  }
  return rememberResumeEdit(item,{...item,resumeChanges:[...remaining,{id:`manual-${crypto.randomUUID()}`,section:id,before:block.before,after:text.trim(),reason:'你亲自修改的文字',evidenceId:null,status:'accepted',editedByUser:true}]});
}
