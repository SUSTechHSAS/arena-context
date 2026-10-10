import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { GameDoor } from '../src/game/door';
import { SOURCE_GLOBAL_CLASS_NAMES, SourceClassRegistry } from '../src/game/runtime/class-registry';
import { createSaveEnvelope, type SaveEnvelopeSession, type SaveEnvelopeState } from '../src/game/runtime/save-envelope';
import { createFloorCodec } from '../src/game/runtime/save-floors';
import { createItemCellCodec } from '../src/game/runtime/save-items-cells';
import { createMonsterCodec } from '../src/game/runtime/save-monsters';
import { GameCell } from '../src/game/world/cell';
import { 单元格类型, 环境类型 } from '../src/game/world/constants';
import { createWorldState } from '../src/game/world/state';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['序列化物品', '恢复物品', '序列化单元格', '恢复单元格', '序列化怪物', '恢复怪物', '序列化楼层', '恢复楼层',
  '保存游戏状态', '恢复游戏状态', '导出存档', '导入存档'];
const SOURCE_GLOBALS = ['单元格类型', '环境类型', '颜色表', '单元格', '怪物状态', '门'];
const ITEM_CLASSES = ['物品', '刷怪笼', '武器类', '防御装备类', '宠物', '神秘商人', '祭坛类', '物品祭坛', '折跃门', '药水类', '附魔卷轴', '神秘药水',
  '隐形毒气陷阱', '卷轴类'];
const MONSTER_CLASSES = ['怪物', '王座守护者', '蜈蚣怪物', '蜈蚣部位', '骷髅仆从', '召唤师怪物', '幽灵仆从', '大魔法师', '旋风怪物', '旋风', '佣兵单位',
  '腐蚀怪物', '盗贼怪物', '吸能怪物', '剧毒云雾怪物', '萨满怪物', '大史莱姆怪物', '瞬移怪物', '伪装怪物', '炸弹怪物', '超速怪物', '巡逻怪物'];
const ALL = [...ITEM_CLASSES, ...MONSTER_CLASSES, '野怪'];
/** Page globals touched by the envelope and the codecs it composes (`prng` is wired separately). */
const GLOBALS = ['所有怪物', '当前层数', '怪物状态表', '玩家', '是否是自定义关卡', '玩家仆从列表', '地牢大小', '门实例列表', '玩家背包', '玩家装备', '玩家状态',
  '当前激活卷轴列表', '当前出战宠物列表', '所有地牢层', '地牢', '房间列表', '上锁房间列表', '已访问房间', '房间地图', '所有计时器', '玩家初始位置', '当前天气效果',
  '自定义全局设置', '地牢生成方式', '已揭示洞穴格子', '所有传送门', '玩家属性', '初始玩家属性', '游戏状态', '当前相机X', '当前相机Y', '相机目标X', '相机目标Y',
  '编辑器状态', '编辑器工具栏模式', '扳手规则集', '编辑器最近使用列表', '当前游戏种子', '玩家职业', '游戏开始时间', '红蓝开关状态', '绿紫开关状态', '自定义游戏设置',
  '地图标记', '最大背包容量', '最大装备槽数量', '教程阶段', '最高教程阶段', '是否为教程层', 'hud模式', '显示模式', '日志历史', '当前装备页', '已击杀怪物数',
  '玩家总移动回合数', '玩家总受到伤害', '传送点列表', '上次死亡地点', '永久Buffs', '生存挑战激活', '生存挑战备份单元格', '程序生成配方列表', '已发现的程序生成配方',
  '融合配方列表', '相机显示边长', '游戏设置', '切换动画', '开发者模式', '已初始化'];
const VIEW = GLOBALS.filter(name => name !== '怪物状态表');
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value, { GameCell: '单元格', GameDoor: '门' }));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const chance = q => r() < q;
  let p = ${seed} * 7919 % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  let serial = 0;
  function tag(v) {
    if (v && typeof v === 'object' && typeof v.message === 'string' && typeof v.stack === 'string') return ['Error', v.constructor.name, v.message];
    if (typeof v === 'symbol') return 'sym:' + v.description;
    if (v && typeof v === 'object') return 'obj:' + (v.类型 ?? v.名称 ?? Object.keys(v).length);
    return v;
  }
  globalThis.console = { log: (...a) => calls.push(['log', ...a.map(tag)]), warn: (...a) => calls.push(['warn', ...a.map(tag)]),
    error: (...a) => calls.push(['error', ...a.map(tag)]) };
  globalThis.Date = class { toISOString() { return '2026-10-10T12:34:56.789Z'; } static now() { return 1700000000000; } };
  globalThis.图标映射 = { 史莱姆: '🟢', 宝剑: '🗡' };
  globalThis.楼梯图标 = { 下楼: '⬇', 上楼: '⬆' };
  globalThis.切换楼层 = async () => undefined;
  globalThis.怪物技能池 = { a: { 名称: '冲撞' } };
  globalThis.显示通知 = (...a) => calls.push(['notify', ...a.map(tag)]);
  globalThis.deepClone = v => (Object.prototype.toString.call(v) === '[object Set]' ? new Set(v) : JSON.parse(JSON.stringify(v)));
  globalThis.重置所有游戏状态 = () => { calls.push(['reset']); 玩家仆从列表 = []; 融合配方列表 = [{ 说明: '基础' }]; 玩家 = { x: 0, y: 0, 名: '新玩家' }; };
  globalThis.初始化随机数生成器 = seedValue => calls.push(['seed', seedValue]);
  globalThis.添加日志 = (...a) => calls.push(['addLog', ...a.map(tag)]);
  globalThis.应用职业效果 = (...a) => { calls.push(['profession', ...a]); 初始玩家属性.攻击加成 = (初始玩家属性.攻击加成 || 0) + 2; };
  globalThis.击杀提示 = { 更新: u => calls.push(['killHint', u.内容]) };
  globalThis.应用永久Buffs = () => { calls.push(['buffs', 永久Buffs.已获得效果.size]); 玩家属性.buff层数 = 永久Buffs.已获得效果.size; };
  globalThis.生成地牢 = async () => { calls.push(['generate']); await null; 房间列表.push(...pick([[], [{ id: 0 }, { id: 4 }], [{ id: 2 }]])); 玩家初始位置 = { x: 3, y: 4 }; };
  globalThis.更新洞穴视野 = () => calls.push(['cave']);
  const bar = name => ({ style: {}, classList: { add: c => calls.push(['add', name, c]), remove: c => calls.push(['remove', name, c]) } });
  globalThis.bars = { '.health-bar': bar('hp'), '.power-bar': bar('mp') };
  globalThis.document = {
    querySelector: sel => (chance(0.9) ? bars[sel] : null),
    createElement: () => ({ click() { calls.push(['click', this.href, this.download]); } }),
    body: { appendChild: () => calls.push(['append']), removeChild: () => calls.push(['remove-link']) },
  };
  globalThis.Blob = class { constructor(parts, options) { calls.push(['blob', parts[0].length, options.type]); this.text = parts[0]; } };
  globalThis.URL = { createObjectURL: b => 'blob:' + b.text.length, revokeObjectURL: u => calls.push(['revoke', u]) };
  globalThis.显示主菜单 = () => calls.push(['menu']);
  globalThis.启动游戏 = d => calls.push(['start', d.当前层数, d.版本]);
  globalThis.初始化装备系统 = () => calls.push(['equip-init']);
  globalThis.初始化背包事件监听 = () => calls.push(['bag-init']);
  globalThis.动画帧 = () => calls.push(['frame']);
  class 物品 {
    constructor(c = {}) {
      this.类型 = c.类型 ?? '物品'; this.名称 = c.名称; this.图标 = c.图标 ?? '?'; this.x = c.x; this.y = c.y;
      this.唯一标识 = c.唯一标识 ?? Symbol.for('item_' + serial++);
      this.自定义数据 = c.数据 instanceof Map ? c.数据 : new Map(); this.收到配置键 = Object.keys(c);
    }
  }
  class 刷怪笼 extends 物品 {} class 武器类 extends 物品 {} class 防御装备类 extends 物品 {} class 宠物 extends 物品 {} class 神秘商人 extends 物品 {}
  class 祭坛类 extends 物品 {} class 物品祭坛 extends 祭坛类 {} class 折跃门 extends 物品 {} class 药水类 extends 物品 {}
  class 附魔卷轴 extends 物品 {} class 神秘药水 extends 药水类 {} class 隐形毒气陷阱 extends 物品 {}
  class 卷轴类 extends 物品 { 使用() { calls.push(['scroll-use', this.名称]); } }
  class 怪物 {
    constructor(c = {}) {
      this.类型 = c.类型 ?? pick(['史莱姆', '蝙蝠']); this.图标 = c.图标 ?? '?'; this.基础生命值 = c.基础生命值 || 20; this.基础攻击力 = c.基础攻击力 || 3;
      this.x = c.x; this.y = c.y; this.当前生命值 = c.当前生命值 || 40; this.攻击冷却回合剩余 = 0; this.技能池 = []; this.永久增益 = [];
      this.收到配置键 = Object.keys(c);
    }
    get 生命值() { return this.基础生命值 * 2; }
  }
  ${MONSTER_CLASSES.filter(name => name !== '怪物').map(name => `class ${name} extends 怪物 {}`).join(' ')}
  class 野怪 extends 怪物 {}
  class 状态效果 {
    constructor(...a) { calls.push(['effect', ...a.map(tag)]); if (a[6]) 怪物状态表.set(a[6], { 类型: a[0], 剩余回合: a[4] }); else 玩家状态.push({ 类型: a[0], 来源: a[5] }); }
  }
  globalThis.获取所有可用的定义 = () => ({ items: [{ 类: 武器类 }, { 类: 物品 }], monsters: [{ 类: 野怪 }, { 类: 怪物 }] });
  Object.assign(globalThis, { ${ALL.join(', ')}, 状态效果 });
  const kinds = [怪物, 骷髅仆从, 召唤师怪物, 幽灵仆从, 野怪, 王座守护者];
  const scrub = (value, seen = new Map()) => {
    if (typeof value === 'function') return 'fn:' + value.name;
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const kind = Object.prototype.toString.call(value);
    if (kind === '[object WeakMap]') return 'weakmap';
    if (kind === '[object Map]') { const m = new Map(); seen.set(value, m); for (const [k, v] of value) m.set(scrub(k, seen), scrub(v, seen)); return m; }
    if (kind === '[object Set]') { const m = new Set(); seen.set(value, m); for (const v of value) m.add(scrub(v, seen)); return m; }
    const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); seen.set(value, out);
    for (const key of Reflect.ownKeys(value)) out[key] = scrub(value[key], seen);
    return out;
  };
  const view = () => scrub({ ${VIEW.map(name => `${name}: ${name}`).join(', ')} });
  const simple = () => new (pick([物品, 武器类, 防御装备类, 药水类, 卷轴类]))({ 名称: pick(['宝剑', '药水', '卷轴']) });
  const makeFloor = layer => {
    const N = 3;
    门实例列表 = new Map();
    for (let i = Math.floor(r() * 2); i > 0; i--) new 门({ 关联房间ID: 0, 位置: { x: i, y: 0 } });
    const doorMap = 门实例列表;
    const monsters = [];
    for (let i = 1 + Math.floor(r() * 3); i > 0; i--) monsters.push(new (pick(kinds))({}));
    for (const m of monsters) {
      m.x = pick([0, 1, 2, 1]); m.y = pick([0, 1]); m.层数 = layer; m.仇恨 = pick([玩家, monsters[0], undefined]);
      if (chance(0.3)) 怪物状态表.set(m, { 类型: '中毒', 颜色: '#0f0', 图标: '☠', 持续时间: 3, 剩余回合: 2, 强度: 1 });
      if (m instanceof 骷髅仆从 && chance(0.6)) 玩家仆从列表.push(m);
    }
    const grid = [];
    for (let y = 0; y < N; y++) {
      const row = [];
      for (let x = 0; x < N; x++) {
        const c = new 单元格(x, y);
        if (chance(0.2)) c.关联物品 = simple();
        if (chance(0.15)) { c.关联怪物 = pick(monsters); c.类型 = 单元格类型.怪物; }
        row.push(c);
      }
      grid.push(row);
    }
    return { 地牢数组: grid, 房间列表: [{ id: 0, 类型: '普通房间', 门: [] }, { id: 4, 类型: '宝藏房间' }], 上锁房间列表: [], 已访问房间: new Set([0]),
      房间地图: grid.map(row => row.map(() => 0)), 门实例列表: doorMap, 所有怪物: monsters, 所有计时器: chance(0.4) ? [simple()] : [],
      玩家初始位置: { x: 1, y: 1 }, 玩家位置: { x: 2, y: 2 }, 当前天气效果: pick([[], ['雨']]), 已揭示洞穴格子: new Set(['0,0']),
      地牢生成方式: pick(['cave', 'default']), 已放置配方卷轴: chance(0.3) };
  };
  const setup = () => {
    怪物状态表 = new WeakMap(); 玩家 = { x: 2, y: 1, 名: '玩家', 朝向: pick(['上', '下']) }; 是否是自定义关卡 = chance(0.1); 玩家仆从列表 = [];
    地牢大小 = 3; 当前层数 = pick([0, 1, 1, 2, null, 7]);
    所有地牢层 = new Map(); for (const layer of [0, 1, 2]) if (chance(0.9)) 所有地牢层.set(layer, makeFloor(layer));
    const current = makeFloor(当前层数 ?? 0);
    地牢 = current.地牢数组; 房间列表 = current.房间列表; 上锁房间列表 = current.上锁房间列表; 已访问房间 = current.已访问房间; 房间地图 = current.房间地图;
    门实例列表 = current.门实例列表; 所有怪物 = current.所有怪物; 所有计时器 = current.所有计时器; 玩家初始位置 = current.玩家初始位置;
    当前天气效果 = pick([[], ['雾']]); 地牢生成方式 = current.地牢生成方式; 已揭示洞穴格子 = new Set(['1,1']);
    自定义全局设置 = { 初始生命值: pick([100, 150]), 初始背包容量: 16, 玩家属性: { 移动步数: 2 }, 全局天气: pick([[], ['雪']]) };
    const bag = [simple(), simple(), new 宠物({ 名称: '小狗' }), new 卷轴类({ 名称: '激活卷轴' })];
    if (chance(0.1)) bag.push(null);
    玩家背包 = new Map(bag.map((item, i) => [item ? item.唯一标识 : Symbol('hole' + i), item]));
    玩家装备 = new Map([[0, pick([bag[0], null])], [1, bag[1]], [2, pick([null, new 武器类({ 名称: '外来' })])]]);
    玩家状态 = [{ 类型: '力量', 颜色: '#f00', 图标: '💪', 持续时间: 5, 剩余回合: 3, 强度: 1, 来源: pick([bag[1], null, simple()]) }];
    if (chance(0.05)) 玩家状态.push({ 类型: '怪', 来源: Object.create(null) });
    if (chance(0.05)) 玩家状态.push(null);
    当前激活卷轴列表 = new Set([bag[3], ...(chance(0.3) ? [simple()] : [])]);
    当前出战宠物列表 = chance(0.5) ? [bag[2]] : [];
    if (chance(0.04)) 当前出战宠物列表.push(null);
    所有传送门 = chance(0.5) ? [simple(), bag[0]] : [];
    玩家属性 = { 当前生命值: pick([50, '30.5', undefined, 0, 20, 130, -4]), 当前能量值: pick([20, 'x', 100]), 允许移动: 1, 攻击加成: 1 };
    初始玩家属性 = { 攻击加成: 0, 移动步数: 1 };
    游戏状态 = pick(['游戏中', '游戏中', '游戏中', '地图编辑器', '图鉴', '死亡界面', '编辑器游玩', '图鉴选择']);
    当前相机X = 5; 当前相机Y = 6; 相机目标X = 0; 相机目标Y = 0;
    编辑器状态 = { 模式: '绘制', 笔刷模式: '圆', 笔刷形状: '方', 笔刷半径: 2,
      当前选中: pick([null, { 名称: '墙', 类型: '工具', 图标: '#', 绘制类型: '墙', 类: pick([武器类, undefined, 野怪]) }, new 野怪({}), new 武器类({ 名称: '剑' })]) };
    编辑器工具栏模式 = '物品'; 扳手规则集 = { '1': ['a'], '2': [], '3': [] };
    编辑器最近使用列表 = [{ 名称: '地板', 类型: '工具', 绘制类型: '地板' }, new 怪物({}), new 药水类({ 名称: '瓶' }), new 野怪({})];
    当前游戏种子 = pick(['seed-1', '', null]); 玩家职业 = pick([null, '战士']); 游戏开始时间 = pick([1600000000000, null]);
    红蓝开关状态 = pick(['红', '蓝']); 绿紫开关状态 = '绿'; 自定义游戏设置 = { 物品掉落率: 2 };
    地图标记 = new Map([['3', { 名: '宝' }], [5, '门']]); 最大背包容量 = 14; 最大装备槽数量 = 10; 教程阶段 = 2; 最高教程阶段 = 3; 是否为教程层 = chance(0.1);
    hud模式 = '精简'; 显示模式 = '背包'; 日志历史 = [{ 内容: '你好', 类型: '信息' }]; 当前装备页 = 1; 已击杀怪物数 = 9; 玩家总移动回合数 = 40; 玩家总受到伤害 = 12;
    传送点列表 = [{ x: 1, y: 1, 层: 0 }]; 上次死亡地点 = pick([null, { x: 2, y: 2, 层数: 1 }]);
    永久Buffs = { 攻击: 1, 已获得效果: pick([new Set(['a', 'b']), undefined]) };
    生存挑战激活 = chance(0.4);
    生存挑战备份单元格 = [{ x: 1, y: 0, 类型: 0, 背景类型: 1, 墙壁: { 上: true }, 关联物品: pick([bag[0], null, simple()]), 关联怪物: pick([null, 所有怪物[0], 'stray', 所有地牢层.get(当前层数)?.所有怪物[0]]),
      颜色索引: 2, 标识: pick([null, Symbol.for('wall-door')]) }];
    程序生成配方列表 = [{ 说明: '新配方' }]; 已发现的程序生成配方 = pick([[{ 说明: '基础' }, { 说明: '发现' }], []]);
    融合配方列表 = [{ 说明: '基础' }]; 相机显示边长 = 15; 游戏设置 = { 相机视野大小: 15, 受伤时击退: true }; 切换动画 = true;
    开发者模式 = chance(0.2); 已初始化 = pick([0, 1]);
  };
  globalThis.done = (async () => {
    setup();
    const text = 保存游戏状态();
    results.push(['save', text]);
    导出存档();
    results.push(['after-export', 玩家属性.允许移动]);
    let data = text ? JSON.parse(text) : pick([null, {}, { 游戏版本: 9999 }]);
    if (data && chance(0.1)) data.游戏版本 = pick([9999, 1, undefined]);
    if (data && chance(0.1)) delete data.所有地牢层数据;
    if (data && data.所有地牢层数据 && chance(0.15)) delete data.所有地牢层数据[String(data.当前层数)];
    if (data && chance(0.1)) { data.作者设置_相机视野 = 21; data.作者设置_受伤击退 = false; data.强制动画模式 = false; }
    if (data && chance(0.1)) data.自定义全局设置 = undefined;
    if (data && chance(0.1)) data.玩家 = pick([undefined, { 属性: { 当前生命值: 10 }, 当前生命值百分比: 15, 当前能量值百分比: 120 }]);
    if (data && chance(0.05)) data.UI = { 激活卷轴列表: 'x' };
    if (data && chance(0.1)) data.编辑器状态数据 = { 玩家位置: { x: 7, y: 8 }, 相机位置: { x: 1, y: 2 }, 模式: '擦除', 工具栏模式: '怪物',
      当前选中: pick([{ isVirtual: true, 名称: '墙' }, { isVirtual: false, 图鉴类型: '物品', 类名: '武器类' }, { isVirtual: false, 图鉴类型: '怪物', 类名: '野怪' },
        { isVirtual: false, 图鉴类型: '怪物', 类名: '不存在' }]), 最近使用列表: [{ isVirtual: true }, { 类名: '武器类' }, { 类名: '野怪' }, { 类名: 'Map' }] };
    if (data && chance(0.15)) data.序列化生存挑战备份单元格 = [{ x: 0, y: 0, 墙壁: null, 关联物品标识: 'nope', 关联怪物索引: pick([0, 1, null]), 标识: 'Symbol(abc)' }];
    if (data && data.所有地牢层数据 && chance(0.15)) data.所有地牢层数据.abc = Object.values(data.所有地牢层数据).find(Boolean) ?? null;
    const creative = chance(0.2);
    try { await 恢复游戏状态(data, creative); } catch (e) { results.push(['restore-threw', tag(e)]); }
    results.push(['restored', view()], ['bars', scrub(bars)]);
    const imports = [text, 'not json', JSON.stringify({ 版本: 'v1', isPublished: true }), JSON.stringify({ 版本: 'v1', 编辑器状态数据: { a: 1 } }),
      JSON.stringify({ 版本: 'v0', 编辑器状态数据: {} }), JSON.stringify({ 编辑器状态数据: {} }), JSON.stringify({ 版本: 'v1' }), 'null'];
    for (let i = 0; i < 3; i++) { 开发者模式 = chance(0.3); 已初始化 = pick([0, 2]); 导入存档(pick(imports)); }
    globalThis.final = { results, calls };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`let ${GLOBALS.join(', ')}; let prng; const 存档版本 = "v1"; const 游戏版本 = 1534;
    ${[...SOURCE_GLOBALS, ...FUNCTIONS].map(name => declaration(name)).join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  const registered = ALL.filter(name => (SOURCE_GLOBAL_CLASS_NAMES as readonly string[]).includes(name));
  new vm.Script(scenario(seed).replace('const kinds', `__setPrng(rand); globalThis.window = Object.assign(Object.create(null), { ${registered.join(', ')} }); const kinds`))
    .runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const extras: Record<keyof SaveEnvelopeSession, unknown> = { hud模式: undefined, 显示模式: undefined, 当前相机X: undefined, 当前相机Y: undefined, 相机目标X: undefined,
    相机目标Y: undefined, 相机显示边长: undefined, 切换动画: undefined, 编辑器状态: undefined, 编辑器工具栏模式: undefined, 编辑器最近使用列表: undefined,
    融合配方列表: undefined, 开发者模式: undefined, 已初始化: undefined };
  const state = Object.assign(createWorldState(), extras) as unknown as SaveEnvelopeState;
  for (const name of GLOBALS) if (!(name in state)) throw new Error(`state lacks ${name}`);
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const call = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => unknown>(name)(...args);
  const registry = new SourceClassRegistry();
  const log = (kind: 'log' | 'warn' | 'error') => (...args: unknown[]) => g<Record<string, (...a: unknown[]) => void>>('console')[kind]!(...args);
  const now = () => g<{ now(): number }>('Date').now();
  const isoNow = () => new (g<new () => { toISOString(): string }>('Date'))().toISOString();
  const random = () => g<() => number>('__rand')();
  const createStatusEffect = (...args: unknown[]) => new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args);
  const items = createItemCellCodec(state, { classes: registry, icons: () => g('图标映射'), stairIcons: () => g('楼梯图标'),
    switchFloor: () => undefined, now, warn: log('warn'), error: log('error') });
  const monsters = createMonsterCodec(state, { classes: registry, random, icons: () => g('图标映射'), skillPool: () => g('怪物技能池'),
    createStatusEffect, warn: log('warn'), error: log('error') }, items);
  const floors = createFloorCodec(state, { classes: registry, createStatusEffect, log: log('log'), warn: log('warn'), error: log('error') }, items, monsters);
  const envelope = createSaveEnvelope(state, {
    classes: registry, log: log('log'), warn: log('warn'), error: log('error'), notify: call('显示通知') as never,
    deepClone: call('deepClone') as never, now, isoNow, resetAll: call('重置所有游戏状态'), initRandom: call('初始化随机数生成器'), addLog: call('添加日志'),
    applyProfession: call('应用职业效果'), updateKillHint: update => g<{ 更新(u: unknown): void }>('击杀提示').更新(update), createStatusEffect,
    applyPermanentBuffs: call('应用永久Buffs'), generateDungeon: call('生成地牢'), updateCaveVision: call('更新洞穴视野'),
    querySelector: selector => g<{ querySelector(s: string): unknown }>('document').querySelector(selector), definitions: call('获取所有可用的定义') as never,
    showMainMenu: call('显示主菜单'),
    createDownloadUrl: text => { const Blob = g<new (p: unknown[], o: unknown) => unknown>('Blob'); return g<{ createObjectURL(b: unknown): unknown }>('URL').createObjectURL(new Blob([text], { type: 'application/json' })); },
    clickDownload: (url, fileName) => {
      const doc = g<{ createElement(t: string): Record<string, unknown> & { click(): void }; body: { appendChild(e: unknown): void; removeChild(e: unknown): void } }>('document');
      const link = doc.createElement('a'); link.href = url; link.download = fileName; doc.body.appendChild(link); link.click(); doc.body.removeChild(link);
    },
    revokeUrl: url => g<{ revokeObjectURL(u: unknown): void }>('URL').revokeObjectURL(url),
    startGame: call('启动游戏'), initEquipment: call('初始化装备系统'), initInventoryListeners: call('初始化背包事件监听'), animationFrame: call('动画帧'),
  }, items, floors);
  const 门 = registry.defineWithPorts('门', GameDoor, { now, random, get doors() { return state.门实例列表 as Map<symbol, GameDoor>; } });
  const defineAll = () => {
    for (const name of ALL.filter(name => name !== '野怪')) {
      const Kind = g<new (...a: unknown[]) => object>(name);
      registry.define(name, Kind, (...args) => new Kind(...args));
    }
  };
  Object.assign(context, items, monsters, floors, envelope, { 单元格: GameCell, 单元格类型, 环境类型, 门, __defineAll: defineAll });
  new vm.Script(`with (S) { ${scenario(seed).replace('const kinds', 'globalThis.__rand = rand; __defineAll(); const kinds')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('main save envelope (保存游戏状态, 恢复游戏状态, 导出存档, 导入存档)', () => {
  it('matches the source over 200 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 200; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const [kind, value] of source.results as [string, unknown][]) bump(kind === 'save' ? (value === null ? 'save-null' : 'save-ok') : kind);
      for (const c of source.calls as unknown[][]) bump(`${c[0]}:${String(c[1]).slice(0, 12)}`);
    }
    const count = (prefix: string) => Object.entries(tally).filter(([k]) => k.startsWith(prefix)).reduce((sum, [, n]) => sum + n, 0);
    for (const key of ['save-ok', 'save-null', 'restore-threw', 'reset', 'seed', 'profession', 'killHint', 'effect', 'buffs', 'generate', 'cave', 'scroll-use',
      'menu', 'start', 'equip-init', 'blob', 'click', 'revoke', 'add:hp', 'remove:hp', 'notify:存档版本 (9', 'notify:不支持在教程', 'notify:不支持在图鉴',
      'notify:不支持在创意', 'notify:不支持在地图', 'notify:存档已导出', 'notify:无法通过此按钮加载已', 'notify:无法通过此按钮加载地', 'notify:存档版本不匹',
      'notify:存档数据无效', 'notify:导入存档失败', 'notify:加载存档时发', 'notify:打包游戏状态', 'warn:存档中未找到当', 'error:恢复游戏状态时', 'log:游戏状态恢复完'])
      expect(count(key), key).toBeGreaterThan(2);
  }, 900_000);
});
