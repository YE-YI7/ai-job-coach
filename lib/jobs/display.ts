/** Display normalization only. Original place strings remain in the source. */
export function jobLocationLabel(raw: string): string {
  const locations = raw.split(/[、,，;；]/).map(value=>{
    const parts=value.trim().split(/\s*[-/]\s*/);
    const city=parts.at(-1)||"";
    return city.replace(/(?:市|省)$/g,"");
  }).filter(Boolean);
  return [...new Set(locations)].join(" · ") || "地点待核实";
}
