/** Match the existing RPC's btrim(text), whose default removes ASCII spaces,
 * not JS trim's newlines/tabs. Model text and concurrency tokens are distinct. */
export function resumeStorageSnapshot(resume:unknown,jd:unknown) {
  const comparable=(value:unknown)=>{
    const text=String(value??'');let start=0,end=text.length;
    while(start<end&&text[start]===' ')start++;
    while(end>start&&text[end-1]===' ')end--;
    return text.slice(start,end);
  };
  return {resume:comparable(resume),jd:comparable(jd)};
}
