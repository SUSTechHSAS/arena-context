import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型, 环境类型, 调试序列, 颜色表 } from '../src/game/world/constants';
import { movePlayer, type MovePorts, type MoveSession } from '../src/game/world/move';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['移动玩家'];
const GLOBALS = ['prng', '单元格类型', '环境类型', '颜色表', '调试序列'];
const SESSION = ['相机目标X', '相机目标Y', '编辑器状态', '玩家动画状态', '上次移动', '相机锁定', '钩索移动定时器', '切换动画', 'moveQueue', 'isAutoMoving'] as const;
// The literal class list of the source's debug-sequence reward, in order.
const DEBUG_ITEMS = ['迅捷卷轴', '秘银锁甲', '跃迁卷轴', '真言卷轴', '调试工具', '湮灭卷轴', '贪婪卷轴', '附魔卷轴', '回旋镖', '冰霜法杖', '剧毒匕首', '重力锤', '闪电链法杖', '大地猛击锤',
  '穿云箭', '荆棘鞭', '能量药水', '狂暴药水', '神龟药水', '治疗药水', '透视药水', '隐身药水', '橡木法杖', '金币手枪', '寻宝戒指', '炸弹', '冰盾', '重铸台', '神秘商人', '探险家', '喷火枪',
  '背包扩容祭坛', '水母', '金币'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let clock = 1000;
  class Thing { constructor(kind) { this.kind = kind; this.自定义数据 = new Map(); } }
  class 栅栏 extends Thing { 尝试互动() { calls.push(['fence', this.kind]); } }
  class 推箱子箱子 extends Thing {}
  class 压感开关 extends Thing { 触发(on) { calls.push(['plate', this.kind, on]); } }
  class 推箱子目标 extends Thing {}
  class 折跃门 extends Thing { 使用() { calls.push(['warp', this.kind]); } }
  class 寻宝戒指 extends Thing { constructor(o) { super('ring'); if (o) calls.push(['new', '寻宝戒指', o.数量]); } 尝试生成折跃门() { calls.push(['ring-gate', this.kind]); } }
  class Scroll { constructor(id) { this.id = id; } 消耗能量() { calls.push(['scroll', this.id, 玩家.x, 玩家.y]); } }
  class Item { constructor(id) { this.唯一标识 = id; this.是否隐藏 = r() < 0.2; this.已装备 = r() < 0.2; } 获取名称() { return 'item' + this.唯一标识; } }
  const stub = name => (...a) => { calls.push([name, ...a]); };
  for (const name of ${JSON.stringify(DEBUG_ITEMS)}) if (name !== '寻宝戒指') globalThis[name] = class { constructor(o) { calls.push(['new', name, o.数量]); this.name = name; } };
  Object.assign(globalThis, { 栅栏, 推箱子箱子, 压感开关, 推箱子目标, 折跃门, 寻宝戒指,
    ...Object.fromEntries(['添加日志', '显示通知', '生成墙壁', '检查推箱子解谜完成', '触发游戏事件', '尝试进入特殊房间', '放置物品到房间', '处理诡魅房间刷新', '更新视口', '更新光源地图',
      '绘制小地图', '绘制', '更新界面状态', 'clearTimeout'].map(name => [name, stub(name)])),
    处理回合逻辑: () => calls.push(['turn', 玩家.x, 玩家.y, 玩家距离图]),
    检查移动可行性: (...a) => { const ok = r() < 0.85; calls.push(['can?', ...a, ok]); return ok; },
    扣除能量: n => { const ok = r() < 0.6; calls.push(['energy', n, ok]); return ok; },
    getMoveDirection: (...a) => { const d = pick(['上', '下', '左', '右']); calls.push(['dir', ...a, d]); return d; },
    位置是否可用: (...a) => { const ok = r() < 0.6; calls.push(['free?', ...a, ok]); return ok; },
    处理玩家着陆效果: (...a) => { const stop = r() < 0.12; calls.push(['land', ...a, stop]); if (r() < 0.04) 玩家.x = 0; return stop ? pick([true, 1]) : pick([false, 0, undefined]); },
    生成玩家距离图: (x, y) => { calls.push(['dist', x, y]); return [[x, y]]; },
    处理丢弃物品: id => { const ok = r() < 0.6; calls.push(['drop', id, ok]); return ok; },
    音效管理器: { 播放音效: n => calls.push(['sound', n]) },
    socket: { emit: (...a) => calls.push(['emit', ...a]) },
    Date: { now: () => (clock += pick([20, 60, 150])) },
  });
  const cellItem = () => {
    const k = r();
    if (k < 0.04) return new 栅栏('f');
    if (k < 0.16) { const b = new 推箱子箱子('box'); if (r() < 0.3) b.自定义数据.set('被压物品', r() < 0.6 ? new 压感开关('under') : new Thing('under')); return b; }
    if (k < 0.22) return new 压感开关('plate');
    if (k < 0.27) return new 推箱子目标('target');
    if (k < 0.31) return new 折跃门('gate');
    if (k < 0.34) return new Thing('misc');
    return null;
  };
  const setup = () => {
    地牢大小 = 6;
    地牢 = Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => r() < 0.02 ? null : ({ x, y,
      背景类型: pick([单元格类型.房间, 单元格类型.房间, 单元格类型.房间, 单元格类型.走廊, 单元格类型.墙壁, 单元格类型.门, 单元格类型.上锁的门]),
      环境: pick([null, null, null, 环境类型.冰, 环境类型.血冰]), isOneWay: r() < 0.2, oneWayAllowedDirection: pick(['上', '右']),
      关联物品: cellItem(), 类型: pick([null, 单元格类型.物品, 单元格类型.物品, 单元格类型.怪物]), 颜色索引: pick([0, 3, 颜色表.length]) })));
    if (r() < 0.05) 地牢.length = 4;
    房间地图 = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => pick([-1, 0, 1])));
    if (r() < 0.08) 房间地图.length = 4;
    房间列表 = [{ id: 0 }, { id: 1 }];
    玩家 = { x: pick([1, 2, 3, 4]), y: pick([1, 2, 3, 4]) };
    游戏状态 = pick(['游戏中', '游戏中', '游戏中', '游戏中', '图鉴', '编辑器游玩', '地图编辑器', '主菜单']);
    玩家属性 = { 允许移动: r() < 0.08 ? 1 : 0, 移动步数: pick([1, 1, 2, 0, -1]), 能挖掘墙壁: r() < 0.3, 随机掉落: r() < 0.4, 当前能量值: 50 };
    游戏设置 = { 移动速度: pick([50, 100]), 自动移动可打断: r() < 0.7 };
    联机模式 = r() < 0.2;
    玩家状态 = ['眩晕', '冻结', '缓慢', '牵制'].filter(() => r() < 0.12).map(类型 => ({ 类型 }));
    生存挑战激活 = r() < 0.2; 玩家正在钩索 = r() < 0.2;
    当前激活卷轴列表 = new Set([new Scroll(1), new Scroll(2)].filter(() => r() < 0.3));
    地牢生成方式 = pick(['default', 'cave']); 当前层数 = pick([2, 3]);
    是否是自定义关卡 = r() < 0.2; 开发者模式 = r() < 0.2;
    移动历史 = r() < 0.35 ? 调试序列.slice(0, 7) : r() < 0.5 ? ['上', '下', '左', '右', '上', '下', '左', '右', '上'] : [];
    当前装备页 = pick([0, 1]); 装备栏每页装备数 = pick([2, 7]);
    玩家装备 = new Map([1, 2, 3, 8, 9].map(slot => {
      const ring = new 寻宝戒指(); ring.自定义数据.set('生效层数', pick([2, 3])); ring.自定义数据.set('已生成折跃门', r() < 0.3);
      return [slot, r() < 0.5 ? ring : r() < 0.5 ? null : { other: slot }];
    }));
    彩蛋3触发 = r() < 0.3;
    当前天气效果 = r() < 0.3 ? ['诡魅'] : [];
    玩家背包 = new Map([1, 2, 3].map(id => [id, new Item(id)]));
    玩家距离图 = 'old';
    相机目标X = 5; 相机目标Y = 6; 编辑器状态 = { 相机速度: pick([1, 3]) }; 玩家动画状态 = { 正在动画: false }; 上次移动 = pick([0, clock]);
    相机锁定 = true; 钩索移动定时器 = 'hook'; 切换动画 = r() < 0.15; moveQueue = ['q']; isAutoMoving = r() < 0.5;
  };
  globalThis.done = (async () => {
    for (let session = 0; session < 2; session++) {
      setup();
      for (let step = 0; step < 4; step++) {
        const args = [pick([-1, 0, 1, 1, 2]), pick([-1, 0, 0, 1]), pick([false, true, undefined]), pick([undefined, 1, 2, 3])];
        if (args[3] === undefined) args.pop();
        const historyBefore = 移动历史;
        try { results.push(['ok', await 移动玩家(...args)]); } catch (error) { results.push(['rejected', error.constructor.name]); }
        results.push([玩家.x, 玩家.y, 相机目标X, 相机目标Y, 玩家动画状态, 上次移动, 相机锁定, moveQueue, isAutoMoving, 玩家正在钩索, 移动历史.slice(), historyBefore === 移动历史, historyBefore.length, 彩蛋3触发, 玩家距离图]);
      }
      results.push(地牢.map(row => row.map(c => c && [c.背景类型, c.关联物品 && c.关联物品.kind, c.类型, c.颜色索引, c.关联物品 && c.关联物品.x, c.关联物品 && c.关联物品.y,
        c.关联物品 && c.关联物品.自定义数据 && (c.关联物品.自定义数据.get('被压物品') || {}).kind])));
    }
  })();
`;

const final = 'globalThis.final = { results, calls }';

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型, 环境类型, 调试序列, 颜色表 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const session = {} as MoveSession;
  for (const key of SESSION) Object.defineProperty(session, key, { get: () => context[key], set: (value) => { context[key] = value; } });
  const ports: MovePorts = {
    now: () => g<{ now(): number }>('Date').now(), random: () => g<() => number>('__rand')(), isOnline: () => g('联机模式'),
    emit: (...args) => g<{ emit(...a: unknown[]): void }>('socket').emit(...args), clearTimeout: fn('clearTimeout'),
    isFence: is('栅栏'), isSokobanBox: is('推箱子箱子'), isPressurePlate: is('压感开关'), isSokobanTarget: is('推箱子目标'), isWarpGate: is('折跃门'), isTreasureRing: is('寻宝戒指'),
    log: fn('添加日志'), notify: fn('显示通知'), canMove: fn('检查移动可行性'), deductEnergy: fn('扣除能量'), generateWalls: fn('生成墙壁'), getMoveDirection: fn('getMoveDirection'),
    isPositionFree: fn('位置是否可用'), checkSokobanSolved: fn('检查推箱子解谜完成'), handleLanding: fn('处理玩家着陆效果'),
    playSound: (name) => g<{ 播放音效(n: string): void }>('音效管理器').播放音效(name), triggerEvent: fn('触发游戏事件'), buildDistanceMap: fn('生成玩家距离图'),
    tryEnterSpecialRoom: fn('尝试进入特殊房间'), processTurn: fn('处理回合逻辑'),
    debugItemClasses: () => ({ classes: DEBUG_ITEMS.map(name => g<new (o: { 数量: number }) => unknown>(name)), gold: g('金币') }),
    placeItemInRoom: fn('放置物品到房间'), dropItem: fn('处理丢弃物品'), refreshPhantomRooms: fn('处理诡魅房间刷新'), updateViewport: fn('更新视口'),
    updateLightMap: fn('更新光源地图'), drawMinimap: fn('绘制小地图'), draw: fn('绘制'), updateUiState: fn('更新界面状态'),
  };
  Object.assign(context, { 移动玩家: (...args: [number, number, unknown?, number?]) => movePlayer(state, session, ports, ...args) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('player movement (移动玩家)', () => {
  it('matches the source over 500 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 500; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]) + (call[0] === 'new' && call[1] === '金币' ? '金币' : ''));
      for (const entry of source.results as unknown[][]) if (entry[0] === 'ok' || entry[0] === 'rejected') bump(`${entry[0]}:${String(entry[1])}`);
    }
    for (const key of ['ok:undefined', 'ok:false', 'rejected:TypeError', 'emit', 'fence', 'plate', 'warp', 'ring-gate', 'scroll', '添加日志', '显示通知', '生成墙壁', '检查推箱子解谜完成',
      '触发游戏事件', '尝试进入特殊房间', '放置物品到房间', 'new金币', '处理诡魅房间刷新', '更新光源地图', '绘制小地图', 'clearTimeout', 'turn', 'energy', 'dir', 'free?', 'land', 'drop',
      'sound', 'prng']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 180_000);
});
