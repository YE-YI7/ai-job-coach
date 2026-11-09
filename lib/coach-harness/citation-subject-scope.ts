/** Source selection for qualifier checks, not a new entailment/approval rule.
 * A shared verb alone must not let one subject's state overwrite another's.
 * If no lexical subject evidence exists, retain the conservative legacy pool. */
export function qualifierSubjectScores(candidate: string, clauses: string[], verb: string,
  ignored: readonly string[]) {
  const clean = (text: string) => {
    let value = text.toLowerCase();
    for (const term of [...ignored, verb].sort((a,b)=>b.length-a.length)) {
      value = value.split(term.toLowerCase()).join(' ');
    }
    return value.replace(/主导|独立|全程|带领|全部|成功|均|已|了|的|本人|自己|通过|进行|目前|当时|以及|并且/g,' ');
  };
  const tokens = (text: string) => {
    const set = new Set<string>();
    for (const part of clean(text).match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || []) {
      if (/^[a-z0-9]+$/.test(part)) { if (part.length>1) set.add(part); continue; }
      for (let n=2;n<=3;n++) for (let i=0;i+n<=part.length;i++) set.add(part.slice(i,i+n));
    }
    return set;
  };
  const wanted = tokens(candidate);
  return clauses.map(clause=>[...tokens(clause)].reduce((sum,token)=>
    sum+(wanted.has(token)?token.length:0),0));
}
