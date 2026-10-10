import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { generateRandomFusionRecipe, isFusionMaterial, isFusionWeapon, type FusionClassPorts } from '../src/game/world/fusion-recipes';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['生成单个随机融合配方', '是否为有效融合武器', '是否为有效融合材料'];
const GLOBALS = ['prng', '融合配方列表'];
const CLASS_NAMES = ['武器类', '防御装备类', '空桶', '水桶', '岩浆桶', '冰桶', '血水桶', '炸弹', '卷轴类', '钥匙'] as const;
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  const defs = {};
  const define = (name, label, quality, normal = true, base = Object) => {
    const C = { [name]: class extends base { constructor(o) { super(o); calls.push(['new', name]); this.名称 = label; this.品质 = quality; this.是否正常物品 = normal; } } }[name];
    defs[name] = C; return C;
  };
  class 物品 { constructor(o) {} }
  const 武器类 = define('武器类', '武器', 1, true, 物品); const 防御装备类 = define('防御装备类', '护甲', 1, true, 物品);
  for (const n of ['空桶', '水桶', '岩浆桶', '冰桶', '血水桶', '炸弹', '卷轴类']) globalThis[n] = define(n, n, 1, true, 物品);
  const 金币 = define('金币', '金币', 1); const 钥匙 = define('钥匙', '钥匙', 1, true, 物品);
  Object.assign(globalThis, { 武器类, 防御装备类, 金币, 钥匙 });
  const catalogue = [['钢制长剑', '钢制长剑', 1], ['治疗药水', '治疗药水', 1], ['吸血剑', '吸血剑', 3], ['火焰剑', '火焰剑', 2], ['皮甲', '皮甲', 1], ['罐子', '罐子', 4],
    ['神龛', '神龛', 5], ['魔杖', '魔杖', 2], ['假剑', '钢制长剑', 2], ['怪药', '怪药', 3, false]];
  for (let session = 0; session < 3; session++) {
    const chosen = catalogue.filter(() => r() < 0.6);
    物品池 = {}; for (const [n, label, q, normal] of chosen) { const key = pick(['武器', '药水', '杂项']); (物品池[key] ??= []).push({ 类: defs[n] ?? define(n, label, q, normal ?? true, pick([物品, 武器类])), 最小层: pick([-2, 0, 0, 1, 3]), 品质: q + pick([0, 0, 1]) }); }
    if (r() < 0.1) 物品池 = {};
    程序生成配方列表 = r() < 0.3 ? [{ 输入: ['治疗药水', '钢制长剑'].sort(), 输出类名称: '火焰剑' }] : [];
    for (let step = 0; step < 3; step++) {
      try {
        const k = r();
        if (k < 0.6) results.push(['recipe', 生成单个随机融合配方(pick([-1, 0, 1, 3, '2']))]);
        else {
          const sample = pick([new 武器类({}), new 防御装备类({}), new 水桶({}), new 血水桶({}), new 炸弹({}), new 卷轴类({}), new 钥匙({}), { 类型: '药水' }, { 类型: '武器' }, null, new 金币({}), Object.defineProperty(new 卷轴类({}), '类型', { get() { throw new RangeError('类型'); } })]);
          results.push(['valid', 是否为有效融合武器(sample), 是否为有效融合材料(sample)]);
        }
      } catch (error) { results.push(['throw', error.constructor.name]); }
    }
    results.push(程序生成配方列表);
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const classes = () => ({ classes: Object.fromEntries(CLASS_NAMES.map(name => [name, g(name)])) }) as FusionClassPorts;
  Object.assign(context, {
    生成单个随机融合配方: (floor: unknown) => generateRandomFusionRecipe(state, { random: () => g<() => number>('__rand')(), gold: g('金币'), key: g('钥匙') }, floor),
    是否为有效融合武器: (item: unknown) => isFusionWeapon(classes(), item),
    是否为有效融合材料: (item: unknown) => isFusionMaterial(classes(), item),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('fusion recipe helpers (生成单个随机融合配方, 是否为有效融合武器/材料)', () => {
  it('matches the source over 800 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 800; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const entry of source.results as unknown[][]) {
        if (entry?.[0] === 'recipe') { const recipe = entry[1] as { 输入: string[] } | null; bump(recipe ? 'recipe' : 'null'); if (recipe?.输入.some(n => n === '金币' || n === '钥匙')) bump('special'); if (recipe?.输入.length === 3) bump('three'); }
        else if (entry?.[0]) bump(`${String(entry[0])}:${String(entry[1])}:${String(entry[2])}`);
      }
    }
    for (const key of ['recipe', 'null', 'special', 'three', 'valid:true:false', 'valid:false:true', 'valid:true:true', 'valid:false:false', 'throw:TypeError:undefined']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
