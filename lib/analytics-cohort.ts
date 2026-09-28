/** Only explicit operator configuration identifies internal accounts. */
export function analyticsCohort(userId:string|null, configuredIds:string|undefined) {
 const ids=new Set((configuredIds||"").split(",").map(id=>id.trim()).filter(Boolean));
 return userId&&ids.has(userId)?"internal":"unclassified";
}
