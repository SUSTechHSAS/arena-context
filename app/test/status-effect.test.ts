import { describe, expect, it } from 'vitest';
import { StatusEffect } from '../src/game/status-effect';
import { type ProgressConfig, type StatusActor, type StatusItem, type StatusPorts } from '../src/game/status-ports';
import { createOracle } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

type StatusKind = 'player' | 'pet' | 'monster';
function environment() {
  const events: unknown[][] = [];
  let randomCalls = 0; let health = 100;
  class TestProgress {
    declare config: ProgressConfig; declare updates: { 数值: number; 标签: string }[]; declare destroyed: number;
    constructor(config: ProgressConfig) { this.config = config; this.updates = []; this.destroyed = 0; events.push(['progress', config]); }
    更新(update: { 数值: number; 标签: string }) { this.updates.push(update); events.push(['progress-update', update]); }
    销毁() { this.destroyed++; events.push(['progress-destroy']); }
  }
  class TestSource {
    applied = 0; removed = 0;
    应用效果() { this.applied++; events.push(['source-apply']); }
    移除效果() { this.removed++; events.push(['source-remove']); }
  }
  class TestItem implements StatusItem {
    材质 = 'wood'; 唯一标识 = Symbol('item'); 自定义数据 = new Map<string, unknown>([['耐久', 2], ['静默回合', 12]]);
    获取名称() { return '木质装备'; }
    更新倒计时() { events.push(['item-countdown']); }
  }
  class TestMonster implements StatusActor {
    x = 1; y = 1; 名称 = '怪物A'; 类型 = '怪物'; 永久增益: { 类型: string }[] = []; health = 50;
    受伤(amount: number, type: string) { this.health -= amount; events.push(['actor-damage', amount, type]); }
    获得效果(effect: StatusEffect) { events.push(['gain', effect.类型, effect.剩余回合, effect.强度]); }
  }
  class TestPet implements StatusActor {
    x = 1; y = 1; 名称 = '宠物A'; 类型 = '宠物'; 永久增益: { 类型: string }[] = []; health = 50;
    自定义数据 = new Map<string, unknown>();
    受伤(amount: number, type: string) { this.health -= amount; events.push(['actor-damage', amount, type]); }
    更新宠物管理窗口() { events.push(['pet-refresh']); }
  }
  class TestFlame { constructor(public config: { 强化: number | undefined }) { events.push(['flame', config]); } }
  const item = new TestItem();
  const pet = new TestPet(); const monster = new TestMonster();
  const permanent = new TestItem(); permanent.自定义数据.set('不可破坏', true);
  pet.自定义数据.set('装备', { weapon: item, armor: permanent });
  const source = new TestSource();
  const player = new TestMonster(); player.名称 = '';
  const ports: StatusPorts = {
    playerEffects: [], monsterEffects: new Map(), petEffects: new Map(), player,
    cells: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ 环境: 'grass' }))),
    grassEnvironment: 'grass', woodMaterial: 'wood',
    equipment: new Map([[1, item], [2, permanent], [9, null]]), inventory: new Map([[item.唯一标识, item]]),
    equipmentPage: 0, equipmentPerPage: 3, Pet: TestPet, Monster: TestMonster,
    random: () => { randomCalls++; events.push(['random']); return randomCalls % 2 ? 0.1 : 0.9; },
    progress: config => new TestProgress(config), flame: config => new TestFlame(config),
    placeItem: (value, x, y) => { events.push(['place', value, x, y]); },
    damagePlayer: (amount, type) => { health -= amount; events.push(['player-damage', amount, type]); },
    destroyItem: (identity, flag) => { events.push(['destroy', identity, flag]); },
    burnWoodenScrolls: () => { events.push(['burn-scrolls']); }, refreshEquipment: () => { events.push(['equipment-refresh']); },
    log: (message, type) => { events.push(['log', message, type]); }, notify: (message, type) => { events.push(['notify', message, type]); },
  };
  return { ports, pet, monster, source, events, item, TestProgress, TestFlame,
    summary: () => ({ randomCalls, health, pet, monster, source, equipment: ports.equipment, inventory: ports.inventory, events }) };
}

function runSource(steps: (add: (type: string, duration: number, remaining: number | null, kind: StatusKind, strength: number) => StatusEffect,
  env: ReturnType<typeof environment>) => StatusEffect[]) {
  const env = environment(); const { ports } = env;
  const original = createOracle(['状态效果'], {
    玩家状态: ports.playerEffects, 怪物状态表: ports.monsterEffects, 宠物状态表: ports.petEffects,
    玩家: ports.player, 地牢: ports.cells, 宠物: ports.Pet, 怪物: ports.Monster, 进度条元素: env.TestProgress,
    环境类型: { 草地: ports.grassEnvironment }, 材质: { 木质: ports.woodMaterial }, prng: ports.random,
    玩家装备: ports.equipment, 玩家背包: ports.inventory, 当前装备页: ports.equipmentPage, 装备栏每页装备数: ports.equipmentPerPage,
    伤害玩家: ports.damagePlayer, 添加日志: ports.log, 显示通知: ports.notify,
    火焰物品: env.TestFlame, 放置物品到单元格: ports.placeItem, 处理销毁物品: ports.destroyItem,
    处理燃烧木质卷轴: ports.burnWoodenScrolls, 更新装备显示: ports.refreshEquipment,
  });
  const created = steps((type, duration, remaining, kind, strength) => original.construct<StatusEffect>('状态效果',
    type, '#red', '!', duration, remaining, env.source, kind === 'player' ? null : env[kind], strength), env);
  return { ...env.summary(), created, playerEffects: original.context.玩家状态, monsterEffects: ports.monsterEffects, petEffects: ports.petEffects };
}
function runCandidate(steps: Parameters<typeof runSource>[0]) {
  const env = environment(); const { ports } = env;
  const created = steps((type, duration, remaining, kind, strength) => new StatusEffect(ports,
    type, '#red', '!', duration, remaining, env.source, kind === 'player' ? null : env[kind], strength), env);
  return { ...env.summary(), created, playerEffects: ports.playerEffects, monsterEffects: ports.monsterEffects, petEffects: ports.petEffects };
}
function compare(steps: Parameters<typeof runSource>[0]) {
  expect(JSON.stringify(graphSnapshot(runCandidate(steps), { StatusEffect: '状态效果' })))
    .toBe(JSON.stringify(graphSnapshot(runSource(steps))));
}

describe('full status-class lifecycle against exact source with explicit actor/UI/item ports', () => {
  for (const kind of ['player', 'pet', 'monster'] as const) {
    it(`${kind}: all effect types, default/falsy remaining, negative/non-finite durations and repeated expiry`, () => {
      for (const type of ['中毒', '火焰', '冻结', '腐蚀', '抗火', '其他']) {
        for (const duration of [0, 1, 3, -1, Infinity, NaN]) {
          for (const remaining of [null, 0, 2]) compare(add => {
            const effect = add(type, duration, remaining, kind, 0);
            for (let turn = 0; turn < 4; turn++) effect.更新状态();
            effect.移除状态();
            return [effect];
          });
        }
      }
    });
    it(`${kind}: stack identity, strength cap, replacement and flame resistance order`, () => {
      for (const type of ['中毒', '火焰', '冻结', '腐蚀']) compare(add => {
        const first = add(type, 2, null, kind, 3);
        const second = add(type, 5, 0, kind, 4);
        const immune = add('抗火', 3, null, kind, 1);
        const blocked = add('火焰', 8, null, kind, 1);
        first.更新状态(); second.更新状态(); immune.更新状态(); blocked.移除状态();
        return [first, second, immune, blocked];
      });
    });
  }

  it('preserves player-fire coupling with frozen effects and UI/local-turn quirks', () => compare(add => {
    const fire = add('火焰', 4, null, 'player', 2);
    const frozen = add('冻结', 3, null, 'player', 1);
    const petFrozen = add('冻结', 3, null, 'pet', 1);
    frozen.更新状态(); petFrozen.更新状态(); frozen.更新状态();
    fire.移除状态(); frozen.更新状态(); petFrozen.更新状态();
    return [fire, frozen, petFrozen];
  }));

  it('permanent actor fire immunity returns unregistered effects without a random draw', () => compare((add, env) => {
    env.pet.永久增益.push({ 类型: '永久抗火' }); env.monster.永久增益.push({ 类型: '永久抗火' });
    const pet = add('火焰', 3, null, 'pet', 1); const monster = add('火焰', 3, null, 'monster', 1);
    return [pet, monster];
  }));

  it('pet corrosion breaks only destructible equipment and refreshes/logs in source order', () => compare((add, env) => {
    env.item.自定义数据.set('耐久', 1);
    const effect = add('腐蚀', 2, null, 'pet', 2); effect.更新状态(); effect.更新状态(); return [effect];
  }));
});
