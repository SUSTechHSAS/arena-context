import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { playerWait, processTurn, startRest, stopRest, type RestSession, type TurnPorts } from '../src/game/world/turn';
import { declaration, originalDeclaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['处理回合逻辑', '玩家等待', '开始休息', '停止休息'];
const GLOBALS = ['prng', '地牢大小', '地牢', '玩家', '玩家属性', '自定义全局设置', '当前出战宠物列表', '当前层数', '当前天气效果', '房间列表', '房间地图',
  '跳过怪物回合剩余次数', '所有怪物', '宠物状态表', '玩家状态', '所有计时器', '玩家装备', '当前装备页', '装备栏每页装备数', '玩家总移动回合数', '移动历史',
  '死亡界面已显示', '玩家正在休息', '休息定时器', '移动间隔'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  const maybe = (chance, value) => r() < chance ? value : undefined;
  class Monster { constructor(id, room) { this.id = id; this.房间ID = room; this.当前生命值 = pick([0, 5, 10]); } 绘制血条() { calls.push(['hp-bar', this.id]); } }
  class 宠物 { constructor(id) { this.id = id; this.层数 = pick([0, 1, '1', 2]); } 执行回合AI() { calls.push(['pet-ai', this.id]); } 恢复生命值() { calls.push(['pet-heal', this.id]); } }
  class PetState { constructor(id) { this.id = id; } 更新状态() { calls.push(['pet-state', this.id]); } }
  class Effect { constructor(id) { this.id = id; } 更新状态() { calls.push(['effect', this.id]); } }
  class Timer { constructor(id) { this.id = id; } 更新倒计时() { calls.push(['timer', this.id]); } }
  class 挑战石碑 { constructor(id, on) { this.id = id; this.自定义数据 = new Map([['已激活', on]]); } 刷新生存挑战下一波(room) { calls.push(['survival-wave', this.id, room.id]); } }
  const element = name => r() < 0.15 ? null : { name, style: {}, classList: { add: c => calls.push(['class+', name, c]), remove: c => calls.push(['class-', name, c]) } };
  const queue = [];
  Object.assign(globalThis, { 宠物, 挑战石碑,
    联机模式: false,
    document: { querySelector: selector => { calls.push(['query', selector]); return element(selector); } },
    setTimeout: (fn, ms) => { calls.push(['setTimeout', ms]); queue.push(fn); return 'timer-' + queue.length; },
    clearTimeout: handle => calls.push(['clearTimeout', handle]),
    更新视口: (...a) => calls.push(['viewport', a.length]),
    显示通知: (...a) => calls.push(['notify', ...a]),
    添加日志: (...a) => calls.push(['log', ...a]),
    ...Object.fromEntries(['处理传送带效果', '更新武器冷却', '更新光源地图', '处理怪物回合', '绘制小地图', '处理天气效果', '更新物体指示器', '更新界面状态']
      .map(name => [name, (...a) => calls.push([name, ...a])])),
    生成迷宫怪物: n => calls.push(['maze-monsters', n]),
    更新胜利条件显示: () => calls.push(['victory-ui', 玩家总移动回合数]),
    刷新挑战房间下一波: room => calls.push(['challenge-wave', room.id]),
  });
  const setup = () => {
    地牢大小 = pick([3, 4, 5]);
    地牢 = Array.from({ length: r() < 0.1 ? 地牢大小 - 1 : 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => ({ x, y,
      关联物品: r() < 0.25 ? new 挑战石碑(x * 10 + y, pick([true, false, 1])) : null })));
    房间地图 = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => pick([0, 1, 2, '1', -1])));
    玩家 = { x: Math.floor(r() * 地牢大小), y: Math.floor(r() * 地牢大小) };
    玩家属性 = { 允许移动: pick([0, 0, 0, 1]), 当前能量值: pick([undefined, 10, 20, 21, 69.5, 70, 95]), 当前生命值: pick([undefined, -5, 40, 120]),
      能量自然恢复: maybe(0.4, pick([1, 3])), 生命自然恢复: maybe(0.4, pick([2, 5])), 能量流失: maybe(0.3, pick([1, 4])), 最大生命值加成: maybe(0.3, 20) };
    自定义全局设置 = { 初始能量值: pick([undefined, 0, 50, 200]), 禁用休息: r() < 0.15 };
    当前层数 = pick([0, 1, 5, 5]);
    当前天气效果 = r() < 0.3 ? ['深夜'] : ['大风'];
    所有怪物 = Array.from({ length: Math.floor(r() * 4) }, (_, i) => new Monster(i, pick([0, 1, 2])));
    当前出战宠物列表 = Array.from({ length: Math.floor(r() * 3) }, (_, i) => new 宠物(i));
    当前出战宠物列表.forEach(pet => { if (r() < 0.6) 宠物状态表.set(pet, new PetState(pet.id)); });
    玩家状态 = r() < 0.3 ? [new Effect(1), new Effect(2)] : [];
    所有计时器 = [new Timer(1), null, { 无: 1 }, new Timer(2)].filter(() => r() < 0.7);
    装备栏每页装备数 = pick([2, 3]); 当前装备页 = pick([0, 1]);
    玩家装备 = new Map(); for (let slot = 1; slot <= 6; slot++) if (r() < 0.5) 玩家装备.set(slot, r() < 0.5 ? new 宠物(100 + slot) : null);
    跳过怪物回合剩余次数 = pick([0, 0, 2]);
    死亡界面已显示 = r() < 0.1;
    移动间隔 = pick([100, 250]);
    房间列表 = Array.from({ length: Math.floor(r() * 4) }, (_, id) => {
      const room = { id: pick([id, String(id)]), 类型: pick(['房间', '黑暗房间', '挑战房间', '挑战房间']), isSurvivalChallenge: r() < 0.3 };
      if (room.类型 === '挑战房间' && r() < 0.8) room.挑战状态 = { 进行中: r() < 0.8, 波次当前回合数: pick([1, 2, 5]), 当前波次: pick([1, 3]), 总波次: 3,
        波次内怪物: 所有怪物.filter(() => r() < 0.5).concat(r() < 0.3 ? [new Monster(99, 0)] : []) };
      return room;
    });
  };
  setup();
  for (let step = 0; step < 14; step++) {
    const op = pick(['turn', 'turn', 'wait', 'rest', 'rest', 'fire', 'fire', 'stop', 'tweak', 'reset']);
    try {
      if (op === 'turn') results.push([op, 处理回合逻辑()]);
      if (op === 'wait') results.push([op, 玩家等待(...pick([[], [true], [false], [1]]))]);
      if (op === 'rest') results.push([op, 开始休息()]);
      if (op === 'fire') { const fn = queue.shift(); results.push([op, fn ? fn() : 'empty']); }
      if (op === 'stop') results.push([op, 停止休息()]);
      if (op === 'tweak') { 联机模式 = r() < 0.15; 玩家属性.允许移动 = pick([0, 0, 1]); 死亡界面已显示 = r() < 0.1; 玩家状态 = r() < 0.2 ? [new Effect(3)] : []; results.push([op]); }
      if (op === 'reset') { setup(); results.push([op]); }
    } catch (error) { results.push([op, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls, 玩家属性, 房间列表, 移动历史, 玩家正在休息, 休息定时器, 跳过怪物回合剩余次数, 玩家总移动回合数, 所有怪物, queue: queue.length };
`;

function sourceRun(seed: number, read: (name: string) => string = declaration) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => read(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 休息定时器: null, 移动间隔: 100 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const session: RestSession = {
    get 休息定时器() { return context.休息定时器; }, set 休息定时器(value) { context.休息定时器 = value; },
    get 移动间隔() { return context.移动间隔 as number; }, set 移动间隔(value) { context.移动间隔 = value; },
  };
  const timers = { setTimeout: fn('setTimeout'), clearTimeout: fn('clearTimeout') };
  const turnPorts: TurnPorts = {
    isOnline: () => g('联机模式'), updateVictoryDisplay: fn('更新胜利条件显示'), processConveyors: fn('处理传送带效果'), updateWeaponCooldowns: fn('更新武器冷却'),
    updateLightMap: fn('更新光源地图'), log: fn('添加日志'), processMonsterTurn: fn('处理怪物回合'), drawMinimap: fn('绘制小地图'),
    renderVitalBars: (health, power) => {
      const document = g<{ querySelector(s: string): { style: Record<string, string>; classList: { add(c: string): void; remove(c: string): void } } | null }>('document');
      const healthBar = document.querySelector('.health-bar');
      const powerBar = document.querySelector('.power-bar');
      for (const [bar, value] of [[healthBar, health], [powerBar, power]] as const) {
        if (bar) { bar.style.width = value.width; if (value.low) bar.classList.add('低数值警告'); else bar.classList.remove('低数值警告'); }
      }
    },
    processWeather: fn('处理天气效果'), updateObjectIndicators: fn('更新物体指示器'), spawnMazeMonsters: fn('生成迷宫怪物'),
    random: () => g<() => number>('__rand')(), isChallengeStele: item => item instanceof g<abstract new () => unknown>('挑战石碑'),
    isPet: item => item instanceof g<abstract new () => unknown>('宠物'), updateUiState: fn('更新界面状态'), refreshChallengeWave: fn('刷新挑战房间下一波'),
  };
  Object.assign(context, {
    处理回合逻辑: () => processTurn(state, turnPorts),
    玩家等待: (...args: unknown[]) => playerWait(state, { stopRest: fn('停止休息'), processTurn: fn('处理回合逻辑'), updateViewport: fn('更新视口') }, ...args),
    停止休息: () => stopRest(state, session, timers),
    开始休息: () => startRest(state, session, { ...timers, isOnline: () => g('联机模式'), notify: fn('显示通知'), playerWait: fn('玩家等待') }),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('turn loop (处理回合逻辑 / 玩家等待 / 开始休息 / 停止休息)', () => {
  it('matches the source over 300 seeded sessions', () => {
    const tally: Record<string, number> = { turns: 0, skipped: 0, energyRoll: 0, mazeTopUp: 0, survival: 0, challenge: 0, restTicks: 0, restDenied: 0, lowWarn: 0, light: 0 };
    let fixedSeeds = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      if (snap(sourceRun(seed, originalDeclaration)) !== snap(source)) fixedSeeds++; // SRC-11: unpatched source differs
      const calls = source.calls as unknown[][];
      const count = (pred: (c: unknown[]) => boolean) => calls.filter(pred).length;
      tally.turns! += count(c => c[0] === 'victory-ui');
      tally.skipped! += count(c => c[0] === 'log' && String(c[1]).startsWith('时空扭曲'));
      tally.energyRoll! += count(c => c[0] === 'prng');
      tally.mazeTopUp! += count(c => c[0] === 'maze-monsters');
      tally.survival! += count(c => c[0] === 'survival-wave');
      tally.challenge! += count(c => c[0] === 'challenge-wave');
      tally.restTicks! += count(c => c[0] === 'setTimeout');
      tally.restDenied! += count(c => c[0] === 'notify' && c[1] !== '开始休息...');
      tally.lowWarn! += count(c => c[0] === 'class+');
      tally.light! += count(c => c[0] === '更新光源地图');
    }
    expect(fixedSeeds, 'unpatched SRC-11 differs').toBeGreaterThan(5);
    for (const [key, value] of Object.entries(tally)) expect(value, key).toBeGreaterThan(5);
  });
});
