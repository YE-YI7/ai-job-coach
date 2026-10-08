/** Negative preference clauses are constraints, not positive search terms. */
export function positiveDirection(role: string) {
  return role.split(/[，,。；;\n]/).filter(clause =>
    !/^\s*(?:不考虑|不找|不要|排除|不做|不接受|not\b|excluding\b)/i.test(clause),
  ).join("，").trim();
}
