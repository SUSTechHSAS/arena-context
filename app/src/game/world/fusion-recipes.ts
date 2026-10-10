import { 融合配方列表 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctor = new (options: Record<string, never>) => Loose;

const EXCLUDED = ['配方卷轴', '神秘商人', '探险家', '物品祭坛', '耐久祭坛', '背包扩容祭坛', '重铸台', '折跃门', '寻宝戒指', '罐子', '洗身砚', '神龛', '挑战石碑'];

export interface FusionClassPorts {
  /** Constructors checked with `instanceof`, by source class name. */
  classes: Record<'武器类' | '防御装备类' | '空桶' | '水桶' | '岩浆桶' | '冰桶' | '血水桶' | '炸弹' | '卷轴类' | '钥匙', abstract new (...args: never[]) => unknown>;
}

/** Source `是否为有效融合武器(物品)` (HTML L47674). */
export function isFusionWeapon(ports: FusionClassPorts, item: unknown): boolean {
  const c = ports.classes;
  return item instanceof c.武器类 || item instanceof c.防御装备类 || item instanceof c.空桶 || item instanceof c.水桶 || item instanceof c.岩浆桶 || item instanceof c.冰桶 || item instanceof c.血水桶;
}

/** Source `是否为有效融合材料(物品)` (HTML L47678); a nullish item throws on `.类型` unless it is a bomb or scroll. */
export function isFusionMaterial(ports: FusionClassPorts, item: Loose): boolean {
  const c = ports.classes;
  return item instanceof c.炸弹 || item instanceof c.卷轴类 || item.类型 === '药水' || item instanceof c.钥匙 || item instanceof c.血水桶;
}

export interface RandomRecipePorts {
  random(): number;
  gold: Ctor; // 金币
  key: Ctor; // 钥匙
}

/**
 * Source `生成单个随机融合配方(层数)` (HTML L47365): up to 50 attempts to invent a new 2–3 input recipe from the item pool
 * (gold or a key may be one input) whose output is a better-quality pool item; registers it in 程序生成配方列表.
 * Temporary instances are constructed exactly where and as often as the source constructs them.
 */
export function generateRandomFusionRecipe(state: WorldState, ports: RandomRecipePorts, floor: Loose): Loose {
  const S = state as Loose;
  for (let attempt = 0; attempt < 50; attempt++) {
    const numInputs = Math.round(ports.random() * 0.7) + 2;
    const inputs: Loose[] = [];
    const inputNames: Loose[] = [];
    const pool: Loose[] = (Object.values(S.物品池) as Loose[]).flat().filter((cfg: Loose) =>
      cfg.最小层 <= floor && new cfg.类({}).是否正常物品 && !EXCLUDED.includes(cfg.类.name));
    if (pool.length < numInputs && !(numInputs === 2 && pool.length === 1 && ports.random() < 0.5)) continue;
    let canUseSpecial = true;
    for (let i = 0; i < numInputs; i++) {
      let selected: Loose;
      if (canUseSpecial && ports.random() < 0.3) {
        if (ports.random() < 0.7 && floor >= 0) selected = { 类: ports.gold, name: '金币', isSpecial: true, 品质: 1 };
        else if (floor >= 1) selected = { 类: ports.key, name: '钥匙', isSpecial: true, 品质: 1 };
        else if (pool.length > 0) selected = pool[Math.floor(ports.random() * pool.length)];
        else continue;
        if (selected.isSpecial) canUseSpecial = false;
      } else if (pool.length > 0) {
        selected = pool[Math.floor(ports.random() * pool.length)];
      } else {
        break;
      }
      if (selected) {
        const temp = new selected.类({});
        inputs.push(temp.名称);
        inputNames.push(temp.名称);
      }
    }
    if (inputs.length !== numInputs) continue;
    const outputPool = pool.filter((cfg: Loose) =>
      !inputNames.includes(new cfg.类({}).名称)
      && cfg.品质 > Math.min(...inputs.map((name) => (pool.find((c: Loose) => new c.类({}).名称 === name) || { 品质: 1 }).品质)));
    if (outputPool.length === 0) continue;
    const outputCfg = outputPool[Math.floor(ports.random() * outputPool.length)];
    const output = new outputCfg.类({});
    const recipe = {
      输入: inputs.sort(),
      输出类: outputCfg.类.name,
      输出类名称: output.名称,
      输出数量: 1,
      输出配置: { 品质: output.品质, 强化: true },
      说明: `${inputNames.join(' + ')} = ${output.名称}[强]`,
      发现层数: floor,
    };
    const existing = S.程序生成配方列表.find((r: Loose) => r.输出类名称 === recipe.输出类名称 && r.输入.length === recipe.输入.length
      && r.输入.every((val: unknown, index: number) => val === recipe.输入[index]));
    const hardcoded = 融合配方列表.find((r: Loose) => (r.输出类名称 || r.输出类) === recipe.输出类名称 && r.输入.length === recipe.输入.length
      && r.输入.every((val: unknown, index: number) => val === recipe.输入[index]));
    if (!existing && !hardcoded) {
      S.程序生成配方列表.push(recipe);
      return recipe;
    }
  }
  return null;
}
