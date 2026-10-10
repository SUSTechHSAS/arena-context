import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { generatePuzzleBoard, type PuzzleBoardPorts } from '../src/game/world/puzzle-board';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const PIECES = ['国际象棋车', '国际象棋象', '中国象棋炮', '国际象棋马'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class Piece { constructor(options) { calls.push(['new', this.constructor.name, options]); } }
  for (const name of ${JSON.stringify(PIECES)}) globalThis[name] = ({ [name]: class extends Piece {} })[name];
  const step = pick([0.05, 0.2, 0.5, 2, 5, 20]);
  let clock = 1000;
  const digest = board => board.map(row => row.map(cell => cell ? cell.constructor.name[0] : '.').join('')).join('/');
  const flags = board => { const d = Object.getOwnPropertyDescriptor(board, '__权重'); return d ? [d.enumerable, d.writable, d.configurable, JSON.stringify(d.value)] : 'none'; };
  const blocked = (x, y, board) => board.some((row, ry) => row.some((cell, rx) => cell && (rx === x || ry === y)));
  Object.assign(globalThis, {
    performance: { now: () => { calls.push(['now']); return (clock += step); } },
    可以放置: (x, y, cls, board) => { const ok = !blocked(x, y, board) || r() < 0.15; calls.push(['can', x, y, cls.name, digest(board), ok]); return ok; },
    计算新增威胁格子数: (x, y, cls, board) => { calls.push(['score', x, y, cls.name, flags(board)]); return Math.floor(r() * 6); },
    放置物品到房间: (item, room) => calls.push(['place', item.constructor.name, room.棋子数量]),
  });
  const rooms = Array.from({ length: 3 }, (_, id) => ({ id, w: pick([0, 1, 2, 3, 5, 8, 9]), h: pick([1, 2, 3, 6, 8, 9]) }));
  if (r() < 0.6) rooms.push(pick([{ id: 3, w: 8, h: 8 }, { id: 3, w: 9, h: 7 }, { id: 3, w: 8, h: 8 }]));
  for (const room of rooms) {
    try { const out = 生成解谜棋盘(room); results.push(['ok', digest(out.棋盘), out.棋盘.length, room]); }
    catch (error) { results.push(['throw', error.constructor.name, room]); }
  }
  globalThis.final = { results, calls };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${declaration('prng')}\n${declaration('生成解谜棋盘')}\nglobalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const ports: PuzzleBoardPorts = {
    random: () => g<() => number>('__rand')(), now: () => g<{ now(): number }>('performance').now(),
    get pieces() { return PIECES.map(name => g<new () => unknown>(name)); },
    canPlace: fn('可以放置'), countThreats: fn('计算新增威胁格子数'), placeItemInRoom: fn('放置物品到房间'),
  };
  Object.assign(context, { 生成解谜棋盘: (room: unknown) => generatePuzzleBoard(ports, room) });
  new vm.Script(scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('puzzle board (生成解谜棋盘)', () => {
  it('matches the source over 250 seeded runs', () => {
    const tally = { pieces: 0, emptyBoards: 0, scored: 0, timeouts: 0, completed: 0 };
    for (let seed = 1; seed <= 250; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      const calls = source.calls as unknown[][];
      tally.pieces += calls.filter(call => call[0] === 'place').length;
      tally.scored += calls.filter(call => call[0] === 'score').length;
      const results = source.results as unknown[][];
      tally.emptyBoards += results.filter(entry => entry[0] === 'ok' && !/[^./]/.test(String(entry[1]))).length;
      tally.timeouts += Number(calls.filter(call => call[0] === 'now').length > 60);
      tally.completed += Number(calls.filter(call => call[0] === 'now').length < 40 && calls.some(call => call[0] === 'place'));
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  }, 180_000);
});
