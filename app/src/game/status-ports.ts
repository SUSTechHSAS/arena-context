import type { StatusEffect } from './status-effect';

export interface ProgressConfig { 图标: string; 颜色: string; 初始值: number; 标签: string }
export interface ProgressView { 更新(value: { 数值: number; 标签: string }): void; 销毁(): void }
export interface EffectSource { 应用效果(): void; 移除效果(): void }
export interface StatusActor {
  x: number; y: number; 名称?: string; 类型?: string;
  永久增益?: { 类型: string }[];
  受伤(amount: number, type: string): void;
}
export interface StatusMonster extends StatusActor { 获得效果(effect: StatusEffect): void }
export interface StatusPet extends StatusActor {
  自定义数据: Map<string, unknown>;
  更新宠物管理窗口(): void;
}
export interface StatusItem {
  材质?: unknown; 唯一标识: symbol | null; 自定义数据: Map<unknown, unknown>;
  获取名称(): string; 更新倒计时(): void;
}
export interface StatusPorts {
  playerEffects: StatusEffect[];
  monsterEffects: Map<StatusActor, StatusEffect>;
  petEffects: Map<StatusActor, StatusEffect>;
  player: StatusActor | null;
  cells: { 环境?: unknown }[][];
  grassEnvironment: unknown;
  woodMaterial: unknown;
  equipment: Map<number, StatusItem | null | undefined>;
  inventory: Map<symbol, StatusItem | null | undefined>;
  equipmentPage: number; equipmentPerPage: number;
  Pet: abstract new (...args: never[]) => StatusPet;
  Monster: abstract new (...args: never[]) => StatusMonster;
  random(): number;
  progress(config: ProgressConfig): ProgressView;
  flame(config: { 强化: number | undefined }): unknown;
  placeItem(item: unknown, x: number, y: number): void;
  damagePlayer(amount: number, type: string): void;
  destroyItem(identity: symbol | null, fromInventory: boolean): void;
  burnWoodenScrolls(): void;
  refreshEquipment(): void;
  log(message: string, type: string): void;
  notify(message: string, type: string): void;
}
