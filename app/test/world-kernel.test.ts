import { describe, expect, it } from 'vitest';
import * as constants from '../src/game/world/constants';
import { GameCell } from '../src/game/world/cell';
import { MATERIALS } from '../src/game/item-core';
import { createOracle } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown, names: Record<string, string> = {}) => JSON.stringify(graphSnapshot(value, names));

describe('main-game world constants', () => {
  const pairs: [string, unknown][] = [
    ['单元格类型', constants.单元格类型], ['怪物状态', constants.怪物状态], ['颜色表', constants.颜色表],
    ['颜色名表', constants.颜色名表], ['效果颜色编号映射', constants.效果颜色编号映射],
    ['效果名称编号映射', constants.效果名称编号映射], ['环境类型', constants.环境类型],
    ['房间尺寸范围', constants.房间尺寸范围], ['最大堆叠数', constants.最大堆叠数], ['最大怪物数', constants.最大怪物数], ['存档版本', constants.存档版本],
    ['游戏版本', constants.游戏版本], ['所有天气列表', constants.所有天气列表], ['大风吹动概率', constants.大风吹动概率],
    ['怪物移动动画时长', constants.怪物移动动画时长], ['调试序列', constants.调试序列], ['Q字形图案', constants.Q字形图案], ['数据完整性密钥', constants.数据完整性密钥], ['融合配方列表', constants.融合配方列表], ['材质', MATERIALS],
    ['单元格大小', constants.DEFAULT_单元格大小], ['最大房间数', constants.DEFAULT_最大房间数],
    ['相机显示边长', constants.DEFAULT_相机显示边长], ['地牢大小', constants.DEFAULT_地牢大小],
  ];
  for (const [name, value] of pairs) {
    it(`${name} matches the exact source declaration (values, key order, descriptors)`, () => {
      const original = createOracle([name]);
      expect(snap(value)).toBe(snap(original.evaluate(name)));
    });
  }
  it('the comparison is sensitive to key order and duplicate entries (mutation check)', () => {
    const original = createOracle(['单元格类型', '所有天气列表']);
    const reordered = { 房间: 1, 墙壁: 0, 走廊: 2, 门: 3, 上锁的门: 4, 物品: 5, 楼梯下楼: 6, 楼梯上楼: 7, 怪物: 8 };
    expect(snap(reordered)).not.toBe(snap(original.evaluate('单元格类型')));
    expect(snap([...new Set(constants.所有天气列表)])).not.toBe(snap(original.evaluate('所有天气列表')));
  });
});

describe('main-game 单元格 data contract', () => {
  const oracle = () => createOracle(['单元格类型', '颜色表', '单元格']);
  it('constructor own properties, order, nested walls and prototype method set match', () => {
    const original = oracle();
    for (const [x, y] of [[0, 0], [3, 7], [99, 0], [-1, 2.5], [NaN, Infinity]] as [number, number][]) {
      expect(snap(new GameCell(x, y), { GameCell: '单元格' })).toBe(snap(original.construct('单元格', x, y)));
    }
    const sourceMethods = original.evaluate<string[]>('Object.getOwnPropertyNames(单元格.prototype)');
    // Rendering methods are owned by the canvas layer; data methods must match exactly.
    expect(Object.getOwnPropertyNames(GameCell.prototype).sort())
      .toEqual(sourceMethods.filter(name => !['绘制', '绘制物品'].includes(name)).sort());
  });
  it('获取物品颜色 matches for stairs, missing items and every colour index edge case', () => {
    const original = oracle();
    const kinds: unknown[] = [null, 0, 1, 5, 6, 7, 8, '6', '7', undefined];
    const indexes: unknown[] = [0, 1, 2, 3, 4, 5, 6, 7, -1, 1.5, NaN, '0', '5', undefined, null];
    const tables: string[][] = [[...constants.颜色表], ['', '#123456'], []];
    let compared = 0;
    for (const kind of kinds) {
      const mine = new GameCell(1, 1); const theirs = original.construct<Record<string, unknown> & { 获取物品颜色(): string }>('单元格', 1, 1);
      (mine as { 类型: unknown }).类型 = kind; theirs.类型 = kind;
      expect(mine.获取物品颜色()).toBe(theirs.获取物品颜色()); compared++;
      for (const table of tables) for (const index of indexes) {
        const item = { 颜色表: table, 颜色索引: index as number };
        mine.关联物品 = item; theirs.关联物品 = item;
        expect(mine.获取物品颜色(), `${String(kind)}/${String(index)}/${table.length}`).toBe(theirs.获取物品颜色());
        compared++;
      }
    }
    expect(compared).toBe(kinds.length * (1 + tables.length * indexes.length));
  });
});
