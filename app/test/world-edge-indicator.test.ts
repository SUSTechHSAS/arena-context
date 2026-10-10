import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { edgeIndicatorPosition } from '../src/game/world/edge-indicator';
import { declaration } from './oracle/source';

// The source function reads globals; we bind them per case. Results compared with Object.is per coordinate.
const source = vm.createContext({});
new vm.Script(`${declaration('计算精确边缘位置')}
  globalThis.run = (view, monster) => { 当前相机X = view.cameraX; 当前相机Y = view.cameraY; 单元格大小 = view.cellSize; 画布缓存Rect = view.rect; 玩家 = view.player;
    return 计算精确边缘位置(monster); };`).runInContext(source);
const runSource = (view: unknown, monster: unknown) => (source.run as (v: unknown, m: unknown) => { x: number; y: number } | null)(view, monster);

describe('off-screen monster edge indicator (计算精确边缘位置)', () => {
  it('matches the source over 20000 random views, monsters and degenerate canvases', () => {
    let s = 12345; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)]!;
    const tally: Record<string, number> = { null: 0, point: 0, inView: 0 };
    for (let i = 0; i < 20000; i++) {
      const cellSize = pick([10, 30, 32.5, 0, -10]);
      const rect = { width: pick([0, 1, 299, 450, 451.7]), height: pick([0, 300, 450, 512]), left: pick([0, 8, -3.5]), top: pick([0, 40]) };
      const cameraX = pick([0, 3, 10, -2]); const cameraY = pick([0, 5, 10]);
      const player = { x: cameraX + Math.floor(r() * 20) - 2, y: cameraY + Math.floor(r() * 20) - 2 };
      const monster = r() < 0.05 ? { ...player } : { x: cameraX + Math.floor(r() * 50) - 15, y: cameraY + Math.floor(r() * 50) - 15 };
      if (r() < 0.02) (monster as { x: number }).x = NaN;
      const view = { cameraX, cameraY, cellSize, rect, player };
      const expected = runSource(view, monster); const actual = edgeIndicatorPosition(view, monster);
      if (expected === null) { expect(actual, `case ${i}`).toBeNull(); tally.null!++; }
      else { expect(Object.is(actual!.x, expected.x) && Object.is(actual!.y, expected.y), `case ${i}`).toBe(true); tally.point!++; }
      if (cellSize > 0 && monster.x >= cameraX && monster.x <= cameraX + Math.floor(rect.width / cellSize) - 1 && monster.y >= cameraY && monster.y <= cameraY + Math.floor(rect.height / cellSize) - 1) tally.inView!++;
    }
    for (const [key, value] of Object.entries(tally)) expect(value, key).toBeGreaterThan(500);
  });
});
