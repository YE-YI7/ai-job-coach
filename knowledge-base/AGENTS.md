# 知识库维护规则

- 先读 `SOURCE_OF_TRUTH.md`，再定位具体知识文档。
- `manifest.json` 是机器可读导航；Markdown 文档是知识正文；`data/job-knowledge.seed.json` 是来源证据。
- 不从单条面经推导公司固定题库，不把外部案例写成用户经历。
- 每条知识结论必须能追溯到 manifest 中登记的来源；证据不足时标记为假设或待验证。
- 修改知识文档或 manifest 后，从仓库根目录运行 `npm run knowledge:build`。
