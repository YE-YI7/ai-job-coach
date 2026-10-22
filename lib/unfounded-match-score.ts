/** Generated matching percentages have no calibrated rubric. Strip them from
 * new structured output, without mutating or migrating historical documents. */
export function withoutUnfoundedMatchScores<T>(value:T):T {
  if(Array.isArray(value))return value.map(item=>withoutUnfoundedMatchScores(item)) as T;
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='matchScore'&&key!=='match_score')
    .map(([key,item])=>[key,withoutUnfoundedMatchScores(item)])) as T;
}
