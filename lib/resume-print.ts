export const printTemplates={classic:{label:"经典黑白",accent:"#242424",font:"serif"},modern:{label:"简洁蓝灰",accent:"#365571",font:"sans-serif"},warm:{label:"温润纸感",accent:"#85502f",font:"sans-serif"}} as const;
export type PrintTemplate=keyof typeof printTemplates;
export function escapeResumeHtml(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
export function resumePrintHtml(text:string,template:PrintTemplate,title:string){
 const t=printTemplates[template];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeResumeHtml(title)}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{max-width:174mm;margin:24px auto;color:#242424;font:11pt/1.65 ${t.font};overflow-wrap:anywhere}h1{font-size:22pt;color:${t.accent};margin:0 0 14px;border-bottom:2px solid ${t.accent};padding-bottom:10px;break-after:avoid}p{white-space:pre-wrap;margin:0 0 8px;orphans:3;widows:3;break-inside:avoid}button{padding:10px 16px;cursor:pointer}.toolbar{margin-bottom:24px;font:14px sans-serif;color:#555}@media print{.toolbar{display:none}body{margin:0;max-width:none}}</style></head><body><div class="toolbar">在打印窗口选择「另存为 PDF」，取消勾选「页眉和页脚」。正文可选中、搜索。<br><button id="print">保存为 PDF</button></div>${text.split(/\n\s*\n/).map((p,i)=>i===0&&p.length<24&&!p.includes("\n")?`<h1>${escapeResumeHtml(p)}</h1>`:`<p>${escapeResumeHtml(p)}</p>`).join("")}</body></html>`;
}
export function renderResumePrintWindow(target:Window,text:string,template:PrintTemplate,title:string){
 target.document.open();target.document.write(resumePrintHtml(text,template,title));target.document.close();
 target.document.getElementById("print")?.addEventListener("click",()=>target.print());
}
