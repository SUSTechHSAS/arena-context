import { 单元格类型, 怪物状态 } from './constants';
import { isPositionFree } from './placement';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctor = new (options: Loose) => Loose;
type Point = { x: number; y: number };

/** Classes and data owned by packets (`t10-fences`, `t10-books-formulas`, `t10-monsters-hazards-patrol`, item/trap packets). */
export interface CaveCatalog {
  /** Source `[物品祭坛, 耐久祭坛, 背包扩容祭坛, 神龛, 洗身砚, 神秘商人, 探险家]` in this order. */
  特殊物品池: readonly Ctor[];
  /** Source `[隐形落石陷阱, 隐形地刺陷阱, 召唤怪物陷阱, 隐形失明陷阱, 烈焰触发陷阱, 隐形虫洞陷阱]` in this order. */
  陷阱池: readonly Ctor[];
  巡逻怪物: Ctor;
  图标映射: Readonly<Record<'飞毛腿' | '永久抗火' | '永久力量' | '永久抗毒' | '永久解冻' | '炸弹' | '隐身' | '矿工', unknown>>;
  木栅栏: Ctor; 石栅栏: Ctor; 铁栅栏: Ctor;
  配方卷轴: Ctor;
}

export interface CavePorts {
  random(): number;
  catalog: CaveCatalog;
  /** Source `放置怪物到单元格` (`world/placement.ts#placeMonsterAt`). */
  placeMonsterAt(monster: Loose, x: number, y: number): boolean;
  /** Source `放置物品到单元格(item, x, y)` with default arguments (`world/placement.ts#placeItemAt`). */
  placeItemAt(item: Loose, x: number, y: number): boolean;
  /** Source `快速检查相邻移动(fx, fy, tx, ty)` (packet `t10-path-search`). */
  quickAdjacentMove(fromX: number, fromY: number, toX: number, toY: number): boolean;
  /** Source `生成单个随机融合配方(层数)` (packet `t10-fusion-engine-audit`). */
  generateFusionRecipe(floor: number): unknown;
}

export type ScorePlacementKind = '特殊物品' | '怪物' | '陷阱' | '普通物品';

const topCandidates = (scoreMap: number[][], area: Point[]) => {
  let best = -1; let candidates: Point[] = [];
  area.forEach(point => {
    const score = scoreMap[point.y]![point.x]!;
    if (score > best) { best = score; candidates = [point]; } else if (score === best) candidates.push(point);
  });
  return candidates;
};

/** Source `使用评分图放置物品(评分图, 可用区域, 类型)`; unknown kinds return before any draw. */
export function placeByScoreMap(state: WorldState, ports: CavePorts, scoreMap: number[][], area: Point[], kind: unknown): void {
  const floor = state.当前层数; const settings = state.自定义游戏设置 as Loose; const { catalog } = ports;
  const monsterPool: Loose[] = [];
  const plan = state.怪物引入计划 as Map<unknown, Loose[]>;
  for (let i = 0; i <= floor; i++) {
    if (plan.has(i)) plan.get(i)!.forEach(definition => {
      if (!monsterPool.some(entry => entry.类.name === definition.类.name)) monsterPool.push(definition);
    });
  }
  const itemPool = (Object.values(state.物品池 as Record<string, Loose[]>).flat() as Loose[]).filter(item => floor >= item.最小层);
  let pool: Loose[] = []; let count = 0;
  if (kind === '特殊物品') {
    pool = catalog.特殊物品池.map(cls => ({ 类: cls }));
    count = 3 + Math.floor(floor / 3);
  } else if (kind === '怪物') {
    pool = monsterPool.filter(entry => entry.类.name !== '大魔法师' && entry.类.name !== '米诺陶');
    if (settings.开启巡逻怪物) pool.push({ 类: catalog.巡逻怪物, 权重: 8 });
    count = Math.round(20 + floor * 3 * Math.pow(state.地牢大小 / 100, 2));
  } else if (kind === '陷阱') {
    pool = catalog.陷阱池.map(cls => ({ 类: cls }));
    count = Math.round(10 + floor * Math.pow(state.地牢大小 / 100, 2));
  } else if (kind === '普通物品') {
    pool = itemPool.filter(item => {
      const sample = new item.类({});
      return sample.是否正常物品 && sample.类型 !== '工具' && sample.类型 !== 'NPC' && sample.类型 !== '祭坛';
    });
    count = Math.round(10 + Math.floor(floor / 2 * Math.pow(state.地牢大小 / 100, 2)) * settings.物品掉落率);
  } else {
    return;
  }
  if (pool.length === 0) return;

  for (let i = 0; i < count; i++) {
    const candidates = topCandidates(scoreMap, area);
    if (candidates.length === 0) break;
    const spot = candidates[Math.floor(ports.random() * candidates.length)]!;
    const config = pool[Math.floor(ports.random() * pool.length)];
    const empowered = ports.random() < 0.1 + floor * 0.03;
    let placed = false;
    if (kind === '怪物') {
      const baseLevel = Math.max(1, floor);
      const levelShift = Math.floor(ports.random() * 4) - 1;
      const elite = ports.random() < 0.1 + floor * 0.005;
      let level = Math.max(1, baseLevel + levelShift);
      let isEmpowered = empowered;
      if (elite) { level += 3; isEmpowered = true; }
      if (!settings.开启怪物等级) level = 1;
      const monster = new config.类({ 强化: isEmpowered, 随机游走: (config.类 === catalog.巡逻怪物), 等级: level, x: spot.x, y: spot.y });
      if (settings.开启药水增益怪物) {
        if (floor > 7 && ports.random() < 0.15 + (floor - 7) * 0.1) {
          const icons = catalog.图标映射;
          const potions: Loose[] = [
            { 类型: '一次性治疗', 值: 50 }, { 类型: '永久隐身' }, { 类型: '永久速度', 值: 1, 图标: icons.飞毛腿 },
            { 类型: '永久抗火', 图标: icons.永久抗火 }, { 类型: '永久力量', 值: 5, 图标: icons.永久力量 }, { 类型: '永久强化', 值: 10 },
            { 类型: '永久抗毒', 图标: icons.永久抗毒 }, { 类型: '永久解冻', 图标: icons.永久解冻 }, { 类型: '自爆', 图标: icons.炸弹 },
            { 类型: '周期隐身', 图标: icons.隐身 }, { 类型: '矿工', 图标: icons.矿工 },
          ];
          monster.携带药水 = potions[Math.floor(ports.random() * potions.length)];
          if (monster.携带药水.类型 === '自爆') monster.永久增益.push(monster.携带药水);
          if (monster.携带药水.类型 === '周期隐身') monster.永久增益.push(monster.携带药水);
          if (monster.携带药水.类型 === '矿工') monster.永久增益.push(monster.携带药水);
        }
      }
      placed = ports.placeMonsterAt(monster, spot.x, spot.y);
      if (placed) monster.状态 = 怪物状态.活跃;
    } else {
      const instance = new config.类({ 强化: empowered, 随机游走: (config.类 === catalog.巡逻怪物), x: spot.x, y: spot.y });
      placed = ports.placeItemAt(instance, spot.x, spot.y);
    }
    if (placed) {
      const radius = (kind === '特殊物品' || kind === '陷阱') ? 8 : 4;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (scoreMap[spot.y + dy]?.[spot.x + dx]) scoreMap[spot.y + dy]![spot.x + dx] = 0;
        }
      }
    }
  }
}

/**
 * Source `生成路障`. Quirk preserved: the fence roll tests `< 0.5` twice, so `石栅栏` is never chosen
 * (DEVIATIONS SRC-06). Caves lay straight runs; other layouts fill corridors that end in walls both ways.
 */
export function generateBarricades(state: WorldState, ports: CavePorts): void {
  const floor = state.当前层数; const { catalog } = ports;
  const free = (x: number, y: number) => isPositionFree(state, x, y, false);
  const grid = state.地牢 as unknown as ({ 背景类型: number } | undefined)[][];
  const total = Math.ceil(state.房间列表.length / 4 + floor / 2);
  for (let i = 0; i < total; i++) {
    let placed = false; let attempts = 0;
    while (!placed && attempts < 50) {
      attempts++;
      const x = Math.floor(ports.random() * (state.地牢大小 - 2)) + 1;
      const y = Math.floor(ports.random() * (state.地牢大小 - 2)) + 1;
      if (!free(x, y)) continue;
      const roll = ports.random();
      let Fence: Ctor;
      if (roll < 0.5) Fence = catalog.木栅栏;
      else if (roll < 0.5) Fence = catalog.石栅栏;
      else Fence = catalog.铁栅栏;
      if (state.地牢生成方式 === 'cave') {
        const length = 5 + Math.floor(ports.random() * floor) + Math.ceil(floor / 2);
        const horizontal = ports.random() < 0.5;
        const dx = horizontal ? 1 : 0; const dy = horizontal ? 0 : 1;
        for (let k = 0; k < length; k++) {
          const tx = x + k * dx; const ty = y + k * dy;
          if (free(tx, ty)) { ports.placeItemAt(new Fence({}), tx, ty); placed = true; }
        }
      } else {
        const blocks = (dx: number, dy: number) => {
          let tx = x; let ty = y;
          while (free(tx, ty) && ports.quickAdjacentMove(tx - dx, ty - dy, tx, ty)) { tx += dx; ty += dy; }
          if (grid[ty]?.[tx]?.背景类型 !== 单元格类型.墙壁) return false;
          let bx = x - dx; let by = y - dy;
          while (free(bx, by) && ports.quickAdjacentMove(bx + dx, by + dy, bx, by)) { bx -= dx; by -= dy; }
          if (grid[by]?.[bx]?.背景类型 !== 单元格类型.墙壁) return false;
          return true;
        };
        const horizontalBlock = blocks(1, 0);
        const verticalBlock = blocks(0, 1);
        let dx = 0; let dy = 0;
        if (horizontalBlock && verticalBlock) { if (ports.random() < 0.5) dx = 1; else dy = 1; }
        else if (horizontalBlock) dx = 1;
        else if (verticalBlock) dy = 1;
        else continue;
        let tx = x; let ty = y;
        while (free(tx, ty)) { ports.placeItemAt(new Fence({}), tx, ty); tx += dx; ty += dy; placed = true; }
        tx = x - dx; ty = y - dy;
        while (free(tx, ty)) { ports.placeItemAt(new Fence({}), tx, ty); tx -= dx; ty -= dy; placed = true; }
      }
    }
  }
}

/**
 * Source `生成并放置洞穴配方卷轴(洞穴区域, 层数)`: `洞穴区域` is unused and coordinates are drawn from the
 * fixed `100 + 层数 * 2` square rather than `地牢大小` (DEVIATIONS SRC-06).
 */
export function placeCaveRecipeScrolls(state: WorldState, ports: CavePorts, _caveArea: unknown, floor: number | null): void {
  if (floor === null || floor < 0 || state.是否为教程层) return;
  const total = 1 + Math.floor(ports.random() * floor);
  for (let i = 0; i < total; i++) {
    const recipe = ports.generateFusionRecipe(floor);
    if (recipe) {
      const scroll = new ports.catalog.配方卷轴({ recipeData: recipe, 层数: floor });
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = Math.floor(ports.random() * (100 + floor * 2));
        const y = Math.floor(ports.random() * (100 + floor * 2));
        if (isPositionFree(state, x, y, false)) {
          if (ports.placeItemAt(scroll, x, y)) break;
        }
      }
    }
  }
}
