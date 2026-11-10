/** Compiled knowledge is not necessarily sent by the selected writer.
 * F6 has its own spec/case resources; do not silently inject legacy documents
 * or report them as used merely because the shared compiler prepared them. */
export function resumeKnowledgeDelivery(useF6:boolean,
  prepared:ReadonlyArray<{id:string}>,methodIds:ReadonlyArray<string>) {
  const preparedIds=prepared.map(document=>document.id);
  const includedIds=useF6?[]:preparedIds;
  const included=new Set(includedIds);
  return {
    preparedIds,includedIds,
    includedMethodIds:methodIds.filter(id=>included.has(id)),
    stageCode:useF6?'reviewed_methods_prepared_not_sent':'reviewed_methods_in_context',
    delivered:!useF6,
  };
}
