/**
 * 子 Agent 契约包（W2）。五个子 Agent 各一个文件，共享骨架在 contract.ts。
 * 接线顺序遵守施工契约：W0/W1 落地前本包只作为独立模块存在，
 * 主链路不得直接 import 产物内容进 prompt——取料只能走 mainPromptPayloadFor。
 */
export * from "./contract";
export * from "./retrieval";
export * from "./verification";
export * from "./research";
export * from "./state-observation";
export * from "./resume";
