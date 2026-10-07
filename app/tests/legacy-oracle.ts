import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createContext, Script } from 'node:vm';
import { parseExpressionAt } from 'acorn';
import { referenceRoot, verifyReference } from '../scripts/reference.mjs';
import type { Dungeon, MapItem, Position, Terrain } from '../src/domain/distance-map';

verifyReference();
const html = readFileSync(new URL('ChineseDungeon.html', referenceRoot), 'utf8');

// Parse exactly one declaration expression, without regex brace matching or
// evaluating the HTML's startup code. Missing/duplicate anchors fail loudly.
function extract(anchor: string): string {
  const start = html.indexOf(anchor);
  if (start < 0 || html.indexOf(anchor, start + 1) !== -1) {
    throw new Error(`Expected exactly one source anchor: ${anchor}`);
  }
  const expressionStart = anchor.startsWith('const ') ? html.indexOf('{', start) : start;
  const node = parseExpressionAt(html, expressionStart, { ecmaVersion: 'latest' });
  return html.slice(start, node.end);
}

const definitions = new Script([
  extract('const 单元格类型 ='),
  extract('class 已放置的障碍物 extends'),
  extract('class 黑曜石 extends'),
  extract('function 生成玩家距离图('),
  'globalThis.identities = { types: 单元格类型, obstacle: 已放置的障碍物.prototype, obsidian: 黑曜石.prototype };',
].join(';\n'), { filename: 'pinned-legacy-distance-map.js' });
const invoke = new Script('生成玩家距离图(start.x, start.y)', { filename: 'invoke-legacy.js' });

const terrainNames: Record<Terrain, string> = {
  wall: '墙壁', room: '房间', corridor: '走廊', door: '门', 'locked-door': '上锁的门',
  item: '物品', 'stairs-down': '楼梯下楼', 'stairs-up': '楼梯上楼', monster: '怪物',
};

/** Freeze recursively without stripping prototypes, undefined, or Infinity. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function legacyDistanceMap(dungeon: Dungeon, start: Position): number[][] {
  // Only the parent class binding is stubbed. The original concrete class
  // declarations supply actual prototype identities; constructors/methods are
  // not called, because this slice only observes instanceof and two fields.
  const context = createContext({ 物品: class Item {} }, {
    codeGeneration: { strings: false, wasm: false },
  });
  definitions.runInContext(context, { timeout: 1000 });
  const identities = context.identities as {
    types: Record<string, number>; obstacle: object; obsidian: object;
  };
  function adaptItem(item: MapItem | null | undefined): object | null | undefined {
    if (!item) return item;
    const prototype = item.kind === 'placed-obstacle' ? identities.obstacle
      : item.kind === 'obsidian' ? identities.obsidian : Object.prototype;
    return Object.assign(Object.create(prototype), {
      类型: item.kind === 'switch-brick' ? '开关砖' : '地形',
      阻碍怪物: item.blocksMonsters,
    });
  }
  const legacyDungeon = dungeon.map(row => row.map(cell => ({
    背景类型: identities.types[terrainNames[cell.terrain]],
    墙壁: { 右: cell.walls.right, 左: cell.walls.left, 下: cell.walls.down, 上: cell.walls.up },
    关联物品: adaptItem(cell.item),
  })));
  context.地牢 = legacyDungeon;
  context.地牢大小 = dungeon.length;
  context.start = deepFreeze({ ...start });
  // Leave legacy data writable so we can detect observable state changes rather
  // than masking them with freezing. Clone own data before/after; constructors
  // and prototype mutation are outside this function's tested contract.
  const before = structuredClone(legacyDungeon);
  const result = invoke.runInContext(context, { timeout: 1000 }) as number[][];
  if (!isDeepStrictEqual(structuredClone(legacyDungeon), before)) {
    throw new Error('Legacy mutated input');
  }
  // Copy across VM realms without JSON: Infinity must remain Infinity.
  return Array.from(result, row => Array.from(row));
}
