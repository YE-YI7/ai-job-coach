import { splitResumeBlocks } from "./opportunities/resume-blocks";
import { isResumePageBreak, markdownSegments } from "./opportunities/resume-markdown";
import { stripResumeMarkdown, isResumeIdentityLine } from "./opportunities/resume-blocks";
import type { ResumeInk } from "./opportunities/resume-inline";
export const printTemplates={classic:{label:"经典黑白",accent:"#242424",font:"serif"},modern:{label:"简洁蓝灰",accent:"#365571",font:"sans-serif"},warm:{label:"温润纸感",accent:"#85502f",font:"sans-serif"}} as const;
export type PrintTemplate=keyof typeof printTemplates;
export function escapeResumeHtml(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
const DATE_RANGE = /\d{4}(?:[.\/年-]\d{1,2}月?)?\s*(?:[-–—~～至]\s*)(?:至今|现在|present|\d{4}(?:[.\/年-]\d{1,2}月?)?)/i;
const isDateLine=(line:string)=>{const plain=stripResumeMarkdown(line);return plain.match(DATE_RANGE)?.[0]===plain;};
export function resumePrintHtml(text:string,template:PrintTemplate,title:string,options:{toolbar?:boolean;highlight?:string;ink?:ResumeInk[];interactive?:boolean}={}){
 const t=printTemplates[template];
 const blocks=splitResumeBlocks(text);
 let lineCursor=0;
 const inline=(line:string)=>{
  let base=text.indexOf(line,lineCursor);if(base<0)base=text.indexOf(line);if(base>=0)lineCursor=base+line.length;
  let segmentCursor=0;
  return markdownSegments(line).map(segment=>{
   const found=line.indexOf(segment.text,segmentCursor);segmentCursor=Math.max(segmentCursor,found+segment.text.length);
   const start=base+Math.max(0,found), end=start+segment.text.length;
   const marks=base<0?[]:(options.ink||[]).filter(mark=>mark.start<end&&mark.end>start);
   let offset=0,html="";
   for(const mark of marks){const left=Math.max(0,mark.start-start),right=Math.min(segment.text.length,mark.end-start);html+=escapeResumeHtml(segment.text.slice(offset,left));
    html+=`<mark data-change-id="${escapeResumeHtml(mark.id)}" data-ink="${mark.kind}" tabindex="0" role="button" aria-label="${mark.kind==='removed'?'删除建议':mark.kind==='added'?'新增建议':'表达修改'}，点击采纳或保留原文">${escapeResumeHtml(segment.text.slice(left,right))}</mark>`;offset=right;}
   html+=escapeResumeHtml(segment.text.slice(offset));
   return segment.href?`<a href="${escapeResumeHtml(segment.href)}">${html}</a>`:segment.bold?`<strong>${html}</strong>`:html;
  }).join("");
 };
 const lineHtml=(line:string)=>options.highlight&&stripResumeMarkdown(line)===options.highlight?`<mark data-resume-highlight>${inline(line)}</mark>`:inline(line);
 const entryRow=(label:string,date:string,tag="p")=>`<${tag} class="resume-entry"><span>${inline(label)}</span><time>${inline(date)}</time></${tag}>`;
 let previousHeading:string|null=null;
 const content=blocks.map(block=>{
  const heading=block.heading!==previousHeading?block.heading:null;
  previousHeading=block.heading;
  const tag=heading&&/^\s*#{3,6}\s/.test(heading)?"h3":"h2";
  // A break belongs between document sections, not inside a grid cell. Inside
  // a cell it stretches the title/background to the bottom of the sheet.
  const groups:string[][]=[[]];
  for(const line of block.lines){if(isResumePageBreak(line))groups.push([]);else groups[groups.length-1].push(line);}
  return groups.map((sourceLines,groupIndex)=>{
   const lines=[...sourceLines];
   const sectionHeading=groupIndex===0?heading:null;
   if(!lines.length&&!sectionHeading)return "";
   const headingDate=sectionHeading&&tag==="h3"&&lines[0]&&isDateLine(lines[0])?lines.shift():null;
   const nameIndex=block.kind==='header'?lines.findIndex(isResumeIdentityLine):-1;
   const paragraphs:string[]=[];
   for(let index=0;index<lines.length;index++){
    const line=lines[index], next=lines[index+1];
    const bullet=/^\s*[-*•]\s+/.test(line);
    const plain=stripResumeMarkdown(line);
    if(/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line.trim()))continue;
    if(block.kind!=="header"&&!bullet&&plain.length<=100&&!/[。！？!?]/.test(plain)){
     if(next&&isDateLine(next)&&!isDateLine(line)){paragraphs.push(entryRow(line,next));index++;continue;}
     if(isDateLine(line)&&next&&!/^\s*[-*•]\s+/.test(next)&&stripResumeMarkdown(next).length<=80){paragraphs.push(entryRow(next,line));index++;continue;}
     const date=line.match(DATE_RANGE)?.[0];
     if(date&&plain!==date&&(index===0||/^\s*\*\*/.test(line))){paragraphs.push(entryRow(line.replace(date,"").trim(),date));continue;}
    }
    const kind=block.kind==="header"&&/^(?:头像区|照片|证件照)$/.test(plain)?'resume-photo-label':block.kind==="header"&&groupIndex===0&&index===nameIndex&&plain.length<=40?"resume-name":block.kind==="header"&&/^(?:求职方向|求职意向|意向)\s*[:：]/.test(plain)?"resume-role":block.kind==="header"?"resume-contact":bullet?"resume-bullet":"";
    paragraphs.push(`<p${kind?` class="${kind}"`:""}>${lineHtml(line)}</p>`);
   }
   const headingHtml=sectionHeading?(headingDate?entryRow(sectionHeading,headingDate,tag):`<${tag}>${inline(sectionHeading)}</${tag}>`):"";
   return `<section data-kind="${block.kind}"${options.interactive?` data-resume-block="${block.id}"`:''}>${headingHtml}<div>${paragraphs.join("")}</div></section>`;
  }).join('<div class="page-break"></div>');
 }).join("");
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeResumeHtml(title)}</title><style>
 @page{size:A4;margin:12mm}*{box-sizing:border-box}html{background:#fff}body{width:210mm;min-height:297mm;padding:12mm;margin:0 auto;color:#292823;font:10.5pt/1.48 ${t.font === "serif" ? '"Songti SC","Noto Serif SC",serif' : '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'};overflow-wrap:anywhere}
 section{padding:6px 0;border-bottom:0;text-align:left}h2,h3{color:${t.accent};margin:0 0 7px;break-after:avoid;word-break:normal}h2{font-size:11.5pt;font-weight:600;border-bottom:1px solid #dcded7;padding-bottom:7px;margin-top:6px}h3{font-size:10.5pt;font-weight:600}p{white-space:pre-wrap;margin:0 0 5px;orphans:2;widows:2}.resume-name{font-size:22pt;line-height:1.35;font-weight:600;color:${t.accent};margin-bottom:7px}.resume-bullet{padding-left:1em;position:relative}.resume-bullet:before{content:"•";position:absolute;left:0}a{color:inherit;text-decoration:underline;text-underline-offset:3px}.page-break{break-before:page;page-break-before:always}button{padding:10px 16px;cursor:pointer}.toolbar{margin-bottom:24px;font:14px sans-serif;color:#555}
 .classic section[data-kind="header"]{border-bottom:2px solid #242424}.classic section[data-kind="header"] .resume-name{text-align:center}
 .resume-photo-label{float:right;min-width:22mm;min-height:28mm;text-align:center;color:#777;font-size:8pt}section[data-kind=header]:after{content:"";display:block;clear:both}
 .modern section{display:block}.modern h2,.modern h3{padding:0;align-self:start}.modern section[data-kind="header"]{display:block;border-bottom:1px solid #dcded7;padding-bottom:12px;margin-bottom:8px}.modern .resume-name{color:#292823}
 .resume-role{font-size:12pt;font-weight:600;margin-bottom:7px}.resume-contact{font-size:9.5pt;color:#555750}.resume-entry{display:flex;align-items:baseline;justify-content:space-between;gap:16px;font-weight:600;break-after:avoid}.resume-entry>span{min-width:0}.resume-entry time{font-size:9.5pt;font-weight:400;white-space:nowrap;color:#61635c}mark[data-resume-highlight]{background:#e7f3e8;color:inherit;padding:0;box-decoration-break:clone;-webkit-box-decoration-break:clone}
 .warm main{display:block}.warm section{padding:7px 0}.warm h2{border-bottom-color:#d9cbbb}
 mark[data-ink]{color:inherit;padding:1px 0;border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer;outline-offset:3px}mark[data-ink=added]{background:#d9efcf}mark[data-ink=reworded]{background:#fff0a8}mark[data-ink=removed]{background:#f7d9d5;text-decoration:line-through;text-decoration-thickness:1px}mark[data-ink]:focus-visible{outline:2px solid #536a40}::selection{background:#dce4d1;color:#292823}
 section[data-resume-block]{position:relative}.resume-grip{position:absolute;right:calc(100% + 5px);top:5px;padding:2px;border:0;background:transparent;color:#62645d;opacity:0;cursor:grab;font-size:13px;line-height:20px}section[data-resume-block]:hover>.resume-grip,section[data-resume-block]:focus-within>.resume-grip{opacity:1}.resume-grip:focus-visible{outline:2px solid #536a40}.resume-grip[data-hint=true]{animation:resume-grip-hint 1.6s ease-out 1}@keyframes resume-grip-hint{0%,100%{opacity:0;transform:translateY(0)}35%{opacity:1;transform:translateY(-3px)}65%{opacity:1;transform:translateY(2px)}}@media(prefers-reduced-motion:reduce){.resume-grip[data-hint=true]{animation:none}}
 @media screen{body{box-shadow:0 8px 28px rgba(41,40,35,.06)}}
 @media print{.toolbar{display:none}body{margin:0;padding:0;width:auto;min-height:0;max-width:none;box-shadow:none}h2,h3{break-after:avoid}section{break-inside:auto}*{print-color-adjust:exact}}
 </style></head><body class="${template}">${options.toolbar===false?"":'<div class="toolbar">在打印窗口选择「另存为 PDF」，取消勾选「页眉和页脚」。正文可选中、搜索。<br><button id="print">保存为 PDF</button></div>'}<main>${content}</main></body></html>`;
}
export function renderResumePrintWindow(target:Window,text:string,template:PrintTemplate,title:string,onPrintRequested?:()=>void){
 target.document.open();target.document.write(resumePrintHtml(text,template,title));target.document.close();
 target.document.getElementById("print")?.addEventListener("click",()=>{target.print();onPrintRequested?.();});
}
