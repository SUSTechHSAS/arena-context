import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { handleCreativeLevelDeath, type CreativeDeathPorts } from '../src/game/world/creative-death';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  let clock = 1000; const frames = [];
  Date.now = () => clock; Math.random = () => { const v = r(); calls.push(['random', v]); return v; };
  class Query {
    constructor(table) { this.table = table; calls.push(['from', table]); }
    select(cols) { calls.push(['select', cols]); return this; }
    eq(key, value) {
      calls.push(['eq', key, value]);
      const k = r();
      if (k < 0.05) throw new RangeError('sync');
      if (k < 0.1) return Promise.reject(new EvalError('rejected'));
      const n = Math.floor(r() * 6);
      const data = k >= 0.25 && k < 0.32 ? null : Array.from({ length: n }, () => ({ x: Math.floor(r() * 14) - 2, y: Math.floor(r() * 14) - 2, extra: 1 }));
      return Promise.resolve({ data, error: k < 0.22 ? { message: 'db' } : k < 0.25 ? '' : null });
    }
    insert(rows) { calls.push(['insert', rows]); if (r() < 0.05) throw new SyntaxError('insert'); return Promise.resolve({ error: r() < 0.3 ? 'quota' : null }); }
  }
  Object.assign(globalThis, {
    supabase: new (class { from(t) { return new Query(t); } })(),
    document: { body: { classList: new (class { add(c) { calls.push(['add', c]); } remove(c) { calls.push(['remove', c, 玩家属性.允许移动]); } })() } },
    console: new (class { error(m, e) { calls.push(['console.error', m, e && e.constructor ? e.constructor.name : e]); } })(),
    requestAnimationFrame: cb => { calls.push(['raf']); frames.push(cb); },
    绘制: () => calls.push(['draw', clock, JSON.stringify(待绘制死亡标记)]),
    显示死亡界面: reason => calls.push(['death-screen', reason, 玩家属性.允许移动, JSON.stringify(待绘制死亡标记)]),
  });
  globalThis.done = (async () => {
    for (let session = 0; session < 8; session++) {
      当前关卡ID = pick([null, 'lvl-1', 42]); 视口偏移X = pick([0, 2, -1]); 视口偏移Y = pick([0, 3]); 相机显示边长 = pick([5, 9, 0]);
      玩家 = { x: Math.floor(r() * 10), y: Math.floor(r() * 10) }; 玩家属性 = { 允许移动: pick([0, 1, 2]) };
      const reason = pick(['陷阱', undefined, '饥饿']);
      try { results.push(['ok', await 处理创意关卡死亡事件(reason)]); } catch (error) { results.push(['throw', error.constructor.name]); }
      for (let i = 0; i < 10; i++) await null;
      let guard = 0;
      while (frames.length && guard++ < 30) { clock += pick([16, 400, 900, 2600]); frames.shift()(); }
      for (let i = 0; i < 10; i++) await null;
      results.push([玩家属性, JSON.stringify(待绘制死亡标记), frames.length]);
    }
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`let 待绘制死亡标记 = [];\n${declaration('处理创意关卡死亡事件')}`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 待绘制死亡标记: [] }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const db = () => g<{ from(t: string): Loose }>('supabase').from('death_locations');
  type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const ports: CreativeDeathPorts = {
    selectDeathLocations: (id) => db().select('x, y').eq('level_id', id),
    insertDeathLocations: (rows) => db().insert(rows),
    viewport: () => ({ offsetX: g('视口偏移X'), offsetY: g('视口偏移Y'), side: g('相机显示边长') }),
    setDeathDisplay: (active) => { const list = g<Loose>('document').body.classList; if (active) list.add('death-display-active'); else list.remove('death-display-active'); },
    setDeathMarkers: (markers) => { context.待绘制死亡标记 = markers; },
    now: () => g<DateConstructor>('Date').now(), random: () => g<Math>('Math').random(),
    requestAnimationFrame: (cb) => g<(cb: () => void) => void>('requestAnimationFrame')(cb),
    draw: () => g<() => void>('绘制')(), showDeathScreen: (reason) => g<(r: unknown) => void>('显示死亡界面')(reason),
    logError: (message, error) => g<Loose>('console').error(message, error),
  };
  context.处理创意关卡死亡事件 = (reason: unknown) => handleCreativeLevelDeath(state, ports, reason);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('creative level death markers (处理创意关卡死亡事件)', () => {
  it('matches the source over 400 seeded runs', async () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 400; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const key = call[0] === 'console.error' ? `err:${String(call[1]).slice(0, 4)}:${String(call[2])}` : String(call[0]);
        tally[key] = (tally[key] ?? 0) + 1;
      }
    }
    for (const key of ['eq', 'insert', 'add', 'remove', 'raf', 'draw', 'death-screen', 'random', 'err:上传死亡:String', 'err:处理创意:RangeError',
      'err:处理创意:TypeError', 'err:处理创意:EvalError', 'err:处理创意:SyntaxError', 'err:处理创意:Object'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
