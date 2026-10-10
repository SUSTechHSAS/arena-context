import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { drawPath } from '../src/game/world/path-overlay';
import { declaration } from './oracle/source';

// Recording canvas: every method call and property write is logged with its arguments.
const recorder = `
  class Ctx {
    constructor(log) { Object.defineProperty(this, 'log', { value: log }); }
    save() { this.log.push(['save']); } beginPath() { this.log.push(['beginPath']); }
    setLineDash(a) { this.log.push(['setLineDash', JSON.stringify(a), Array.isArray(a)]); }
    moveTo(x, y) { this.log.push(['moveTo', x, y]); } lineTo(x, y) { this.log.push(['lineTo', x, y]); }
    stroke() { this.log.push(['stroke']); } restore() { this.log.push(['restore']); }
  }
  for (const key of ['strokeStyle', 'lineWidth', 'lineJoin', 'lineCap'])
    Object.defineProperty(Ctx.prototype, key, { set(v) { this.log.push(['set', key, v]); }, get() { return undefined; } });
`;

const fmt = (log: unknown[][]) => JSON.stringify(log, (_k, v) => (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : v));

function cases() {
  let s = 77; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const num = () => { const k = r(); return k < 0.05 ? NaN : k < 0.1 ? -0 : k < 0.4 ? Math.floor(r() * 40 - 10) : k < 0.55 ? r() * 1e-3 : k < 0.65 ? r() * 1e7 + 0.1 : r() * 50 - 10; };
  const out: { view: { cameraX: number; cameraY: number; cellSize: number; devicePixelRatio: number; player: { x: number; y: number } }; path: { x: number; y: number }[] }[] = [];
  for (let i = 0; i < 3000; i++) {
    const n = Math.floor(r() * 7);
    out.push({ view: { cameraX: num(), cameraY: num(), cellSize: [0, 1, 16, 32.5, -8][Math.floor(r() * 5)]!, devicePixelRatio: [1, 2, 1.25, 0][Math.floor(r() * 4)]!,
      player: { x: num(), y: num() } }, path: Array.from({ length: n }, () => ({ x: num(), y: num() })) });
  }
  return out;
}

describe('click-move path overlay (drawPath)', () => {
  it('records the same canvas calls as the source', () => {
    const context = vm.createContext({});
    new vm.Script(`${recorder}\n${declaration('drawPath')}\nglobalThis.run = (c) => { const log = []; globalThis.ctx = new Ctx(log);
      globalThis.window = { devicePixelRatio: c.view.devicePixelRatio }; globalThis.玩家 = c.view.player;
      globalThis.当前相机X = c.view.cameraX; globalThis.当前相机Y = c.view.cameraY; globalThis.单元格大小 = c.view.cellSize;
      drawPath(c.path); return log; };`).runInContext(context);
    const run = new vm.Script('run').runInContext(context) as (c: unknown) => unknown[][];
    const Ctx = new vm.Script('Ctx').runInContext(context) as new (log: unknown[]) => Parameters<typeof drawPath>[0];
    let drawn = 0; let empty = 0;
    for (const c of cases()) {
      const expected = run(c);
      const log: unknown[][] = [];
      drawPath(new Ctx(log), c.view, c.path);
      expect(fmt(log)).toBe(fmt(expected));
      if (expected.length) drawn++; else empty++;
    }
    expect(drawn).toBeGreaterThan(500); expect(empty).toBeGreaterThan(500);
  });
});
