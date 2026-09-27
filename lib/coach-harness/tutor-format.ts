/** Readability fallback for old plain-text replies. Never rewrite words or code. */
export function readableTutorText(text:string){
 if(/```|~~~|^\s*(?:#{1,6} |[-*] |\d+\. |>|\|)/m.test(text))return text;
 return text.split(/\n\s*\n/).map(paragraph=>{
  if(paragraph.length<240)return paragraph;
  let length=0;
  return paragraph.split(/(?<=[。！？])/).map(sentence=>{
   length+=sentence.length;
   if(length>=100){length=0;return sentence+"\n\n";}
   return sentence;
  }).join("").replace(/([①②③④⑤⑥⑦⑧⑨⑩])/g,"\n\n$1").trim();
 }).join("\n\n");
}
