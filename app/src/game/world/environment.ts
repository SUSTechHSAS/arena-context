import { 单元格类型, 环境类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const NEIGHBOURS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;
const isFloor = (cell: Loose) => cell?.背景类型 === 单元格类型.走廊 || cell?.背景类型 === 单元格类型.房间;

/** Source `生成环境簇(centerX, centerY, envType)` (HTML L53002): BFS-grows an environment patch of 5–12 free floor cells. */
export function growEnvironmentCluster(state: WorldState, random: () => number, centerX: number, centerY: number, envType: unknown): void {
  const S = state as Loose;
  const queue = [{ x: centerX, y: centerY }];
  const visited = new Set([`${centerX},${centerY}`]);
  const target = 5 + Math.floor(random() * 8);
  let size = 0;
  while (queue.length > 0 && size < target) {
    const { x, y } = queue.shift()!;
    const cell = S.地牢[y]?.[x];
    if (cell && !cell.环境 && isFloor(cell) && !cell.关联物品) {
      cell.环境 = envType;
      size++;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < S.地牢大小 && ny >= 0 && ny < S.地牢大小 && !visited.has(key)) {
          if (random() < 0.7) {
            visited.add(key);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
}

export interface EnvironmentPorts {
  random(): number;
  growCluster(x: number, y: number, envType: unknown): void; // 生成环境簇
  createShrub(options: { 能否拾起: boolean }): unknown; // new 灌木丛(...)
  createFire(options: { 强化: boolean; 倒计时: number }): unknown; // new 火焰物品(...)
  placeItemAt(item: unknown, x: number, y: number): unknown; // 放置物品到单元格
}

/**
 * Source `全局生成环境()` (HTML L52920): environment clusters on free corridor/plain-room cells (never room id 0),
 * shrubs on grass and next to water, and permanent fires next to lava.
 */
export function generateEnvironment(state: WorldState, ports: EnvironmentPorts): void {
  const S = state as Loose;
  const envAttempts = Math.floor(S.地牢大小 * S.地牢大小 * 0.05);
  const envTypes: unknown[] = [环境类型.水, 环境类型.草地, 环境类型.冰];
  if (S.当前层数 >= 3) envTypes.push(环境类型.岩浆);
  for (let i = 0; i < envAttempts; i++) {
    const x = Math.floor(ports.random() * S.地牢大小);
    const y = Math.floor(ports.random() * S.地牢大小);
    const cell = S.地牢[y]?.[x];
    const validBackground = isFloor(cell)
      && (S.房间列表.find((r: Loose) => r.id === S.房间地图[y][x])?.类型 === '房间' || S.房间地图[y][x] === -1)
      && S.房间地图[y][x] != 0;
    if (cell && validBackground && !cell.环境 && !cell.关联物品 && !cell.关联怪物) {
      if (ports.random() < 0.3) ports.growCluster(x, y, envTypes[Math.floor(ports.random() * envTypes.length)]);
    }
  }

  const shrubAttempts = Math.floor(S.地牢大小 * S.地牢大小 * 0.08);
  for (let i = 0; i < shrubAttempts; i++) {
    const x = Math.floor(ports.random() * S.地牢大小);
    const y = Math.floor(ports.random() * S.地牢大小);
    const cell = S.地牢[y]?.[x];
    if (cell && isFloor(cell) && !cell.关联物品 && !cell.关联怪物) {
      let chance = 0;
      for (const [dx, dy] of NEIGHBOURS) {
        const neighbour = S.地牢[y + dy]?.[x + dx];
        if (neighbour && (neighbour.环境 === 环境类型.水 || neighbour.环境 === 环境类型.血水) && cell.环境 === null) {
          chance = 0.15;
          break;
        }
      }
      if (cell.环境 === 环境类型.草地) {
        chance = 0.15;
        for (const [dx, dy] of NEIGHBOURS) {
          const neighbour = S.地牢[y + dy]?.[x + dx];
          if (neighbour && (neighbour.环境 === 环境类型.水 || neighbour.环境 === 环境类型.血水)) {
            chance = 1.0;
            break;
          }
        }
      }
      if (ports.random() < chance) ports.placeItemAt(ports.createShrub({ 能否拾起: false }), x, y);
    }
  }

  const fireAttempts = Math.floor(S.地牢大小 * S.地牢大小 * 0.12);
  for (let i = 0; i < fireAttempts; i++) {
    const x = Math.floor(ports.random() * S.地牢大小);
    const y = Math.floor(ports.random() * S.地牢大小);
    const cell = S.地牢[y]?.[x];
    if (cell && isFloor(cell) && !cell.关联物品 && !cell.关联怪物) {
      let chance = 0;
      for (const [dx, dy] of NEIGHBOURS) {
        const neighbour = S.地牢[y + dy]?.[x + dx];
        if (neighbour && neighbour.环境 === 环境类型.岩浆 && cell.环境 !== 环境类型.岩浆) {
          chance = 0.15;
          break;
        }
      }
      if (ports.random() < chance) ports.placeItemAt(ports.createFire({ 强化: true, 倒计时: 9999 }), x, y);
    }
  }
}
