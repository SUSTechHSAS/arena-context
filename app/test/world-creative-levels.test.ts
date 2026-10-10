import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { importCreativeLevel, playCreativeLevel, publishLevel, resetCreativeLevel, type CreativeLevelPorts, type CreativeLevelSession } from '../src/game/world/creative-levels';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  let urls = 0; const timers = []; let dialog = null;
  const sign = text => 'sig:' + text.length;
  const signed = obj => { const o = { ...obj }; o.signature = sign(JSON.stringify(obj)); return JSON.stringify(o); };
  const levels = () => pick(['{bad', 'null', '5', '"x"', JSON.stringify({ a: 1 }), JSON.stringify({ isPublished: true, a: 1 }),
    signed({ isPublished: true, 地牢: [r()], 关卡标题: '塔' }), signed({ isPublished: true, 地牢: [1] }),
    signed({ isPublished: true, 游戏版本: 游戏版本 + 1 }), signed({ isPublished: true, 游戏版本: 游戏版本 - 1, 关卡标题: '' }),
    JSON.stringify({ isPublished: true, signature: 'sig:999', b: 2 }), JSON.stringify({ isPublished: true, signature: '', c: 3 }), signed({ isPublished: true, 游戏版本: 游戏版本 }), signed({ isPublished: 1, signature2: 'x' })]);
  const backups = () => pick([null, '', '{bad', 'null', JSON.stringify({ 玩家: { 属性: { 允许移动: 2 }, x: 9 }, 编辑器状态数据: 1, 配方信息: 2, signature: 'o' }),
    JSON.stringify({ 玩家: { 属性: 5 }, z: r() }), JSON.stringify({ 玩家: {} }), JSON.stringify({ 地牢: [] }), JSON.stringify({ 玩家: { 属性: null } })]);
  class Link { set href(v) { calls.push(['href', v]); } set download(v) { calls.push(['download', v]); } click() { calls.push(['click']); } }
  class Style { constructor(id) { Object.defineProperty(this, 'id', { value: id }); } set display(v) { calls.push(['display', this.id, v]); } }
  const errName = e => e && e.constructor ? e.constructor.name + ':' + String(e.message).slice(0, 10) : String(e);
  Object.assign(globalThis, {
    Blob: class { constructor(parts, opts) { calls.push(['blob', parts, opts]); this.parts = parts; } },
    URL: new (class { createObjectURL(b) { const u = 'blob:' + ++urls; calls.push(['url', u]); return u; } revokeObjectURL(u) { calls.push(['revoke', u]); } })(),
    document: new (class { createElement(t) { calls.push(['create', t]); return new Link(); } getElementById(id) { calls.push(['byId', id]); return { style: new Style(id) }; }
      get body() { return new (class { appendChild() { calls.push(['append']); } removeChild() { calls.push(['remove']); } })(); } })(),
    console: new (class { error(m, e) { calls.push(['console.error', typeof m === 'string' ? m : errName(m), e === undefined ? '-' : errName(e)]); } })(),
    显示通知: (...a) => calls.push(['notify', ...a]), 显示主菜单: () => calls.push(['main-menu']),
    启动游戏: (data, flag) => calls.push(['start', JSON.stringify(data), flag, 当前关卡存档数据字符串]),
    prompt: (m, d) => { const v = pick([null, '', '  ', '关卡B', 'a:b']); calls.push(['prompt', m, d, v]); return v; },
    生成签名: async text => { calls.push(['sign', text.length]); await null; if (r() < 0.05) throw new EvalError('sign'); return sign(text); },
    prng: () => { const v = r(); calls.push(['prng', v]); return v; },
    supabase: null,
    fetch: async url => { calls.push(['fetch', url]); await null; const k = r();
      if (k < 0.05) throw new TypeError('offline'); if (k < 0.08) throw 'plain'; if (k < 0.1) throw null; 
      return { ok: k > 0.15, statusText: 'Not Found', text: async () => { calls.push(['text']); return levels(); } }; },
    显示自定义确认对话框: (m, cb) => { calls.push(['dialog', m]); dialog = cb; }, 关闭设置菜单: () => calls.push(['close-settings']),
    setTimeout: (cb, ms) => { calls.push(['timeout', ms]); timers.push(cb); },
  });
  globalThis.done = (async () => {
    for (let session = 0; session < 10; session++) {
      Date = class extends Date { toISOString() { return '2026-10-10T11:0' + session + ':00.5Z'; } };
      supabase = r() < 0.6 ? new (class { rpc(name, params) { calls.push(['rpc', name, params]); return Promise.resolve({ error: r() < 0.3 ? { code: 1 } : null }); } })() : null;
      编辑器状态备份 = backups(); 切换动画 = pick([false, true]); 相机显示边长 = pick([15, 21]); 游戏设置 = { 受伤时击退: pick([true, false, undefined]) };
      玩家初始位置 = { x: Math.floor(r() * 9), y: 3 }; 是否是自定义关卡 = r() < 0.7; 当前关卡存档数据字符串 = pick([null, '', '{"a":1}', '{bad']);
      当前加载的关卡数据缓存 = pick([null, { id: '7', data: levels() }, { id: 8, data: levels() }]); 当前关卡ID = 'old';
      const which = pick(['import', 'import', 'publish', 'play', 'play', 'reset']);
      try {
        let v;
        if (which === 'import') v = await 导入创意关卡(levels());
        else if (which === 'publish') v = await 发布关卡();
        else if (which === 'play') { v = await 游玩创意关卡(pick(['u1', 'u2']), pick([7, '7', 8, null, 0])); calls.push(['play-done']); }
        else v = 重置创意关卡();
        for (let i = 0; i < 6; i++) await null;
        if (dialog && r() < 0.8) { const cb = dialog; dialog = null; cb(); }
        while (timers.length) timers.shift()();
        results.push(['ok', which, v]);
      } catch (error) { results.push(['throw', which, errName(error)]); }
      dialog = null; timers.length = 0;
      results.push([当前关卡ID, 当前关卡存档数据字符串]);
    }
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${declaration('游戏版本')}\n${['导入创意关卡', '发布关卡', '游玩创意关卡', '重置创意关卡'].map((n) => declaration(n)).join('\n')}
    var 当前关卡存档数据字符串 = null, 当前关卡ID = null;`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 游戏版本: 1534 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => Loose>(name)(...args);
  const session = Object.defineProperties({}, { 编辑器状态备份: { get: () => context.编辑器状态备份, set: (v) => { context.编辑器状态备份 = v; } } }) as CreativeLevelSession;
  const links = new Map<unknown, Loose>();
  const ports: CreativeLevelPorts = {
    notify: fn('显示通知'), prompt: fn('prompt'), sign: fn('生成签名'), animationMode: () => g('切换动画'), cameraSide: () => g('相机显示边长'),
    prng: fn('prng'), startGame: fn('启动游戏'), showMainMenu: fn('显示主菜单'),
    logError: (...a: unknown[]) => g<Loose>('console').error(...a),
    supabaseAvailable: () => g('supabase'), rpc: (name, params) => g<Loose>('supabase').rpc(name, params), fetch: fn('fetch'),
    hideElement: (id) => { g<Loose>('document').getElementById(id).style.display = 'none'; },
    confirmDialog: fn('显示自定义确认对话框'), closeSettingsMenu: fn('关闭设置菜单'), setTimeout: fn('setTimeout'),
    createDownloadUrl: (text) => {
      const Blob = g<Loose>('Blob'); const url = g<Loose>('URL').createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = g<Loose>('document').createElement('a'); link.href = url; links.set(url, link); return url;
    },
    isoNow: () => new (g<DateConstructor>('Date'))().toISOString(),
    clickDownload: (url, fileName) => { const link = links.get(url); link.download = fileName; const doc = g<Loose>('document'); doc.body.appendChild(link); link.click(); doc.body.removeChild(link); },
    revokeUrl: (url) => g<Loose>('URL').revokeObjectURL(url),
  };
  Object.assign(context, {
    导入创意关卡: (text: string) => importCreativeLevel(state, ports, text), 发布关卡: () => publishLevel(state, session, ports),
    游玩创意关卡: (url: unknown, id: unknown) => playCreativeLevel(state, ports, url, id), 重置创意关卡: () => resetCreativeLevel(state, ports),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('creative level flows (导入创意关卡, 发布关卡, 游玩创意关卡, 重置创意关卡)', () => {
  it('matches the source over 500 seeded runs', async () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 500; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const key = call[0] === 'notify' ? `notify:${String(call[1]).slice(0, 6)}` : call[0] === 'console.error' ? `err:${String(call[1]).slice(0, 6)}` : String(call[0]);
        tally[key] = (tally[key] ?? 0) + 1;
      }
      for (const entry of source.results as unknown[][]) if (entry?.[0] === 'throw') tally.throw = (tally.throw ?? 0) + 1;
    }
    for (const key of ['start', 'main-menu', 'prng', 'rpc', 'fetch', 'text', 'display', 'dialog', 'close-settings', 'timeout', 'click', 'revoke', 'throw',
      'notify:这不是一个已', 'notify:加载失败：关', 'notify:存档版本 (', 'notify:欢迎来到：塔', 'notify:加载创意关卡', 'notify:找不到原始地', 'notify:已取消发布。',
      'notify:关卡已成功发', 'notify:发布关卡时发', 'notify:正在加载关卡', 'notify:无法重置：未', 'err:增加游玩次数', 'err:加载创意关卡', 'err:TypeEr'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 300_000);
});
