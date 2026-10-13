import type {ResumeChange} from "./types";
import {splitResumeBlocks,assignChangesToBlocks} from "./resume-blocks";
import {applyResumeChanges} from "../coach-harness/application-quality";

/** Never substitute the tiny matched anchor for the complete source block. */
export function resumeChangeComparison(source:string,change:ResumeChange){
 const result=applyResumeChanges(source,[{...change,status:"accepted"}]);
 const block=assignChangesToBlocks(splitResumeBlocks(source),[change]).find(item=>!item.synthetic&&item.changeIds.includes(change.id));
 if(result.findings.length||!block)return {before:change.before,after:change.after,canApply:false,reason:result.findings[0]?.message||"修改未能定位到原简历区块，请核对后重新生成。"};
 const before=[...(block.heading?[block.heading]:[]),...block.lines].join("\n");
 const selected=applyResumeChanges(before,[{...change,status:"accepted"}]);
 return {before,after:selected.text,canApply:selected.findings.length===0,reason:selected.findings[0]?.message||""};
}
