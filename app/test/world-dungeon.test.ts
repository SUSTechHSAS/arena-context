import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { generateDungeon, generateTreasureRing, type DungeonPorts } from '../src/game/world/dungeon';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['生成地牢', '生成寻宝戒指'];
const GLOBALS = ['prng', '单元格类型', '颜色表', '单元格', '房间尺寸范围'];
const snap = (value: unknown, aliases?: Record<string, string>) => JSON.stringify(graphSnapshot(value, aliases));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let freeChance = 0.3, blockChance = 0, block = 0, mapTag = 0;
  class 巡逻怪物 { constructor(id) { this.id = id; } 初始巡逻() { calls.push(['patrol', this.id]); } }
  class Monster { constructor(id) { this.id = id; } }
  class 钢制长剑 { constructor(o) { this.o = o; calls.push(['sword', o]); } }
  class 寻宝戒指 { constructor(o) { this.o = o; calls.push(['ring', o]); } }
  const roomId = room => room === undefined ? 'undef' : room.id;
  const stub = name => (...a) => { calls.push([name, ...a.map(v => v && typeof v === 'object' ? (v.id ?? 'obj') : v)]); };
  Object.assign(globalThis, { 巡逻怪物, 钢制长剑, 寻宝戒指,
    ...Object.fromEntries(['生成墙壁', '生成钥匙', '生成路障', '生成金币', '生成物品', '生成并放置随机配方卷轴', '更新视口', '全局生成环境', '生成水怪', '显示等待界面', '隐藏等待界面',
      '更新界面状态', '生成走廊'].map(name => [name, stub(name)])),
    console: { log: m => calls.push(['log', m]), warn: m => calls.push(['warn', m]) },
    楼梯图标: { 下楼: 'D', 上楼: 'U' },
    生成洞穴地牢: () => { calls.push(['cave']); return pick([true, Promise.resolve('cave-p')]); },
    生成迷宫地牢: async mode => { calls.push(['maze', mode]); await null; return 'maze'; },
    放置房间: room => calls.push(['place-room', room.id, room.x, room.y, room.w, room.h]),
    区域是否空闲: (...a) => { let ok = false; if (block > 0) block--; else if (r() < blockChance) block = 299; else ok = r() < freeChance; calls.push(['free?', ...a, ok]); return ok ? pick([true, 1]) : pick([false, 0]); },
    连接房间: (a, b) => { calls.push(['connect', a.id, b.id]); return r() < 0.8 ? ['path', a.id, b.id] : null; },
    添加额外走廊: (rooms, n, set) => calls.push(['extra', rooms.length, n, [...set]]),
    生成特殊房间: mode => {
      calls.push(['special', mode]);
      if (r() < 0.4) 房间列表.push({ id: 房间列表.length, 类型: '隐藏房间', x: 6, y: 6, w: 7, h: 7 });
      if (r() < 0.5) 推箱子任务列表.push((async () => { await null; calls.push(['sokoban-done']); })());
      return Promise.resolve();
    },
    处理上锁的门: () => { calls.push(['locks']); if (r() < 0.5 && 房间列表[2]) 上锁房间列表.push({ id: 房间列表[2].id }); },
    生成红蓝开关谜题: map => calls.push(['redblue', map.tag]),
    计算距离图: (x, y) => {
      const salt = Math.floor(r() * 50); calls.push(['dist', x, y, salt]);
      const map = Array.from({ length: 地牢大小 }, (_, yy) => (yy + salt) % 9 === 0 ? undefined : Array.from({ length: 地牢大小 }, (_, xx) => (xx * 7 + yy * 13 + salt) % 11 === 0 ? Infinity : (xx * 3 + yy * 5 + salt) % 40));
      map.tag = ++mapTag; return map;
    },
    生成怪物: () => { calls.push(['monsters']); 所有怪物.push(...[1, 2, 3].map(id => r() < 0.5 ? new 巡逻怪物(id) : new Monster(id))); },
    放置物品到房间: (item, room) => calls.push(['place-item', item.constructor.name, item.o, roomId(room)]),
    更新房间墙壁: room => calls.push(['walls', room.id]),
    生成陷阱: room => calls.push(['traps', room.id]),
    放置楼梯: (room, icon, kind) => calls.push(['stairs', roomId(room), icon, kind]),
  });
  地牢大小 = 1; 地牢 = []; 房间地图 = []; 房间列表 = []; 上锁房间列表 = []; 所有怪物 = []; 推箱子任务列表 = []; 已访问房间 = new Set();
  玩家 = { x: 0, y: 0 }; 玩家初始位置 = { x: 0, y: 0 }; 最大房间数 = 15;
  globalThis.done = (async () => {
    for (let session = 0; session < 2; session++) {
      当前层数 = pick([0, 0, 1, 2, 7, 10, 11]);
      地牢生成方式 = pick(['default', 'default', 'default', 'default', 'default', 'cave', 'maze']);
      自定义游戏设置 = { 地牢初始大小: pick([30, 40]), 初始房间数量: pick([3, 5]), 开启红蓝砖块谜题: r() < 0.7 };
      玩家属性 = { 挑战波数增加: pick([0, undefined, 2]) };
      freeChance = pick([0.3, 0.3, 0.05, 0]); blockChance = pick([0, 0, 0.04]); block = 0;
      if (session === 0 && r() < 0.6) 房间列表 = [];
      try { results.push(['ok', await 生成地牢(pick([false, true, undefined]))]); } catch (error) { results.push(['rejected', error.constructor.name]); }
      results.push([地牢大小, 最大房间数, 地牢.length, 地牢[1] && 地牢[1][2], 地牢.at(-1) && 地牢.at(-1)[0], 房间地图.length, 房间地图[0] && 房间地图[0].slice(0, 3), 房间列表, 玩家, 玩家初始位置,
        [...已访问房间], 推箱子任务列表.length, 上锁房间列表]);
      const saved = 房间列表; 房间列表 = pick([[], [{ id: 4, 类型: '挑战房间' }], [{ id: 5, 类型: '房间' }, { id: 6 }]]);
      try { results.push(['ring', 生成寻宝戒指实现()]); } catch (error) { results.push(['ring-throw', error.constructor.name]); }
      房间列表 = saved;
    }
  })();
`;

const final = 'globalThis.final = { results, calls }';

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; }; globalThis.生成寻宝戒指实现 = 生成寻宝戒指;`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const random = () => g<() => number>('__rand')();
  const ports: DungeonPorts = {
    random, generateCaveDungeon: fn('生成洞穴地牢'), generateMazeDungeon: fn('生成迷宫地牢'), placeRoom: fn('放置房间'), isAreaFree: fn('区域是否空闲'),
    connectRooms: fn('连接房间'), generateCorridor: fn('生成走廊'), addExtraCorridors: fn('添加额外走廊'), generateSpecialRoom: fn('生成特殊房间'), generateWalls: fn('生成墙壁'),
    handleLockedDoors: fn('处理上锁的门'), generateKeys: fn('生成钥匙'), generateBarricades: fn('生成路障'), generateTreasureRing: fn('生成寻宝戒指实现'), generateCoins: fn('生成金币'),
    generateItems: fn('生成物品'), generateRedBluePuzzle: fn('生成红蓝开关谜题'), distanceMap: fn('计算距离图'), generateMonsters: fn('生成怪物'),
    placeRecipeScrolls: fn('生成并放置随机配方卷轴'), createStarterWeapon: () => new (g<new (o: unknown) => unknown>('钢制长剑'))({ 不可破坏: true }),
    placeItemInRoom: fn('放置物品到房间'), updateViewport: fn('更新视口'), updateRoomWalls: fn('更新房间墙壁'), generateEnvironment: fn('全局生成环境'),
    generateWaterMonsters: fn('生成水怪'), generateTraps: fn('生成陷阱'), stairIcons: () => g('楼梯图标'), placeStairs: fn('放置楼梯'),
    isPatrolMonster: (monster) => monster instanceof g<abstract new () => unknown>('巡逻怪物'), showWaiting: fn('显示等待界面'), hideWaiting: fn('隐藏等待界面'),
    updateUi: fn('更新界面状态'), log: (message) => g<{ log(m: string): void }>('console').log(message), warn: (message) => g<{ warn(m: string): void }>('console').warn(message),
  };
  Object.assign(context, {
    生成地牢: (mode?: unknown) => generateDungeon(state, ports, mode),
    生成寻宝戒指实现: () => generateTreasureRing(state, {
      random, createTreasureRing: (options) => new (g<new (o: unknown) => unknown>('寻宝戒指'))(options), placeItemInRoom: fn('放置物品到房间'),
    }),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('default dungeon generation (生成地牢, 生成寻宝戒指)', () => {
  it('matches the source over 300 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 300; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine, { GameCell: '单元格' }), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]));
      for (const entry of source.results as unknown[][]) if (entry[0] === 'ok' || entry[0] === 'rejected') bump(`${entry[0]}:${String(entry[1])}`);
      for (const room of (source.results as unknown[][]).flatMap(entry => (Array.isArray(entry[7]) ? entry[7] : []) as { 类型?: string }[])) bump(`room:${room.类型}`);
    }
    for (const key of ['ok:undefined', 'ok:true', 'ok:maze', 'rejected:TypeError', 'cave', 'maze', 'place-room', 'free?', 'connect', '生成走廊', 'extra', 'special', 'locks', '生成钥匙',
      'redblue', 'dist', 'monsters', 'patrol', 'sword', 'ring', 'place-item', 'walls', 'traps', 'stairs', 'log', 'warn', 'sokoban-done', '显示等待界面', '生成水怪',
      'room:挑战房间', 'room:单向房间', 'room:黑暗房间', 'prng']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 180_000);
});
