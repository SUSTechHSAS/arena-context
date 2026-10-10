import vm from 'node:vm';
import { types } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createWorldState, type WorldState } from '../src/game/world/state';
import { resetAllGameState, type ResetPorts } from '../src/game/world/reset';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const keys = Object.keys(createWorldState());
const UI_GLOBALS = ['编辑器状态', '胜利条件提示元素组', '怪物动画状态'];

/** One dirty pre-reset world, written once and executed in both realms. */
const dirty = (variant: number) => `
  所有怪物 = [
    { id: 'm1', 绘制血条(force) { log('bar', 'm1', force, 当前层数); } },
    { id: 'm2' },
    { id: 'm3', 绘制血条(force) { log('bar', 'm3', force); 所有怪物.push({ id: 'late' }); } },
  ];
  怪物动画状态 = { delete(monster) { log('anim', monster.id, 地牢.length); } };
  胜利条件提示元素组 = { 标题: { 销毁() { log('destroy', '标题', 最大背包容量); } }, 回合: null,
    伤害: { 销毁() { log('destroy', '伤害'); } }, 生命: 0, 死亡: null };
  地牢 = [[1, 2], [3]]; 房间列表 = [{ id: 1 }]; 上锁房间列表 = [{ id: 2 }]; 当前层数 = 7; 地牢大小 = ${3 + variant};
  玩家 = { x: 3, y: 4, 额外: 'keep' }; 玩家初始位置 = { x: 9, y: 9 }; 当前天气效果 = ['大风'];
  融合区物品 = [1, null, 2, null]; 融合结果 = 'r'; 传送点列表 = [{ id: 'p' }];
  自定义全局设置.初始生命值 = ${70 + variant}; 自定义全局设置.初始能量值 = 55;
  自定义游戏设置.极限模式 = true; 地牢生成方式 = 'cave'; 当前关卡存档数据字符串 = 'level';
  玩家属性 = { ...玩家属性, 当前生命值: 3, 当前能量值: 4, 已获得神龛效果: ['旧'] };
  globalThis.oldAttrs = 玩家属性; globalThis.oldMonsterTable = 怪物状态表; globalThis.oldPetTable = 宠物状态表;
  玩家状态 = [
    { id: 1, 移除状态() { log('status', 1, 当前层数, 是否是自定义关卡, 永久Buffs.已获得效果.size); 玩家状态 = 玩家状态.filter(s => s.id !== 1); } },
    { id: 2, 移除状态() { log('status', 2, 玩家状态.length); } },
  ];
  当前激活卷轴列表 = new Set(${variant === 2 ? '[]' : `[
    { id: 's1', 卸下() { log('scroll', 's1', 当前激活卷轴列表.size, 是否是自定义关卡); } },
    { id: 's2', 卸下() { log('scroll', 's2', 当前激活卷轴列表.size); } },
  ]`});
  永久Buffs.已获得效果.add('x'); 是否是自定义关卡 = true; 玩家死亡次数 = 4; 已击杀怪物数 = 8; 教程阶段 = 3;
  最高教程阶段 = 5; 是否为教程层 = true; 日志历史 = ['l']; 最大背包容量 = 20; 玩家总移动回合数 = 11; 玩家总受到伤害 = 12;
  NPC互动中 = true; 当前NPC = { n: 1 }; 死亡界面已显示 = true; 调试无限生命 = true; 调试无限能量 = true;
  红蓝开关状态 = '蓝'; 绿紫开关状态 = '紫'; 所有计时器 = [{ 唯一标识: null }]; 已揭示洞穴格子 = new Set(['1,1']);
  玩家背包 = new Map([[1, 1]]); 玩家装备 = new Map([[1, 2]]); 门实例列表 = new Map([[1, 3]]); 已访问房间 = new Set([1]);
  玩家仆从列表 = [1]; 游戏开始时间 = 5; 上次死亡地点 = { x: 1 }; 移动历史 = [1];
  开发者模式 = ${variant >= 1};
  globalThis.throwDebug = ${variant === 3};
`;

function runSource(variant: number) {
  const events: unknown[][] = [];
  const context = vm.createContext({
    log: (...args: unknown[]) => events.push(args),
    document: {
      getElementById(id: string) { events.push(['dom', id]); return { set innerHTML(v: string) { events.push(['html', id, v]); } }; },
      querySelectorAll(selector: string) {
        events.push(['dom-all', selector]);
        return [0, 1].map(() => ({ set innerHTML(v: string) { events.push(['slot', v]); } }));
      },
    },
    怪物追踪提示: { 更新(o: { 内容: string }) { events.push(['hint', '怪物追踪提示', o.内容]); } },
    击杀提示: { 更新(o: { 内容: string }) { events.push(['hint', '击杀提示', o.内容]); } },
  });
  const texts = [...new Set(['地牢大小', ...keys, ...UI_GLOBALS].map(name => declaration(name)))];
  new vm.Script(texts.join('\n') + '\n' + declaration('重置所有游戏状态') + `
    class 调试工具 { constructor(config) { this.kind = 'debug'; log('debug-ctor', JSON.stringify(config)); } }
    function 尝试收集物品(item, flag) { log('collect', item.kind, flag); if (globalThis.throwDebug) throw new Error('debug'); }
  `).runInContext(context);
  new vm.Script(dirty(variant)).runInContext(context);
  new vm.Script('重置所有游戏状态()').runInContext(context);
  const read = (code: string) => new vm.Script(code).runInContext(context) as unknown;
  return { events, read };
}

function runRewrite(variant: number) {
  const events: unknown[][] = [];
  const state = createWorldState();
  const context = vm.createContext({ log: (...args: unknown[]) => events.push(args), S: state });
  new vm.Script(`with (S) { ${dirty(variant)} }`).runInContext(context);
  const read = (code: string) => new vm.Script(code).runInContext(context) as unknown;
  let editorResets = 0;
  const ports: ResetPorts = {
    forgetMonsterAnimation: monster => { events.push(['anim', (monster as { id: string }).id, state.地牢.length]); },
    resetEditorState: () => { editorResets++; },
    destroyVictoryHints: () => { read(`Object.keys(胜利条件提示元素组).forEach(k => { if (胜利条件提示元素组[k]) { with (S) { 胜利条件提示元素组[k].销毁(); } 胜利条件提示元素组[k] = null; } })`); },
    clearPanels: () => {
      events.push(['dom', '背包物品栏'], ['html', '背包物品栏', ''], ['dom-all', '.装备槽'], ['slot', ''], ['slot', ''], ['dom', 'logContent'], ['html', 'logContent', '']);
    },
    updateHint: (hint, text) => { events.push(['hint', hint, text]); },
    grantDebugTool: () => {
      events.push(['debug-ctor', '{}'], ['collect', 'debug', true]);
      if (read('globalThis.throwDebug')) throw new Error('debug');
    },
  };
  resetAllGameState(state as WorldState, ports);
  return { events, read, state, editorResets };
}

const graph = (value: unknown) => JSON.stringify(graphSnapshot(value));

describe('重置所有游戏状态 on a session', () => {
  for (const variant of [0, 1, 2, 3]) {
    it(`variant ${variant}: final state, aliasing, untouched globals and ordered side effects match the source`, () => {
      const source = runSource(variant); const mine = runRewrite(variant);
      expect(mine.events).toEqual(source.events);
      expect(mine.editorResets).toBe(1);
      const plain = keys.filter(key => !types.isWeakMap((mine.state as Record<string, unknown>)[key]));
      // One combined graph catches cross-key aliasing (e.g. 玩家属性 sharing 已获得神龛效果 with 初始玩家属性).
      const sourceGraph = source.read(`({ ${plain.map(key => `${JSON.stringify(key)}: ${key}`).join(', ')}, oldAttrs: globalThis.oldAttrs })`);
      const mineGraph = { ...Object.fromEntries(plain.map(key => [key, (mine.state as Record<string, unknown>)[key]])), oldAttrs: mine.read('globalThis.oldAttrs') };
      expect(graph(mineGraph)).toBe(graph(sourceGraph));
      expect(mine.state.怪物状态表).toBe(mine.read('globalThis.oldMonsterTable'));
      expect(source.read('怪物状态表 === globalThis.oldMonsterTable')).toBe(true);
      expect(mine.state.宠物状态表).not.toBe(mine.read('globalThis.oldPetTable'));
      expect(source.read('宠物状态表 !== globalThis.oldPetTable')).toBe(true);
      expect(mine.state.玩家属性.已获得神龛效果).toBe(mine.state.初始玩家属性.已获得神龛效果);
    });
  }
  it('the differential harness detects a reordered statement (mutation check)', () => {
    const source = runSource(1); const mine = runRewrite(1);
    const swapped = [...mine.events]; const index = swapped.findIndex(event => event[0] === 'scroll');
    [swapped[index], swapped[index - 1]] = [swapped[index - 1]!, swapped[index]!];
    expect(swapped).not.toEqual(source.events);
  });
});
