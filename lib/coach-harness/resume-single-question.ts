/** Same monotone prefix for live display and saved replies: one question is
 * enough for this turn. Put explanations before it, never queue more asks. */
export function singleResumeQuestionReply(reply:string){
  // A quoted user question, inline code or URL query is not a new mentor ask.
  // Include incomplete quotes in the protected prefix while text is streaming.
  const protectedSpans=[...reply.matchAll(/https?:\/\/[^\s)]+|“[^”]*(?:”|$)|‘[^’]*(?:’|$)|「[^」]*(?:」|$)|`[^`]*(?:`|$)|"[^"]*(?:"|$)/g)]
    .map(match=>({start:match.index!,end:match.index!+match[0].length}));
  const first=[...reply.matchAll(/[？?]/g)].map(match=>match.index!).find(index=>!protectedSpans.some(span=>index>=span.start&&index<span.end));
  if(first===undefined)return reply;
  // Preserve a closing emphasis/quote received after the question mark.
  const closing=reply.slice(first+1).match(/^[*_”’"'）)\]]*/)?.[0]||'';
  return reply.slice(0,first+1)+closing;
}
export function skipsResumeFact(message:string){
  return /^(?:(?:这个|这项|具体数字|数据|结果)\s*)?(?:我\s*)?(?:不知道|记不清了?|不记得了?|没记录|没有数据|没做过|跳过|暂不补充)[。！!，,\s]*$/.test(message.trim());
}
