import { splitResumeBlocks } from "./opportunities/resume-blocks";
import { isResumePageBreak, markdownSegments } from "./opportunities/resume-markdown";
import { stripResumeMarkdown } from "./opportunities/resume-blocks";
export const printTemplates={classic:{label:"经典黑白",accent:"#242424",font:"serif"},modern:{label:"简洁蓝灰",accent:"#365571",font:"sans-serif"},warm:{label:"温润纸感",accent:"#85502f",font:"sans-serif"}} as const;
export type PrintTemplate=keyof typeof printTemplates;
export function escapeResumeHtml(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
export function resumePrintHtml(text:string,template:PrintTemplate,title:string){
 const t=printTemplates[template];
 const blocks=splitResumeBlocks(text);
 const inline=(line:string)=>markdownSegments(line).map(segment=>{
  const text=escapeResumeHtml(segment.text);
  return segment.href?`<a href="${escapeResumeHtml(segment.href)}">${text}</a>`:segment.bold?`<strong>${text}</strong>`:text;
 }).join("");
 let previousHeading:string|null=null;
 const content=blocks.map(block=>{
  const heading=block.heading!==previousHeading?block.heading:null;
  previousHeading=block.heading;
  const tag=heading&&/^\s*#{3,6}\s/.test(heading)?"h3":"h2";
  // A break belongs between document sections, not inside a grid cell. Inside
  // a cell it stretches the title/background to the bottom of the sheet.
  const groups:string[][]=[[]];
  for(const line of block.lines){if(isResumePageBreak(line))groups.push([]);else groups[groups.length-1].push(line);}
  return groups.map((lines,groupIndex)=>{
   const sectionHeading=groupIndex===0?heading:null;
   if(!lines.length&&!sectionHeading)return "";
   return `<section data-kind="${block.kind}">${sectionHeading?`<${tag}>${inline(sectionHeading)}</${tag}>`:""}<div>${lines.map((line,index)=>`<p${block.kind==="header"&&groupIndex===0&&index===0&&stripResumeMarkdown(line).length<=40?' class="resume-name"':/^\s*[-*•]\s+/.test(line)?' class="resume-bullet"':''}>${inline(line)}</p>`).join("")}</div></section>`;
  }).join('<div class="page-break"></div>');
 }).join("");
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeResumeHtml(title)}</title><style>
 @page{size:A4;margin:18mm}*{box-sizing:border-box}body{max-width:174mm;margin:24px auto;color:#242424;font:11pt/1.65 ${t.font};overflow-wrap:anywhere}
 section{padding:12px 0;border-bottom:1px solid #ddd}h2,h3{color:${t.accent};margin:0 0 10px;break-after:avoid}h2{font-size:12pt}h3{font-size:11pt}p{white-space:pre-wrap;margin:0 0 6px;orphans:3;widows:3}.resume-name{font-size:18pt;font-weight:700;color:${t.accent}}.resume-bullet{padding-left:1em;position:relative}.resume-bullet:before{content:"•";position:absolute;left:0}a{color:inherit;text-decoration:underline;text-underline-offset:3px}.page-break{break-before:page;page-break-before:always}button{padding:10px 16px;cursor:pointer}.toolbar{margin-bottom:24px;font:14px sans-serif;color:#555}
 .classic section[data-kind="header"]{text-align:center;border-bottom:2px solid #242424}.classic h2{letter-spacing:.08em}
 .modern section{display:grid;grid-template-columns:30mm minmax(0,1fr);gap:6mm}.modern h2,.modern h3{background:#edf2f6;padding:8px;align-self:start}.modern section[data-kind="header"]{display:block;background:#edf2f6;padding:16px}.modern section:not(:has(h2,h3))>div{grid-column:1/-1}
 .warm main{display:block}.warm section{background:#fbf8f2;padding:12px;margin-bottom:5mm;border-bottom:1px solid #d9cbbb}.warm h2{background:#f1e9dc;padding:8px}
 @media screen and (max-width:600px){body{margin:16px}.modern section{display:block}}
 @media print{.toolbar{display:none}body{margin:0;max-width:none}h2,h3{break-after:avoid}section{break-inside:avoid-page}*{print-color-adjust:exact}}
 </style></head><body class="${template}"><div class="toolbar">在打印窗口选择「另存为 PDF」，取消勾选「页眉和页脚」。正文可选中、搜索。<br><button id="print">保存为 PDF</button></div><main>${content}</main></body></html>`;
}
export function renderResumePrintWindow(target:Window,text:string,template:PrintTemplate,title:string,onPrintRequested?:()=>void){
 target.document.open();target.document.write(resumePrintHtml(text,template,title));target.document.close();
 target.document.getElementById("print")?.addEventListener("click",()=>{target.print();onPrintRequested?.();});
}
