import { 单元格类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type TemplateClass = '寻宝戒指' | '隐形虫洞陷阱' | '召唤怪物陷阱' | '钥匙' | '神秘商人' | '探险家';

export interface EditorTemplatePorts {
  prompt(message: string, defaultValue: string): string | null;
  confirm(message: string): boolean;
  notify(message: string, type: string): void; // 显示通知
  saveEditorState(): void; // 保存编辑器状态 (packet t10-editor-history)
  resetAll(): void; // 重置所有游戏状态 (world/reset.ts)
  generateMaze(): void; // 生成迷宫关卡 (audit t10-special-floors-audit)
  generateLibrary(): void; // 生成法师图书馆
  generateFinalBoss(): void; // 生成最终首领楼层
  generateDungeon(editorTemplate: true): unknown; // 生成地牢 (awaited)
  isA(item: unknown, className: TemplateClass): boolean;
  createFlag(): unknown; // new 旗帜()
  placeItemAtCell(item: unknown, x: number, y: number): void; // 放置物品到单元格
  syncRoomState(): void; // 处理房间状态
  refreshQuickBar(): void; // 更新编辑器快速访问栏
  fillEditorBackpack(): void; // 填充编辑器背包
  drawMinimap(): void; // 绘制小地图
  updateViewport(): void; // 更新视口
}

/**
 * Source `generateDungeonTemplate()` (HTML L56897): asks for a floor number, generates that floor as in play (special
 * generators on floors 5/10/15, otherwise `await 生成地牢(true)`), then turns it into an editor template: the start room
 * is explored, stairs are removed (a victory flag replaces the down stairs), hidden wormholes are removed, rings and keys
 * get floor -1, summon traps / merchants / explorers are re-tied to the floor, and the editor state is restored and saved.
 */
export async function generateDungeonTemplate(state: WorldState, ports: EditorTemplatePorts): Promise<void> {
  const S = state as Loose;
  const levelInput = ports.prompt('请输入要生成的模板地牢层数 (例如: 3):', '3');
  if (levelInput === null) return;
  const levelNumber = parseInt(levelInput);
  if (isNaN(levelNumber) || levelNumber < 0) {
    ports.notify('请输入一个有效的非负整数层数！', '错误');
    return;
  }
  if (!ports.confirm(`确定要生成第 ${levelNumber} 层的模板吗？这将覆盖当前编辑器中的所有内容。`)) return;

  ports.saveEditorState();
  ports.resetAll();
  S.游戏状态 = '游戏中';
  S.当前层数 = levelNumber;
  if (S.当前层数 === 5) ports.generateMaze();
  else if (S.当前层数 === 10) ports.generateLibrary();
  else if (S.当前层数 === 15) ports.generateFinalBoss();
  else await ports.generateDungeon(true);

  const startRoom = S.房间列表.find((r: Loose) => r.id === 0);
  if (startRoom) startRoom.已探索 = true;

  let flagPosition: { x: number; y: number } | null = null;
  for (let y = 0; y < S.地牢大小; y++) {
    for (let x = 0; x < S.地牢大小; x++) {
      const cell = S.地牢[y][x];
      if (cell.关联物品 && (cell.类型 === 单元格类型.楼梯下楼 || cell.类型 === 单元格类型.楼梯上楼)) {
        if (cell.类型 === 单元格类型.楼梯下楼) flagPosition = { x, y };
        cell.关联物品 = null;
        cell.类型 = null;
      } else if (ports.isA(cell.关联物品, '寻宝戒指')) {
        cell.关联物品.自定义数据.set('生效层数', -1);
      } else if (ports.isA(cell.关联物品, '隐形虫洞陷阱')) {
        cell.关联物品 = null;
        cell.类型 = null;
      } else if (ports.isA(cell.关联物品, '召唤怪物陷阱')) {
        cell.关联物品.自定义数据.set('怪物层级', S.当前层数);
      } else if (ports.isA(cell.关联物品, '钥匙')) {
        cell.关联物品.自定义数据.set('地牢层数', -1);
      } else if (ports.isA(cell.关联物品, '神秘商人')) {
        cell.关联物品.自定义数据.set('商品层数', S.当前层数);
        cell.关联物品.生成库存(Math.max(cell.关联物品.自定义数据.get('商品层数'), 0));
      } else if (ports.isA(cell.关联物品, '探险家')) {
        cell.关联物品.自定义数据.set('需求层数', S.当前层数);
        cell.关联物品.生成收购需求(cell.关联物品.自定义数据.get('需求层数'));
      }
    }
  }
  if (flagPosition) ports.placeItemAtCell(ports.createFlag(), flagPosition.x, flagPosition.y);

  S.游戏状态 = '地图编辑器';
  S.当前层数 = -1;
  ports.syncRoomState();
  ports.refreshQuickBar();
  ports.fillEditorBackpack();
  ports.drawMinimap();
  ports.updateViewport();
  ports.saveEditorState();
  ports.notify(`已生成第 ${levelNumber} 层地牢模板。`, '成功');
}
