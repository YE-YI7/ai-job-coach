/**
 * 测试替身：一个最小的 Supabase/PostgREST 风格链式客户端。
 * **仅供 *.test.ts 使用**，生产代码不要 import（它不碰任何真实连接）。
 *
 * 为什么要自己写而不用 jest.fn 排队：run-ledger 的一次操作会同时读写
 * `coach_runs` / `coach_run_events` / `product_events` / `ai_generation_events`，
 * 调用顺序还跟状态机分支有关。按 (表, 调用序号) 排结果太脆，
 * 干脆做成带过滤语义的内存表，断言直接查表内容。
 */

type Row = Record<string, unknown>;

interface Filter {
  method: string;
  column: string;
  value: unknown;
}

const UUIDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
];

export class FakeDb {
  tables: Record<string, Row[]> = {};
  private sequence = 0;
  private failures: Array<{ table: string; method: string; error: unknown }> = [];

  constructor(seed: Record<string, Row[]> = {}) {
    this.tables = { ...seed };
    for (const table of ["coach_runs", "coach_run_events", "coach_run_context_selections", "product_events", "ai_generation_events"]) {
      if (!this.tables[table]) this.tables[table] = [];
    }
  }

  seedRows(table: string, rows: Row[]) {
    this.tables[table] = [...rows];
  }

  rows(table: string): Row[] {
    return this.tables[table] || [];
  }

  /** 让某张表某类操作返回 error（模拟落库失败）。 */
  fail(table: string, method: "insert" | "update" | "upsert" | "select", error: unknown) {
    this.failures.push({ table, method, error });
  }

  private errorFor(table: string, method: string): { error: unknown } | null {
    const match = this.failures.find((failure) => failure.table === table && (failure.method === method || failure.method === "select"));
    return match ? { error: match.error } : null;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  nextId(table: string): unknown {
    if (table === "coach_run_events" || table === "coach_run_context_selections") return ++this.sequence;
    const uuid = UUIDS[this.sequence % UUIDS.length];
    this.sequence += 1;
    return uuid;
  }

  applyInsert(table: string, rows: Row[]): Row[] {
    const stored = rows.map((row) => ({ ...row }));
    for (const row of stored) {
      if (row.id === undefined) row.id = this.nextId(table);
    }
    this.tables[table] = [...(this.tables[table] || []), ...stored];
    return stored;
}
}

class FakeQuery {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private orderClause: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private conflictColumns: string[] = [];
  private ignoreDuplicates = false;

  constructor(private db: FakeDb, private table: string) {}

  select(_columns?: string) {
    if (this.mode === "select") return this;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictColumns = (options?.onConflict || "").split(",").map((column) => column.trim()).filter(Boolean);
    this.ignoreDuplicates = Boolean(options?.ignoreDuplicates);
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ method: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ method: "neq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ method: "is", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ method: "in", column, value: values });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ method: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ method: "lte", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderClause = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const [column, jsonKey] = filter.column.split("->>");
      const value = jsonKey ? (row[column] as Row | undefined)?.[jsonKey] : row[column];
      switch (filter.method) {
        case "eq":
          return String(value) === String(filter.value);
        case "neq":
          return String(value) !== String(filter.value);
        case "is":
          return filter.value === null ? value === null || value === undefined : value === filter.value;
        case "in":
          return (filter.value as unknown[]).map(String).includes(String(value));
        case "gte":
          return new Date(String(value)).getTime() >= new Date(String(filter.value)).getTime();
        case "lte":
          return new Date(String(value)).getTime() <= new Date(String(filter.value)).getTime();
        default:
          return true;
      }
    });
  }

  private matched(): Row[] {
    const rows = (this.db.rows(this.table) || []).filter((row) => this.matches(row));
    if (this.orderClause) {
      const { column, ascending } = this.orderClause;
      rows.sort((left, right) => {
        const a = left[column];
        const b = right[column];
        if (a === b) return 0;
        // 数字主键（coach_run_events.id 是 bigint identity）必须按数值比，
        // 按字符串比会在第 10 条之后乱序。
        const numeric = typeof a === "number" && typeof b === "number";
        const comparison = numeric ? (a < b ? -1 : 1) : String(a) > String(b) ? 1 : -1;
        return ascending ? comparison : -comparison;
      });
    }
    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
  }

  private execute(): { data: unknown; error: unknown } {
    const failure = this.db["errorFor"](this.table, this.mode);
    if (failure) return { data: null, error: failure.error };

    switch (this.mode) {
      case "insert": {
        if (this.table === "coach_runs" && this.payload.some((candidate) => candidate.idempotency_key != null
          && this.db.rows(this.table).some((row) => row.user_id === candidate.user_id && row.idempotency_key === candidate.idempotency_key))) {
          return { data: null, error: { code: "23505", message: "duplicate idempotency key" } };
        }
        const inserted = this.db.applyInsert(this.table, this.payload);
        if (this.wantSingle) return { data: inserted[0] ?? null, error: null };
        if (this.wantMaybeSingle) return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }
      case "update": {
        const targets = this.matched();
        for (const row of targets) Object.assign(row, this.patch);
        if (this.wantSingle) return { data: targets[0] ?? null, error: targets.length ? null : { code: "PGRST116", message: "no rows" } };
        if (this.wantMaybeSingle) return { data: targets[0] ?? null, error: null };
        return { data: targets, error: null };
      }
      case "delete": {
        const targets = new Set(this.matched());
        this.db.tables[this.table] = this.db.rows(this.table).filter((row) => !targets.has(row));
        return { data: targets.size ? [...targets] : null, error: null };
      }
      case "upsert": {
        const existing = this.matched();
        const incoming = this.payload.map((row) => ({ ...row }));
        const matchedExisting = this.conflictColumns.length
          ? this.db
              .rows(this.table)
              .filter((row) =>
                incoming.some((candidate) => this.conflictColumns.every((column) => String(row[column]) === String(candidate[column]))),
              )
          : [];
        if (matchedExisting.length && this.ignoreDuplicates) {
          return { data: null, error: null };
        }
        if (matchedExisting.length) {
          for (const row of matchedExisting) Object.assign(row, incoming[0]);
          return { data: matchedExisting[0], error: null };
        }
        const inserted = this.db.applyInsert(this.table, incoming);
        if (this.wantSingle) return { data: inserted[0] ?? null, error: null };
        if (this.wantMaybeSingle) return { data: inserted[0] ?? null, error: null };
        void existing;
        return { data: inserted, error: null };
      }
      default: {
        // HTTP 读取返回快照，不是数据库行引用；否则后续 update 会悄悄修改旧查询结果，掩盖时序 bug。
        const rows = this.matched().map((row) => ({ ...row }));
        if (this.wantSingle) return { data: rows[0] ?? null, error: rows.length ? null : { code: "PGRST116", message: "no rows" } };
        if (this.wantMaybeSingle) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }
    }
  }

  then<TResult = unknown>(onResolved?: (value: { data: unknown; error: unknown }) => TResult): PromiseLike<TResult> {
    return Promise.resolve(this.execute()).then(onResolved);
  }
}

export function fakeDbClient(seed?: Record<string, Row[]>) {
  return new FakeDb(seed);
}
