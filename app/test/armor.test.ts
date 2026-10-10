import { describe, it } from 'vitest';
import type { ArmorConfig } from '../src/game/armor';
import { FUSION_BUFF_TYPES as B } from '../src/game/buffs';
import { compareArmor as compare, outcome } from './oracle/armor-fixture';

const profiles: ArmorConfig[] = [
  {}, { 品质: 0, 防御力: 0, 耐久: 0 }, { 品质: undefined, 类型: '覆盖类型', 名称: '' } as unknown as ArmorConfig,
  { 品质: 5, 强化: true, 防御力: 7, 耐久: 1, 附魔: [{ 种类: '保护附魔', 等级: 3 }, { 种类: '耐久附魔', 等级: 3 }, { 种类: '荆棘附魔', 等级: 2 }] },
  { 数据: new Map([['防御力', 99]]) },
  { 数据: { 防御力: '2', 耐久: '0.20' }, 强化: true },
  { 数据: { 防御力: NaN, 耐久: Infinity }, 品质: -1 },
  { 不可破坏: true, 耐久: 2 },
  { 附魔: [{ 种类: '爆炸保护附魔', 等级: 2 }, { 种类: '火焰附魔', 等级: 1 }] },
  { 附魔: [{ 种类: '火焰附魔', 等级: 0 }, { 种类: '火焰附魔', 等级: 2 }],
    fusedBuffs: [{ type: B.闪避几率, value: 1 }, { type: B.中毒几率, value: 1 }, { type: B.受击回能, value: 1.2 }] },
  { fusedBuffs: [{ type: B.防御加成, value: 2 }, { type: B.防御倍率, value: 0.5 }, { type: B.协同效应, value: 3 }, { type: B.固定伤害减免, value: 2 }] },
  { 数据: { 附魔: null, fusedBuffs: [] } },
];

describe('complete defensive-equipment logic against exact original base class', () => {
  it.each(profiles.map((config, index) => [index, config] as const))('constructor/getters/hints/use profile #%i', (_index, config) => compare(config,
    armor => ({ defense: armor.最终防御力, consumption: armor.耐久消耗, thorn: armor.反伤,
      hint: outcome(() => armor.获取提示()), use: armor.使用(), equip: armor.装备(), unequip: armor.取消装备() })));

  it('all profiles × damage boundaries × attacker kinds preserve events/state and draws', () => {
    for (const config of profiles) for (const amount of [-1, 0, 0.1, 2, 20, NaN, Infinity]) for (const kind of ['none', 'bomb', 'monster', 'dead', 'cactus']) {
      compare(config, (armor, env) => {
        const target = kind === 'cactus' ? new env.CactusStub() : new env.MonsterStub();
        if (kind === 'dead') target.当前生命值 = 0;
        const attacker = kind === 'none' ? null : kind === 'bomb' ? '炸弹' : target;
        return { damage: armor.当被攻击(amount, attacker), target };
      });
    }
  });
  it('sequential attacks, dodge chip damage, thorns exclusion and destroyed callbacks repeat', () => {
    compare({ 耐久: 0.2, fusedBuffs: [{ type: B.闪避几率, value: 1 }], 附魔: [{ 种类: '荆棘附魔', 等级: 2 }] }, (armor, env) => {
      const target = new env.MonsterStub();
      return [armor.当被攻击(5, target), armor.当被攻击(5, target), armor.当被攻击(5, new env.CactusStub())];
    });
  });
  it('ordered buffs, duplicate enchantments and initial-energy zero/NaN preserve source quirks', () => {
    for (const initial of [0, -1, NaN, 100]) compare({ fusedBuffs: [{ type: B.受击回能, value: 0 }],
      附魔: [{ 种类: '爆炸保护附魔', 等级: 0 }, { 种类: '爆炸保护附魔', 等级: 1 }] }, (armor, env) => {
      env.ports.initialEnergy = initial; return armor.当被攻击(8, '炸弹');
    });
    compare({ fusedBuffs: [{ type: B.防御倍率, value: 0.5 }, { type: B.防御加成, value: 2 },
      { type: B.协同效应, value: 1 }, { type: B.协同效应, value: 7 }] }, armor => armor.最终防御力);
  });
});
