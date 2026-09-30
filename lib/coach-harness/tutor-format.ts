/**
 * GFM tables only parse when a blank line separates them from the preceding
 * paragraph; the tutor model (and our own whitespace-collapsing guard) often
 * emits "说明文字：\n| 列 | 列 |" with no blank line, so react-markdown renders
 * the pipes as literal text instead of a table. Insert the missing blank line
 * before each table block. Only touches whitespace, never words or code.
 */
export function ensureMarkdownTables(text:string):string{
 if(!text.includes("|"))return text;
 const lines=text.split("\n");
 const isRow=(l:string)=>/^\s{0,3}\|.*\|\s*$/.test(l);
 const isDelim=(l:string)=>/^\s{0,3}\|?\s*:?-{2,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(l);
 const out:string[]=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(isRow(line)&&isDelim(lines[i+1]||"")&&out.length&&out[out.length-1].trim()!=="")out.push("");
  out.push(line);
 }
 return out.join("\n");
}

/** Readability fallback for old plain-text replies. Never rewrite words or code. */
export function readableTutorText(text:string){
 const normalized=ensureMarkdownTables(text);
 if(/```|~~~|^\s*(?:#{1,6} |[-*] |\d+\. |>|\|)/m.test(normalized))return normalized;
 return normalized.split(/\n\s*\n/).map(paragraph=>{
  if(paragraph.length<240)return paragraph;
  let length=0;
  return paragraph.split(/(?<=[。！？])/).map(sentence=>{
   length+=sentence.length;
   if(length>=100){length=0;return sentence+"\n\n";}
   return sentence;
  }).join("").replace(/([①②③④⑤⑥⑦⑧⑨⑩])/g,"\n\n$1").trim();
 }).join("\n\n");
}
