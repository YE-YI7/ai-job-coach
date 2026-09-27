import { splitResumeBlocks } from "./opportunities/resume-blocks";
export const printTemplates={classic:{label:"经典黑白",accent:"#242424",font:"serif"},modern:{label:"简洁蓝灰",accent:"#365571",font:"sans-serif"},warm:{label:"温润纸感",accent:"#85502f",font:"sans-serif"}} as const;
export type PrintTemplate=keyof typeof printTemplates;
export function escapeResumeHtml(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
export function resumePrintHtml(text:string,template:PrintTemplate,title:string){
 const t=printTemplates[template];
 const blocks=splitResumeBlocks(text);
 const content=blocks.map(block=>`<section data-kind="${block.kind}">${block.heading?`<h2>${escapeResumeHtml(block.heading)}</h2>`:""}<div>${block.lines.map(line=>`<p>${escapeResumeHtml(line)}</p>`).join("")}</div></section>`).join("");
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeResumeHtml(title)}</title><style>
 @page{size:A4;margin:18mm}*{box-sizing:border-box}body{max-width:174mm;margin:24px auto;color:#242424;font:11pt/1.65 ${t.font};overflow-wrap:anywhere}
 section{padding:12px 0;border-bottom:1px solid #ddd}h2{font-size:12pt;color:${t.accent};margin:0 0 10px;break-after:avoid}p{white-space:pre-wrap;margin:0 0 6px;orphans:3;widows:3}section[data-kind="header"] p:first-child{font-size:22pt;font-weight:700;color:${t.accent}}button{padding:10px 16px;cursor:pointer}.toolbar{margin-bottom:24px;font:14px sans-serif;color:#555}
 .classic section[data-kind="header"]{text-align:center;border-bottom:2px solid #242424}.classic h2{letter-spacing:.08em}
 .modern section{display:grid;grid-template-columns:30mm minmax(0,1fr);gap:6mm}.modern h2{background:#edf2f6;padding:8px}.modern section[data-kind="header"]{display:block;background:#edf2f6;padding:16px}.modern section:not(:has(h2))>div{grid-column:1/-1}
 .warm main{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.warm section{background:#fbf8f2;padding:12px}.warm section[data-kind="header"],.warm section[data-kind="experience"],.warm section[data-kind="project"]{grid-column:1/-1}
 @media print{.toolbar{display:none}body{margin:0;max-width:none}h2{break-after:avoid}section{break-inside:auto}*{print-color-adjust:exact}}
 </style></head><body class="${template}"><div class="toolbar">在打印窗口选择「另存为 PDF」，取消勾选「页眉和页脚」。正文可选中、搜索。<br><button id="print">保存为 PDF</button></div><main>${content}</main></body></html>`;
}
export function renderResumePrintWindow(target:Window,text:string,template:PrintTemplate,title:string){
 target.document.open();target.document.write(resumePrintHtml(text,template,title));target.document.close();
 target.document.getElementById("print")?.addEventListener("click",()=>target.print());
}
