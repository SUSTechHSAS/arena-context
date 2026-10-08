import { describe, expect, it } from 'vitest';
import { DEFENSIVE_CLASSES, 引雷针护符, type DefensiveKind } from '../src/game/armor-items';
import { compareArmor, outcome } from './oracle/armor-fixture';
import type { ArmorConfig } from '../src/game/armor';

const kinds = Object.keys(DEFENSIVE_CLASSES) as DefensiveKind[];
const profiles: ArmorConfig[] = [{}, { 强化: true }, { 品质: 0, 名称: '覆盖', 耐久: 0, x: 0, y: 0 },
  { 图标: '自定义', 品质: 5, 防御力: 9, 材质: '木质', 数据: { 防御力: 7, 耐久: 2, 充能概率: 0.99, 能量恢复概率: 1, 闪避触发概率: 1 } },
  { 能否拾起: true, x: 1, y: 1, 数据: new Map([['耐久', 1]]) },
  { 不可破坏: true, 附魔: [{ 种类: '荆棘附魔', 等级: 2 }] }];

describe('all twelve original defensive subclasses', () => {
  it.each(kinds)('%s constructor override/spread/map rules and inherited actions/hints', kind => {
    for (const profile of profiles) compareArmor(profile, armor => ({
      hint: outcome(() => armor.获取提示()), use: armor.使用(), defense: armor.最终防御力,
      consume: armor.耐久消耗, equip: armor.装备(), unequip: armor.取消装备(),
    }), undefined, kind);
  });
  it('every subclass × attacker kind × draws preserves random/callback order and final states', () => {
    for (const kind of kinds) for (const attacker of ['none', 'bomb', 'thunder', 'monster', 'cactus']) for (const draws of [[0.01], [0.99], [0.25, 0.75, 0.5]]) {
      compareArmor({ 强化: true, 耐久: 2 }, (armor, env) => {
        const target = attacker === 'cactus' ? new env.CactusStub() : new env.MonsterStub();
        const source = attacker === 'none' ? null : attacker === 'bomb' ? '炸弹' : attacker === 'thunder' ? '雷暴' : target;
        return { result: armor.当被攻击(5, source), target, hint: armor.获取提示() };
      }, draws, kind);
    }
  });
  it('lightning source effects retain identity and repeated apply/remove/additional strike behavior', () => {
    compareArmor({}, (armor, env) => {
      const amulet = armor as 引雷针护符;
      expect(amulet.constructor.name).toBe('引雷针护符');
      const first = amulet.当被攻击(5, '雷暴');
      amulet.应用效果(); const before = amulet.获取提示(); amulet.移除效果();
      const second = amulet.当被攻击(5, '雷暴');
      env.ports.playerEffects.length = 0; amulet.移除效果();
      return { first, second, before, after: amulet.获取提示() };
    }, [0.01], '引雷针护符');
  });
  it('bush collectible/terrain damage, matching-cell clearing, painting and retained timers', () => {
    for (const pickup of [false, true]) compareArmor({ x: 1, y: 1, 能否拾起: pickup }, (bush, env) => {
      env.ports.cells[1]![1]!.关联物品 = bush;
      env.ports.timers.push({ 唯一标识: bush.唯一标识 });
      const result = [bush.当被收集('玩家'), bush.当被收集('怪物')];
      bush.移除自身(); bush.移除自身(); return result;
    }, undefined, '灌木丛');
  });
  it('psychic/ice post-super random branches still run after destroyed durability', () => {
    for (const kind of ['灵能盾牌', '冰盾'] as const) compareArmor({ 耐久: -1 }, (armor, env) =>
      armor.当被攻击(0, new env.MonsterStub()), [0.01], kind);
  });
});
