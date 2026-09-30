/**
 * 数据库列名合同：代码里写的表名/列名必须真的存在于生产库。
 *
 * 为什么要有这个测试：单元测试跑的是假客户端（或离线直通），列名写错在测试里
 * 永远不会红；到了生产是整条 PostgREST 查询报 42703，功能直接 500。
 * 本轮就抓到一次——邀请码台账选了生产库里不存在的 `invites.expires_at`。
 *
 * 真源是 data/supabase-production-schema.json（从生产 PostgREST 拉的快照），
 * 不是 supabase/migrations：生产有若干历史手工建的表不在迁移目录里。
 *
 * 有意不扫 `.eq()/.order()` 的列名：多个查询会在 Promise.all 里交错
 * （repository.ts 的 claimQuery/artifactQuery 就是），"最近的 .from()" 这种
 * 归因会张冠李戴，宁可漏报也不留一个会误报的门。
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data/supabase-production-schema.json"), "utf8"),
) as { tables: Record<string, string[]> };

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const FILES = ["app", "lib", "components"].flatMap(sourceFiles);

function nearestTable(src: string, pos: number): string | null {
  const before = src.slice(0, pos);
  const matches = [...before.matchAll(/\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

function lineOf(src: string, pos: number): number {
  return src.slice(0, pos).split("\n").length;
}

function objectLiteralAfter(src: string, fromIdx: number): string | null {
  const open = src.indexOf("{", fromIdx);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

/** 只取对象字面量的顶层键：嵌套对象是 jsonb 载荷里的字段，不是列。 */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  const flush = (chunk: string) => {
    const trimmed = chunk.trim();
    if (!trimmed || trimmed.startsWith("...")) return; // 展开：静态读不出键名
    const match = /^(['"`]?)([A-Za-z0-9_$]+)\1\s*:/.exec(trimmed);
    if (match) keys.push(match[2]);
  };
  for (const char of body) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; current += char; continue; }
    if ("{[(".includes(char)) depth++;
    else if ("}])".includes(char)) depth--;
    if (char === "," && depth === 0) { flush(current); current = ""; continue; }
    current += char;
  }
  flush(current);
  return keys;
}

function selectColumns(literal: string): string[] {
  return literal
    .split(",")
    .map((part) => part.replace(/->>?/g, "").split("::")[0].trim())
    .filter((part) => /^[a-z_][a-z0-9_]*$/.test(part)); // 去掉 *、别名、嵌入表
}

const UPSERT_OPTIONS = new Set(["onConflict", "ignoreDuplicates", "default_to_grouping"]);

function collectFindings() {
  const findings: string[] = [];
  let scanned = { tables: 0, selects: 0, payloads: 0 };
  for (const file of FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");

    for (const match of src.matchAll(/\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/g)) {
      scanned.tables++;
      if (!SNAPSHOT.tables[match[1]]) {
        findings.push(`${file}:${lineOf(src, match.index)} 生产库里没有表 ${match[1]}`);
      }
    }

    for (const match of src.matchAll(/\.select\(\s*["'`]([^"'`]+)["'`]/g)) {
      const table = nearestTable(src, match.index);
      if (!table || !SNAPSHOT.tables[table]) continue;
      scanned.selects++;
      for (const column of selectColumns(match[1])) {
        if (!SNAPSHOT.tables[table].includes(column)) {
          findings.push(`${file}:${lineOf(src, match.index)} ${table}.select 里有生产库没有的列 ${column}`);
        }
      }
    }

    for (const match of src.matchAll(/\.(insert|upsert|update)\s*\(\s*/g)) {
      const table = nearestTable(src, match.index);
      if (!table || !SNAPSHOT.tables[table]) continue;
      const after = src.slice(match.index + match[0].length).trimStart();
      if (after[0] !== "{") continue; // 载荷是变量或 .map()：静态读不出
      const body = objectLiteralAfter(src, match.index);
      if (!body) continue;
      scanned.payloads++;
      for (const key of topLevelKeys(body)) {
        if (UPSERT_OPTIONS.has(key)) continue;
        if (!SNAPSHOT.tables[table].includes(key)) {
          findings.push(`${file}:${lineOf(src, match.index)} ${table}.${match[1]} 里有生产库没有的列 ${key}`);
        }
      }
    }
  }
  return { findings, scanned };
}

describe("数据库列名合同（代码 vs 生产 schema 快照）", () => {
  const { findings, scanned } = collectFindings();

  test("扫描器本身有效：能抓到历史上真出过的 invites.expires_at", () => {
    const sample = `const r = await client.from("invites").select("code, used, expires_at").limit(1);`;
    const table = nearestTable(sample, sample.indexOf(".select"));
    const bad = selectColumns(/\.select\(\s*"([^"]+)"/.exec(sample)![1])
      .filter((column) => !SNAPSHOT.tables[table!].includes(column));
    expect(table).toBe("invites");
    expect(bad).toContain("expires_at");
  });

  test(`扫到了足够多的调用点（少于这个数说明解析退化）：表 ${scanned.tables} / select ${scanned.selects} / 写入 ${scanned.payloads}`, () => {
    expect(scanned.tables).toBeGreaterThan(150);
    expect(scanned.selects).toBeGreaterThan(100);
    expect(scanned.payloads).toBeGreaterThan(50);
  });

  test("生产快照覆盖当前代码用到的每一张表", () => {
    const missing = findings.filter((finding) => finding.includes("没有表"));
    expect(missing).toEqual([]);
  });

  test("代码引用的列名全部存在于生产库", () => {
    const columns = findings.filter((finding) => !finding.includes("没有表"));
    // 失败时怎么修：确认是新迁移加的列 → 重拉生产快照；否则改代码里的列名。
    expect(columns).toEqual([]);
  });

  (fs.existsSync(path.join(ROOT, "app/api/admin/invites/route.ts")) ? test : test.skip)("可选管理员台账端点不选生产库没有的列（独立管理员改动未发布时明确跳过）", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/admin/invites/route.ts"), "utf8");
    const selected = /\.select\(\s*"([^"]+)"/.exec(src)?.[1] ?? "";
    expect(selected).toContain("redeemed_by");
    expect(selected).not.toContain("expires_at");
  });
});
