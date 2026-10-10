import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { exportCurrentStateAsCreativeLevel, type CreativeExportPorts } from '../src/game/world/creative-export';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  let urls = 0;
  const saves = [() => '', () => null, () => '{bad', () => 'null', () => '5', () => '"text"', () => '[1,2]',
    () => JSON.stringify({ 地牢: [[1]], signature: 'old', 编辑器状态数据: { a: 1 }, 配方信息: [1], 关卡标题: 'x', z: r() }),
    () => JSON.stringify({ 楼层: Math.floor(r() * 9), 配方信息: null, isPublished: false }),
    () => JSON.stringify({ signature: 's', q: [r(), { w: 'v' }] }), () => { throw new RangeError('save'); }];
  class Link { set href(v) { calls.push(['href', v]); } set download(v) { calls.push(['download', v]); } click() { calls.push(['click']); } }
  Object.assign(globalThis, {
    Blob: class { constructor(parts, opts) { calls.push(['blob', parts, opts]); this.parts = parts; } },
    URL: new (class { createObjectURL(b) { const u = 'blob:' + ++urls; calls.push(['url', u, b.parts]); return u; } revokeObjectURL(u) { calls.push(['revoke', u]); } })(),
    document: new (class { createElement(t) { calls.push(['create', t]); return new Link(); }
      get body() { return new (class { appendChild(e) { calls.push(['append', e.constructor.name]); } removeChild(e) { calls.push(['remove', e.constructor.name]); } })(); } })(),
    console: new (class { error(e) { calls.push(['console.error', e.constructor.name, String(e.message).slice(0, 12)]); } })(),
    显示通知: (m, t) => calls.push(['notify', m, t]),
    prompt: (m, d) => { const v = pick([null, '', '   ', '关卡A', ' 我的 ', 'x:y.z']); calls.push(['prompt', m, d, v]); return v; },
    保存游戏状态: () => { const v = pick(saves)(); calls.push(['save', v]); return v; },
    生成签名: async text => { calls.push(['sign', text]); await null; if (r() < 0.08) throw new EvalError('sign'); return 'sig:' + text.length; },
  });
  globalThis.done = (async () => {
    for (let session = 0; session < 8; session++) {
      游戏状态 = pick(['编辑器游玩', '编辑器游玩', '游戏中']); 开发者模式 = pick([true, true, false, 1]); 切换动画 = pick([false, true, 'auto']);
      Date = class extends Date { toISOString() { return '2026-10-10T10:2' + session + ':33.12' + session + 'Z'; } };
      try { results.push(['ok', await 导出当前状态为创意关卡()]); } catch (error) { results.push(['throw', error.constructor.name]); }
    }
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${declaration('导出当前状态为创意关卡')}\nvar 切换动画 = false;`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const links = new Map<unknown, Loose>();
  const ports: CreativeExportPorts = {
    notify: (m, t) => g<Loose>('显示通知')(m, t), prompt: (m, d) => g<Loose>('prompt')(m, d), saveGameState: () => g<Loose>('保存游戏状态')(),
    sign: (text) => g<Loose>('生成签名')(text), animationMode: () => g('切换动画'),
    createDownloadUrl: (text) => {
      const Blob = g<Loose>('Blob'); const url = g<Loose>('URL').createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = g<Loose>('document').createElement('a'); link.href = url; links.set(url, link); return url;
    },
    isoNow: () => new (g<DateConstructor>('Date'))().toISOString(),
    clickDownload: (url, fileName) => {
      const link = links.get(url); link.download = fileName; const doc = g<Loose>('document');
      doc.body.appendChild(link); link.click(); doc.body.removeChild(link);
    },
    revokeUrl: (url) => g<Loose>('URL').revokeObjectURL(url),
    logError: (e) => g<Loose>('console').error(e),
  };
  context.导出当前状态为创意关卡 = () => exportCurrentStateAsCreativeLevel(state, ports);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('export live state as creative level (导出当前状态为创意关卡)', () => {
  it('matches the source over 500 seeded runs', async () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 500; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const key = call[0] === 'notify' ? `notify:${String(call[1]).slice(0, 3)}` : call[0] === 'console.error' ? `err:${String(call[1])}` : String(call[0]);
        tally[key] = (tally[key] ?? 0) + 1;
      }
      for (const call of source.calls as unknown[][]) if (call[0] === 'url' && !String((call[2] as string[])[0]).startsWith('{')) tally.primitive = (tally.primitive ?? 0) + 1;
    }
    for (const key of ['prompt', 'save', 'sign', 'blob', 'url', 'download', 'click', 'revoke', 'notify:此功能', 'notify:已取消', 'notify:当前状', 'notify:导出当',
      'err:Error', 'err:SyntaxError', 'err:TypeError', 'err:RangeError', 'err:EvalError', 'primitive'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
