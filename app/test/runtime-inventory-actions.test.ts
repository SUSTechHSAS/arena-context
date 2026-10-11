import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SourceClassRegistry } from '../src/game/runtime/class-registry';
import { createInventoryActions } from '../src/game/runtime/inventory-actions';
import { createWorldState } from '../src/game/world/state';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['停止自动移动', '触发游戏事件', '整理背包', '处理丢弃物品', '执行连发攻击', '使用装备槽物品', '卸下装备槽物品', '处理销毁物品', '尝试收集物品',
  '使用背包物品', '扣除金币', '执行修复', '执行重铸', '尝试出售', '尝试购买'];
const CLASSES = ['宠物', '金币', '侦测器', '时空罗盘'];
const STATE_GLOBALS = ['死亡界面已显示', '游戏设置', '玩家装备', '玩家背包', '当前天气效果', '装备栏每页装备数', '当前装备页', '最大背包容量', '中文模式', '命令行模式开启', '玩家',
  '地牢大小', '彩蛋1触发', '玩家属性', '当前NPC', '彩蛋2触发', '所有怪物', '所有计时器', '红蓝开关状态', '绿紫开关状态', 'NPC互动中'];
const GLOBALS = [...STATE_GLOBALS, 'isAutoMoving', 'moveQueue'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const chance = q => r() < q;
  function tag(v) {
    if (v && typeof v === 'object' && typeof v.message === 'string' && typeof v.stack === 'string') return ['Error', v.constructor.name, v.message];
    if (v && typeof v === 'object') return 'obj:' + (v.名称 ?? v.id ?? Object.keys(v).length);
    return v;
  }
  const log = (name, result) => (...a) => { calls.push([name, ...a.map(tag)]); return typeof result === 'function' ? result(...a) : result; };
  const timers = [];
  globalThis.setTimeout = (fn, ms) => { calls.push(['timeout', ms]); timers.push(fn); return timers.length; };
  const element = id => ({ id, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }), style: new Proxy({}, { set(t, k, v) { calls.push(['style', id, k, v]); t[k] = v; return true; } }) });
  const selections = {};
  globalThis.document = {
    getElementById: id => element(id),
    querySelector: sel => { calls.push(['query', sel]); return selections[sel] ?? null; },
    body: { contains: el => { calls.push(['contains', tag(el)]); return el.inDom; }, appendChild: () => calls.push(['fireworks']) },
    createElement: () => ({ style: { setProperty() {} }, appendChild() {}, remove() {} }),
  };
  globalThis.socket = { emit: log('emit') };
  globalThis.音效管理器 = { 播放音效: log('sound') };
  globalThis.位置是否可用 = log('available', () => chance(0.4));
  globalThis.检查移动可行性 = log('can-move', () => chance(0.7));
  globalThis.放置物品到单元格 = log('place'); globalThis.检查Q字形彩蛋 = log('q-egg'); globalThis.绘制 = log('draw');
  globalThis.显示收集特效 = log('collect-fx'); globalThis.confirm = log('confirm', () => chance(0.7));
  globalThis.关闭修复界面 = log('close-repair'); globalThis.关闭重铸界面 = log('close-reforge'); globalThis.打开收购窗口 = log('open-sell');
  globalThis.关闭收购窗口 = log('close-sell'); globalThis.关闭交易窗口 = log('close-trade');
  globalThis.显示通知 = log('notify'); globalThis.添加日志 = log('log'); globalThis.更新背包显示 = log('inv'); globalThis.更新装备显示 = log('equip');
  let serial = 0;
  class 物品 {
    constructor(c = {}) {
      this.名称 = c.名称 ?? pick(['剑', '药', '盾', '金币']); this.类型 = c.类型 ?? pick(['武器', '消耗品', '卷轴', '装备', '消耗品']);
      this.品质 = c.品质 ?? pick([1, 2, 3]); this.强化 = c.强化 ?? chance(0.2); this.最大堆叠数量 = c.最大堆叠数量 ?? pick([1, 8, 64]);
      this.堆叠数量 = c.数量 ?? pick([1, 1, 3, 7, 0]); this.唯一标识 = Symbol.for('i' + serial++); this.是否隐藏 = c.是否隐藏 ?? chance(0.1);
      this.能否拾起 = c.能否拾起 ?? chance(0.9); this.自定义数据 = new Map([['冷却剩余', pick([0, 0, 1])], ['攻击目标数', pick([1, 0, 2])], ['静默回合', pick([0, 0, 0, 2])],
        ['耐久', pick([3, 10, 0])], ['原耐久', 10], ['k', pick([1, 2])]]);
      if (chance(0.35)) this.自定义数据.set('附魔', [{ 种类: '连发附魔', 等级: pick([0, 1, 2]) }]);
      this.最终攻击范围 = 2; this.最终冷却回合 = 3; this.颜色表 = ['#f00', '#0f0']; this.颜色索引 = pick([0, 1, 5]); this.已装备 = false; this.装备槽位 = null;
      this.显示元素 = chance(0.6) ? { ...element('el' + serial), inDom: chance(0.7) } : null;
    }
    获取名称() { return '[' + this.名称 + ']'; }
    当被收集(who) { calls.push(['on-collect', this.名称, who]); return chance(0.9); }
    可堆叠于(o) { return o.名称 === this.名称 && this.最大堆叠数量 > 1 && this !== o; }
    比较自定义数据(d) { return this.自定义数据.get('k') === d.get('k'); }
    当被丢弃(x, y) { calls.push(['on-drop', this.名称, x, y]); return chance(0.85); }
    取消装备() { calls.push(['unequip', this.名称]); }
    使用(...a) { calls.push(['use', this.名称, ...a.map(v => Array.isArray(v) ? v.length : tag(v))]); const ok = chance(0.6); if (ok && chance(0.5)) this.堆叠数量 -= 1; return ok; }
    安全销毁() { calls.push(['safe-destroy', this.名称]); return chance(0.8); }
    当玩家攻击(m) { calls.push(['pet-attack', tag(m)]); }
    更新宠物管理窗口() { calls.push(['pet-window']); }
  }
  class 宠物 extends 物品 {}
  class 金币 extends 物品 { constructor(c = {}) { super({ 名称: '金币', 类型: '金币', 品质: 1, 最大堆叠数量: 64, 能否拾起: true, 是否隐藏: false, ...c }); } }
  class 侦测器 extends 物品 {}
  class 时空罗盘 extends 物品 {}
  Object.assign(globalThis, { 物品, ${CLASSES.join(', ')} });
  globalThis.克隆物品 = log('clone', o => { const c = new 物品({ 名称: o.名称, 类型: o.类型, 最大堆叠数量: o.最大堆叠数量, 数量: o.堆叠数量 }); return c; });
  globalThis.获取周围怪物 = log('nearby', () => chance(0.6) ? { 怪物: [{ 名称: '怪' }], 路径: [[]] } : { 怪物: null, 路径: null });
  const station = () => ({ 名称: '台', 自定义数据: new Map([['耐久', 3], ['最大耐久', 5]]), 计算修复消耗: log('repair-cost', () => pick([0, 5, 30, 200])),
    计算消耗: log('reforge-cost', () => pick([5, 300])) });
  const scrub = (value, seen = new Map()) => {
    if (typeof value === 'function') return 'fn:' + value.name;
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const kind = Object.prototype.toString.call(value);
    if (kind === '[object Map]') { const m = new Map(); seen.set(value, m); for (const [k, v] of value) m.set(scrub(k, seen), scrub(v, seen)); return m; }
    const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); seen.set(value, out);
    for (const key of Reflect.ownKeys(value)) out[key] = scrub(value[key], seen);
    return out;
  };
  const view = () => scrub({ ${GLOBALS.map(name => `${name}: ${name}`).join(', ')}, 互动: globalThis.互动, 当前重铸台: globalThis.当前重铸台 });
  globalThis.done = (() => {
    globalThis.联机模式 = false;
    地牢大小 = 6; 玩家 = { x: Math.floor(r() * 6), y: Math.floor(r() * 6) };
    死亡界面已显示 = chance(0.05); 游戏设置 = { 自动移动可打断: chance(0.6) }; isAutoMoving = chance(0.5); moveQueue = [1];
    当前天气效果 = chance(0.2) ? ['诡魅'] : []; 装备栏每页装备数 = 3; 当前装备页 = pick([0, 1]); 最大背包容量 = pick([4, 6, 12]);
    中文模式 = chance(0.3); 命令行模式开启 = chance(0.3); 彩蛋1触发 = chance(0.3); 彩蛋2触发 = chance(0.5) ? undefined : true;
    玩家属性 = { 允许移动: 0 }; 所有怪物 = [{ 名称: '怪' }]; 红蓝开关状态 = '红'; 绿紫开关状态 = '绿'; NPC互动中 = false;
    所有计时器 = [];
    for (let i = 0; i < 3; i++) {
      const d = new (chance(0.7) ? 侦测器 : 物品)(); d.x = Math.floor(r() * 6); d.y = Math.floor(r() * 6);
      d.自定义数据.set('侦测事件', pick(['玩家丢弃物品', '玩家拾起物品'])); d.自定义数据.set('侦测范围', pick([1, 3, 10])); d.自定义数据.set('切换开关', pick(['红蓝', '绿紫', '无']));
      所有计时器.push(d);
    }
    玩家背包 = new Map(); 玩家装备 = new Map();
    const add = item => { 玩家背包.set(item.唯一标识, item); return item; };
    for (let i = 3 + Math.floor(r() * 6); i > 0; i--) add(new (pick([物品, 物品, 物品, 宠物, 时空罗盘]))());
    for (let i = Math.floor(r() * 3); i > 0; i--) add(new 金币({ 数量: pick([5, 30, 64, 100]), 是否隐藏: chance(0.2) }));
    for (const item of 玩家背包.values()) {
      if (item instanceof 宠物) item.自定义数据.set('装备', { 武器: pick([...玩家背包.values()]), 护甲: null });
      if (item instanceof 宠物) item.自定义数据.set('休眠中', chance(0.3));
      if (chance(0.4)) { const slot = 1 + Math.floor(r() * 6); if (!玩家装备.has(slot)) { 玩家装备.set(slot, item); item.已装备 = true; item.装备槽位 = slot; } }
    }
    当前NPC = { 名称: 'NPC', x: 1, y: 2, 自定义数据: new Map([['交易次数', pick([0, 1, 3])], ['刷新次数', 2]]) };
    if (chance(0.7)) globalThis.当前重铸台 = chance(0.8) ? station() : null;
    const ids = () => pick([...玩家背包.keys(), Symbol.for('missing')]);
    const anyItem = () => pick([...玩家背包.values(), new 物品(), new 金币({ 数量: pick([10, 70]) }), null]);
    const select = () => {
      for (const sel of ['#repairableItemsContainer .selected', '#sourceItems .selected', '#materialItems .selected'])
        selections[sel] = chance(0.15) ? null : chance(0.1) ? {} : { __物品实例: chance(0.3) ? pick([...玩家背包.values()]) : pick([...玩家背包.values(), new 物品({ 名称: '剑' })]) };
      if (chance(0.3)) selections['#materialItems .selected'] = { __物品实例: new 物品({ 名称: selections['#sourceItems .selected']?.__物品实例?.名称 ?? '剑' }) };
    };
    const actions = [
      () => 整理背包(chance(0.5)),
      () => 处理丢弃物品(ids()),
      () => 使用装备槽物品(1 + Math.floor(r() * 6)),
      () => 卸下装备槽物品(1 + Math.floor(r() * 6)),
      () => 处理销毁物品(ids(), chance(0.5)),
      () => 尝试收集物品(anyItem(), chance(0.5)),
      () => 使用背包物品(ids()),
      () => { select(); const st = station(); try { return 执行修复(st); } finally { results.push(['repair-station', st.自定义数据.get('耐久'), st.效果描述, selections['#repairableItemsContainer .selected']?.__物品实例?.自定义数据?.get('耐久')]); } },
      () => { select(); try { return 执行重铸(); } finally { results.push(['reforge-items', ...['#sourceItems .selected', '#materialItems .selected'].map(k => selections[k]?.__物品实例?.自定义数据?.get('耐久')), globalThis.当前重铸台?.自定义数据?.get('耐久'), globalThis.当前重铸台?.效果描述]); } },
      () => 扣除金币(pick([0, 5, 50, 500])),
      () => 尝试出售(pick([...玩家背包.values()]), pick([3, 70, 130, 200]), 当前NPC),
      () => 尝试购买(new 物品({ 类型: pick(['NPC', '消耗品']), 数量: pick([1, 3]) }), pick([5, 40, 1000])),
      () => 触发游戏事件(pick(['玩家丢弃物品', '玩家拾起物品']), { x: Math.floor(r() * 6), y: Math.floor(r() * 6) }),
      () => 停止自动移动(),
      () => { const w = new 物品({ 类型: '武器', 数量: 1 }); w.自定义数据.set('冷却剩余', 0); w.自定义数据.set('附魔', [{ 种类: '连发附魔', 等级: pick([0, 1, 2, 3]) }]);
        const slot = 1 + 当前装备页 * 3 + Math.floor(r() * 3); 玩家装备.set(slot, w); w.已装备 = true; w.装备槽位 = slot; add(w); return 使用装备槽物品(slot); },
      () => { const sell = [...玩家背包.values()].filter(i => !(i instanceof 金币)); if (chance(0.5)) for (const c of [...玩家背包.values()]) if (c instanceof 金币) 玩家背包.delete(c.唯一标识);
        const keep = 最大背包容量 - pick([1, 2, 3]); for (const i of [...玩家背包.values()]) if ([...玩家背包.values()].filter(v => !v.是否隐藏).length > keep && i !== sell[0]) 玩家背包.delete(i.唯一标识);
        if (sell[0]) { sell[0].堆叠数量 = pick([1, 2]); sell.length = 1; }
        当前NPC.自定义数据.set('交易次数', 2); return 尝试出售(pick(sell.length ? sell : [...玩家背包.values()]), pick([3, 70, 130, 200]), 当前NPC); },
      () => { globalThis.当前重铸台 = station(); add(new 金币({ 数量: 64 })); const src = add(new 物品({ 名称: '锤' })); src.自定义数据.set('耐久', pick([3, 9, 10]));
        const mat = add(new 物品({ 名称: '锤' })); mat.自定义数据.set('耐久', pick([0, 2, 10]));
        selections['#sourceItems .selected'] = { __物品实例: src }; selections['#materialItems .selected'] = { __物品实例: mat };
        try { return 执行重铸(); } finally { results.push(['reforge-direct', src.自定义数据.get('耐久'), globalThis.当前重铸台?.效果描述]); } },
    ];
    for (let step = 0; step < 45; step++) {
      globalThis.联机模式 = chance(0.08);
      const k = Math.floor(r() * actions.length);
      try { results.push([k, tag(actions[k]())]); } catch (e) { results.push([k, tag(e)]); }
      if (玩家背包.size === 0) add(new 物品());
    }
    globalThis.联机模式 = false;
    for (let i = 0; i < 40 && timers.length; i++) { try { timers.shift()(); } catch (e) { results.push(['timer', tag(e)]); } }
    results.push(['view', view()]);
    globalThis.final = { results, calls };
  })();
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`let ${GLOBALS.join(', ')};
    ${['最大堆叠数', ...FUNCTIONS].map(name => declaration(name)).join('\n')}`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = Object.assign(createWorldState(), { moveQueue: [] as unknown[], isAutoMoving: false });
  for (const name of GLOBALS) if (!(name in state)) throw new Error(`state lacks ${name}`);
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const call = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => unknown>(name)(...args);
  type El = { style: Record<string, string> };
  const registry = new SourceClassRegistry();
  const actions = createInventoryActions(state, state, {
    classes: registry, online: () => g<boolean>('联机模式'), emit: action => g<{ emit(e: string, a: unknown): void }>('socket').emit('playerAction', action),
    notify: call('显示通知'), addLog: call('添加日志'), updateInventoryDisplay: call('更新背包显示'), updateEquipmentDisplay: call('更新装备显示'),
    positionAvailable: call('位置是否可用') as never, canMove: call('检查移动可行性') as never, placeItem: call('放置物品到单元格'), checkQEgg: call('检查Q字形彩蛋'),
    hideTooltip: () => { g<{ getElementById(id: string): El }>('document').getElementById('浮动提示框').style.display = 'none'; },
    draw: call('绘制'), nearbyMonsters: call('获取周围怪物') as never, playSound: name => g<{ 播放音效(n: string): void }>('音效管理器').播放音效(name),
    collectEffect: call('显示收集特效'), confirm: call('confirm') as never, inDocument: el => g<{ body: { contains(e: unknown): boolean } }>('document').body.contains(el),
    destroyEffect: (el, item) => {
      g<{ body: { appendChild(e: unknown): void } }>('document').body.appendChild({});
      void ((item as { 颜色表: string[]; 颜色索引: number }).颜色表[(item as { 颜色索引: number }).颜色索引] || '#fff');
      g<(f: () => void, ms: number) => void>('setTimeout')(() => {}, 800);
      (el as El).style.opacity = '0';
      (el as El).style.transition = 'opacity 0.2s';
    },
    pulseSlot: slot => {
      const 槽位 = g<{ getElementById(id: string): El }>('document').getElementById(`装备槽${slot}`);
      槽位.style.transform = 'scale(0.95)';
      g<(f: () => void, ms: number) => void>('setTimeout')(() => (槽位.style.transform = 'scale(1)'), 200);
    },
    selected: selector => g<{ querySelector(s: string): never }>('document').querySelector(selector),
    closeRepairWindow: call('关闭修复界面'), closeReforgeWindow: call('关闭重铸界面'), reforgeStation: () => g('当前重铸台'), openSellWindow: call('打开收购窗口'),
    closeSellWindow: call('关闭收购窗口'), closeTradeWindow: call('关闭交易窗口'), cloneItem: call('克隆物品'),
    schedule: (callback, ms) => g<(f: () => void, ms: number) => void>('setTimeout')(callback, ms), markInteracted: () => { new vm.Script('globalThis.互动 = true').runInContext(context); },
  });
  const defineAll = () => {
    for (const name of ['物品', ...CLASSES]) {
      const Kind = g<new (...a: unknown[]) => object>(name);
      registry.define(name, Kind, (...args) => new Kind(...args));
    }
  };
  Object.assign(context, actions, { __defineAll: defineAll });
  new vm.Script(`with (S) { ${scenario(seed).replace('globalThis.克隆物品 =', '__defineAll(); globalThis.克隆物品 =')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('inventory actions (P4: 整理背包 … 尝试购买)', () => {
  it('matches the source over 400 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 400; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const [kind, value] of source.results as [unknown, unknown][]) if (kind !== 'view') bump(`r${kind}:${String(JSON.stringify(value)).slice(0, 50)}`);
      for (const c of source.calls as unknown[][]) bump(`${c[0]}:${String(c[1]).slice(0, 12)}`);
    }
    const count = (prefix: string) => Object.entries(tally).filter(([k]) => k.startsWith(prefix)).reduce((sum, [, n]) => sum + n, 0);
    const rare: string[] = [];
    for (const key of ['r0:', 'r1:true', 'r1:false', 'r2:true', 'r2:false', 'r3:', 'r4:true', 'r4:false', 'r5:true', 'r5:false', 'r6:true', 'r6:false', 'r7:', 'r8:', 'r8:false',
      'r8:["Error","TypeError"', 'r8:["Error","ReferenceError","data', 'r9:true', 'r9:false', 'r10:', 'r11:["Error","ReferenceError","Cannot access', 'r12:', 'r13:',
      'emit:playerAction', 'notify:背包已整理', 'notify:周围没有空间', 'notify:丢弃了', 'notify:武器还未准备好', 'notify:太远了', 'notify:附近没有目标', 'notify:请使用卷轴键',
      'notify:请在装备栏中', 'notify:[', 'notify:已使用物品', 'notify:无法使用该物品', 'notify:已卸下', 'notify:背包已满', 'notify:请先选择一件', 'notify:该物品无法被修',
      'notify:该物品无需修复', 'notify:金币不足！需要', 'notify:成功修复', 'notify:需要选择两个有效', 'notify:需要选择两个不同', 'notify:装备名称不一致', 'notify:目标已满耐久',
      'notify:材料无可用耐久', 'notify:消耗 ', 'notify:探险家已经不想', 'notify:背包空间不足', 'notify:成功出售', 'notify:探险家满意', 'notify:金币不足！', 'notify:就是你小子',
      'notify:购买 ', 'log:侦测器 (', 'log:已收集物品', 'on-drop', 'unequip', 'place', 'q-egg', 'style:浮动提示框', 'style:装备槽', 'fireworks', 'contains', 'safe-destroy',
      'pet-window', 'pet-attack', 'sound:武器命中', 'sound:收集物品', 'collect-fx', 'timeout:200', 'timeout:800', 'confirm', 'clone', 'open-sell', 'close-sell', 'close-trade',
      'close-repair', 'close-reforge', 'reforge-cost', 'repair-cost', 'can-move', 'available'])
      if (count(key) <= 2) rare.push(`${key}=${count(key)}`);
    expect(rare).toEqual([]);
  }, 900_000);
});
