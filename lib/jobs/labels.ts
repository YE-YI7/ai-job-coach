/** 浏览器/服务端共用的展示定义，不引入数据库、网络或 node:crypto。 */
export type HardDimension = "years" | "education";
export const PENDING_LABEL: Record<HardDimension, string> = { years: "工作年限", education: "学历" };
