import { describe, expect, it } from 'vitest';
import { DungeonRandom, type RandomStream } from '../src/domain/random';
import { generateViewerLevel, ViewerGenerator } from '../src/viewer/generator';
import { drawViewer, type ViewerPainter } from '../src/viewer/render';
import { type ViewerSnapshot } from '../src/viewer/model';
import { createOracle } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const originalNames = ['房间尺寸范围', '最大房间数', '颜色表', '单元格类型', '单元格', '门', '哈希字符串',
  '初始化随机数生成器', '区域是否空闲', '放置房间', '寻找房间入口', '连接房间', '放置门', '生成走廊', '生成墙壁',
  '添加额外走廊', '处理上锁的门', '放置楼梯', '计算距离图', 'generateDungeonForLevel', 'drawDungeonOnCanvas'];
const snapshotCode = `({地牢大小, 地牢, 房间列表, 上锁房间列表, 房间地图, 门实例列表, 玩家初始位置, 下楼楼梯位置, 上楼楼梯位置})`;
const classNames = { ViewerCell: '单元格', ViewerDoor: '门' };
const clock = () => 1720000000000;

function oracle(seed: unknown, floor: number) {
  const original = createOracle(originalNames, {
    Date: { now: clock }, 地牢大小: 100, 地牢: [], 房间地图: [], 房间列表: [], 上锁房间列表: [],
    门实例列表: new Map(), 玩家初始位置: { x: 0, y: 0 }, 下楼楼梯位置: null, 上楼楼梯位置: null, prng: () => 0,
  }, 'ChineseDungeon-Viewer.html');
  original.invoke('初始化随机数生成器', seed);
  original.evaluate(`const sourceRandom = prng; const drawLog = []; prng = () => { const value = sourceRandom(); drawLog.push(value); return value; };`);
  original.evaluate(`for (let draw = 0; draw < ${floor}; draw++) prng();`);
  return original;
}
function recordedRandom(seed: unknown, floor: number) {
  const random = new DungeonRandom(seed);
  const draws: number[] = [];
  const stream: RandomStream = { next() { const value = random.next(); draws.push(value); return value; }, get state() { return random.state; } };
  for (let draw = 0; draw < floor; draw++) stream.next();
  return { stream, draws };
}

function painter(width = 300, height = 300) {
  const commands: unknown[] = [];
  const target = { canvas: { width, height } } as unknown as ViewerPainter;
  for (const key of ['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline']) {
    Object.defineProperty(target, key, { set: value => commands.push(['set', key, value]) });
  }
  for (const name of ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'arc', 'fill', 'fillText']) {
    Reflect.set(target, name, (...args: unknown[]) => commands.push([name, ...args]));
  }
  return { target, commands };
}

describe('complete viewer exact-source parity (not main gameplay)', () => {
  for (const seed of ['中文地牢', '0', '🌋', 'repeatable']) {
    it(`all 16 floors, cell fields/identities/rooms/locks/stairs and every draw: ${seed}`, () => {
      for (let floor = 0; floor <= 15; floor++) {
        const source = oracle(seed, floor);
        const { stream, draws } = recordedRandom(seed, floor);
        const expectedResult = (() => { try { source.invoke('generateDungeonForLevel', floor); return null; } catch (error) { return (error as Error).name; } })();
        const generator = new ViewerGenerator(stream, clock);
        const actualResult = (() => { try { generator.generate(floor); return null; } catch (error) { return (error as Error).name; } })();
        expect(actualResult, `seed=${seed}, floor=${floor}`).toBe(expectedResult);
        expect(draws).toEqual(Array.from(source.evaluate<number[]>('drawLog')));
        expect(JSON.stringify(graphSnapshot(generator.snapshot(), classNames)), `seed=${seed}, floor=${floor}`).toBe(JSON.stringify(graphSnapshot(source.evaluate(snapshotCode))));
      }
    });
  }

  it('matches every ordered draw command on floor 0/1/15 and non-square canvases', () => {
    for (const floor of [0, 1, 15]) for (const [width, height] of [[300, 300], [450, 210]]) {
      const source = oracle('render commands', floor);
      source.invoke('generateDungeonForLevel', floor);
      const expected = source.evaluate<ViewerSnapshot>(snapshotCode);
      const actual = generateViewerLevel('render commands', floor, clock);
      const first = painter(width, height); const second = painter(width, height);
      source.invoke('drawDungeonOnCanvas', first.target, expected.地牢, expected.房间列表,
        expected.玩家初始位置, expected.下楼楼梯位置, expected.上楼楼梯位置);
      drawViewer(second.target, actual);
      expect(second.commands).toEqual(first.commands);
    }
  });

  it('the same generator can generate again while retaining the player-start alias', () => {
    const source = oracle('session', 0);
    const { stream } = recordedRandom('session', 0);
    const generator = new ViewerGenerator(stream, clock);
    source.invoke('generateDungeonForLevel', 0);
    const first = generator.generate(0);
    source.invoke('generateDungeonForLevel', 1);
    const second = generator.generate(1);
    expect(second.玩家初始位置).toBe(first.玩家初始位置);
    expect(second.地牢).not.toBe(first.地牢);
    expect(JSON.stringify(graphSnapshot(second, classNames))).toBe(JSON.stringify(graphSnapshot(source.evaluate(snapshotCode))));
  });

  it('empty rendering exits after clearRect as in the source', () => {
    const snapshot = generateViewerLevel('empty render', 0, clock);
    snapshot.房间列表 = [];
    const first = painter(); const second = painter();
    const source = oracle('empty render', 0);
    source.invoke('drawDungeonOnCanvas', first.target, snapshot.地牢, [], snapshot.玩家初始位置, null, null);
    drawViewer(second.target, snapshot);
    expect(second.commands).toEqual(first.commands);
    expect(second.commands).toEqual([['clearRect', 0, 0, 300, 300]]);
  });
});

it('graph diagnostics preserve refs/symbols/non-finite values/array holes without invoking accessors', () => {
  const shared = { value: undefined }; const symbol = Symbol('door');
  const snapshot = graphSnapshot({ first: shared, second: shared, doors: new Map([[symbol, { symbol }]]),
    numbers: [NaN, Infinity, -Infinity, -0, 0] });
  expect(snapshot).not.toEqual(graphSnapshot({ first: shared, second: { value: undefined }, doors: new Map(),
    numbers: [null, null, null, 0, 0] }));
  expect(graphSnapshot(new Array(1))).not.toEqual(graphSnapshot([undefined]));
  let calls = 0;
  expect(() => graphSnapshot({ get value() { calls++; return 1; } })).toThrow(/accessors/);
  expect(calls).toBe(0);
  expect(() => graphSnapshot({ get [Symbol.toStringTag]() { calls++; return 'Map'; } })).toThrow(/accessors/);
  const map = new Map();
  Object.defineProperty(map, Symbol.iterator, { get() { calls++; return () => [][Symbol.iterator](); } });
  expect(() => graphSnapshot(map)).toThrow(/accessors/);
  expect(calls).toBe(0);
  expect(() => graphSnapshot(new Proxy({}, { ownKeys() { calls++; return []; } }))).toThrow(/Proxy/);
  expect(calls).toBe(0);
  expect(() => graphSnapshot(new Date())).toThrow(/Unsupported diagnostic kind/);
});
