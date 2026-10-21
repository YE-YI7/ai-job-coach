export type QuotaPool="chat"|"resume"|"interview";
export function quotaActionLabel(type:QuotaPool,check?:{allowed:boolean;source?:string;remaining?:number|null}){
 if(!check)return "费用待确认";
 if(check.source==="tokenpay")return "TokenPay 按模型用量计费";
 if(type==="resume"&&check.source==="free")return "整份修改需付费 · 体验仅限一段";
 if(!check.allowed)return "额度不足";
 if(check.source==="watcha")return `1 积分 · 余 ${check.remaining??"—"}`;
 const pool=type==="resume"?"简历":type==="interview"&&check.source!=="free"?"面试":"聊天";
 return `${pool}${check.source==="free"?"免费":"付费"} 1 次 · 余 ${check.remaining??"—"}`;
}
