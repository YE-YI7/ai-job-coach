import type {NativeTool} from '@/lib/llm-tools';

/** 新工具先供隔离候选验证，未验收时不改变既有正式版工具契约。 */
export const f6CurrentTimeEnabled = () => process.env.F6_CURRENT_TIME_TOOL === 'v1';

export const F6_CURRENT_TIME_TOOL: NativeTool = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description: '读取服务器真实当前日期和时间。判断经历起止、在读或任职等当前状态、相对日期或招聘时效时可用；'
      + '不涉及时间判断的修改可直接进行。默认UTC，可指定IANA时区，例如Asia/Shanghai。'
      + '返回的是时间参照，不是候选人已经毕业、仍在读或仍在职的证明；状态仍依据本人材料。',
    parameters: {
      type: 'object',
      properties: {
        time_zone: {type: 'string', maxLength: 100, description: '可选IANA时区；省略时使用UTC。'},
      },
      required: [],
      additionalProperties: false,
    },
  },
};

/** 只读取服务器时钟，不联网、不读取个人资料，也不接受模型指定当前时刻。 */
export function f6CurrentTime(args: Record<string, unknown>, now = new Date()): Record<string, unknown> {
  const zone = args.time_zone === undefined ? 'UTC' : args.time_zone;
  if (typeof zone !== 'string' || !zone.trim() || zone.length > 100) throw Error('TIME_ZONE_INVALID');
  if (!Number.isFinite(now.getTime())) throw Error('SERVER_CLOCK_UNAVAILABLE');
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone.trim(), calendar: 'iso8601', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw Error('TIME_ZONE_INVALID');
  }
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return {
    source: 'server_clock',
    timestampUtc: now.toISOString(),
    asOfDateUtc: now.toISOString().slice(0, 10),
    timeZone: formatter.resolvedOptions().timeZone,
    localDate: `${part('year')}-${part('month')}-${part('day')}`,
    localTime: `${part('hour')}:${part('minute')}:${part('second')}`,
    personalFacts: false,
  };
}
