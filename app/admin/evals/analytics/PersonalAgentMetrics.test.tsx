import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PersonalAgentMetrics from "./PersonalAgentMetrics";
import { summarizeAgentInstall } from "@/lib/agent-install-metrics";

test("shows observed copy counts and keeps historical/local-use limits visible", () => {
  const html = renderToStaticMarkup(<PersonalAgentMetrics summary={summarizeAgentInstall([])} />);
  expect(html).toContain("个人 Agent · 安装入口");
  expect(html).toContain("复制成功的访客标识");
  expect(html).toContain("未采集");
  expect(html).toContain("历史无法补算");
  expect(html).toContain("不等于真实人数");
  expect(html).toContain("复制成功不代表已安装或使用");
});
