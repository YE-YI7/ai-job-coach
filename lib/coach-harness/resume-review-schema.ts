/** Provider-enforced shape, not a substitute for factual/value/document guards. */
export function resumeReviewSchema(changes:Array<{id:string}>,documentOnly=false){
 const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 const text={type:'string'},status={type:'string',enum:['passed','failed']},severity={type:'string',enum:['error','warning']};
 const changeId={type:'string',enum:changes.map(c=>c.id)};
 const document=object({status,summary:text,findings:{type:'array',items:object({changeId:{type:['string','null'],enum:[...changes.map(c=>c.id),null]},category:{type:'string',enum:['format','quality','grounding','missing_information','system']},severity,message:text})}});
 return {name:documentOnly?'resume_retained_review_v1':'resume_independent_review_v1',schema:documentOnly?object({document}):object({
  status,summary:text,findings:{type:'array',items:object({changeId,severity,message:text})},
  valueChecks:{type:'array',items:object({index:{type:'integer',enum:changes.map((_,i)=>i)},useful:{type:'boolean'},kind:{type:'string',enum:['concision','structure','specificity','relevance','clarity','none','format','grounding']},impact:{type:'string',enum:['correction','content']},reason:text})},
  document,recovery:{type:['object','null'],properties:{sourceExcerpt:text,field:{type:'string',enum:['context','action','deliverable','outcome','scope']},question:text},required:['sourceExcerpt','field','question'],additionalProperties:false},
 })};
}
