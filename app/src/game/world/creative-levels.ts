import { 游戏版本 } from './constants';
import { sloppySet, type CreativeExportPorts } from './creative-export';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Page-level globals used by the creative-level flows. */
export interface CreativeLevelSession {
  编辑器状态备份: unknown; // JSON snapshot of the editor map taken before test play
}

export interface CreativeLevelPorts extends Pick<CreativeExportPorts, 'createDownloadUrl' | 'isoNow' | 'clickDownload' | 'revokeUrl' | 'animationMode'> {
  notify(message: string, type: string, flag?: boolean, duration?: number): void; // 显示通知
  prompt(message: string, defaultValue: string): string | null;
  sign(dataString: string): PromiseLike<string> | string; // 生成签名 (world/utils.ts)
  cameraSide(): unknown; // 相机显示边长
  prng(): number; // prng
  startGame(saveData: unknown, creative: true): void; // 启动游戏 (audit t10-tutorial-professions-audit)
  showMainMenu(): void; // 显示主菜单 (audit t10-menus-inventory-ui-audit)
  logError(message: unknown, error?: unknown): void; // console.error
  supabaseAvailable(): unknown; // `supabase` (client may be missing offline)
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ error: unknown }>; // supabase.rpc
  fetch(url: unknown): PromiseLike<{ ok: unknown; statusText: unknown; text(): PromiseLike<string> | string }>;
  hideElement(id: string): void; // document.getElementById(id).style.display = 'none'
  confirmDialog(messageHtml: string, onConfirm: () => void): void; // 显示自定义确认对话框
  closeSettingsMenu(): void; // 关闭设置菜单
  setTimeout(callback: () => void, ms: number): void;
}

/**
 * Source `导入创意关卡(存档字符串)` (HTML L55556): load a published creative level file. Rejects unpublished, unsigned or
 * tampered files (signature recomputed over the data without `signature`) and files from a newer game version, burns
 * a random number of `prng` draws, then starts the game and remembers the raw string for restarts.
 */
export async function importCreativeLevel(state: WorldState, ports: CreativeLevelPorts, saveString: string): Promise<boolean> {
  const S = state as Loose;
  try {
    const data = JSON.parse(saveString);
    if (!data.isPublished) {
      ports.notify('这不是一个已发布的创意关卡文件！', '错误');
      return false;
    }

    const receivedSignature = data.signature;
    if (!receivedSignature) {
      ports.notify('加载失败：关卡文件缺少签名，可能已损坏或来自旧版本。', '错误');
      return false;
    }

    delete data.signature;
    const toVerify = JSON.stringify(data);
    const expectedSignature = await ports.sign(toVerify);

    if (receivedSignature !== expectedSignature) {
      ports.notify('加载失败：关卡文件已被篡改或已损坏！', '错误');
      return false;
    }

    if (data.游戏版本 && data.游戏版本 > 游戏版本) {
      ports.notify(`存档版本 (${data.游戏版本}) 高于当前游戏版本 (${游戏版本})，无法加载！`, '错误');
      ports.showMainMenu();
      return false;
    }
    for (let i = 0; i < Math.ceil(ports.prng() * 10); i++) ports.prng();
    ports.startGame(data, true);
    S.当前关卡存档数据字符串 = saveString;
    if (data.关卡标题) ports.notify(`欢迎来到：${data.关卡标题}`, '信息', true, 4000);
    return true;
  } catch (error) {
    ports.logError('加载创意关卡时出错:', error);
    ports.notify('加载创意关卡失败，文件格式错误或数据损坏。', '错误');
    return false;
  }
}

/**
 * Source `发布关卡()` (HTML L55618): publish the editor map (from the test-play backup) as a signed creative level
 * download. The player is reset to the start position with movement locked (`允许移动 = 0`), author settings (camera
 * size, knockback, animation mode) are embedded and editor-only data is stripped.
 */
export async function publishLevel(state: WorldState, session: CreativeLevelSession, ports: CreativeLevelPorts): Promise<void> {
  const S = state as Loose;
  if (!session.编辑器状态备份) {
    ports.notify('找不到原始地图状态，发布失败！', '错误');
    return;
  }

  const title = ports.prompt('请输入关卡标题：', '我的创意关卡');
  if (title === null || title.trim() === '') {
    ports.notify('已取消发布。', '信息');
    return;
  }

  try {
    const mapData = JSON.parse(session.编辑器状态备份 as string);
    sloppySet(mapData.玩家.属性, '允许移动', 0);
    sloppySet(mapData.玩家, 'x', S.玩家初始位置.x);
    sloppySet(mapData.玩家, 'y', S.玩家初始位置.y);
    sloppySet(mapData, '关卡标题', title);
    sloppySet(mapData, 'isPublished', true);
    sloppySet(mapData, '强制动画模式', ports.animationMode());
    sloppySet(mapData, '作者设置_相机视野', ports.cameraSide());
    sloppySet(mapData, '作者设置_受伤击退', S.游戏设置.受伤时击退);
    delete mapData.编辑器状态数据;
    delete mapData.配方信息;

    delete mapData.signature;
    const dataString = JSON.stringify(mapData);
    sloppySet(mapData, 'signature', await ports.sign(dataString));

    const finalText = JSON.stringify(mapData);
    const url = ports.createDownloadUrl(finalText);
    const timestamp = ports.isoNow().replace(/[:.]/g, '-');
    ports.clickDownload(url, `${title}_${timestamp}.json`);
    ports.revokeUrl(url);
    ports.notify('关卡已成功发布!', '成功');
  } catch (e) {
    ports.notify('发布关卡时发生错误！', '错误');
    ports.logError(e);
  }
}

/**
 * Source `游玩创意关卡(url, level_id)` (HTML L56128): play an online creative level. Increments the play count (errors
 * only logged), uses the detail-view cache when its id loosely equals `level_id`, otherwise downloads the file, hides
 * the browser UI and imports it. Failures notify and clear `当前关卡ID`.
 */
export async function playCreativeLevel(state: WorldState, ports: CreativeLevelPorts, url: unknown, levelId: unknown): Promise<void> {
  const S = state as Loose;
  try {
    ports.notify('正在加载关卡...', '信息', true);
    S.当前关卡ID = levelId;

    if (ports.supabaseAvailable() && levelId) {
      const { error } = await ports.rpc('increment_play_count', { level_id_to_increment: levelId });
      if (error) ports.logError('增加游玩次数失败:', error);
    }

    let levelDataString;
    // eslint-disable-next-line eqeqeq
    if (S.当前加载的关卡数据缓存 && S.当前加载的关卡数据缓存.id == levelId) {
      levelDataString = S.当前加载的关卡数据缓存.data;
    } else {
      const response = await ports.fetch(url);
      if (!response.ok) throw new Error(`网络响应错误: ${response.statusText}`);
      levelDataString = await response.text();
    }

    ports.hideElement('关卡详情界面');
    ports.hideElement('创意关卡浏览器');
    await importCreativeLevel(state, ports, levelDataString);
  } catch (error) {
    ports.logError('加载创意关卡失败:', error);
    ports.notify('加载创意关卡失败: ' + (error as Loose).message, '错误');
    S.当前关卡ID = null;
  }
}

/** Source `重置创意关卡()` (HTML L55600): after confirmation, close the menu and restart the creative level 310 ms later. */
export function resetCreativeLevel(state: WorldState, ports: CreativeLevelPorts): void {
  const S = state as Loose;
  if (!S.是否是自定义关卡) return;
  if (!S.当前关卡存档数据字符串) {
    ports.notify('无法重置：未找到关卡数据！', '错误');
    return;
  }

  ports.confirmDialog('你确定要重新开始当前关卡吗？<br>所有进度都将被重置。', () => {
    ports.closeSettingsMenu();
    ports.setTimeout(() => {
      ports.startGame(JSON.parse(S.当前关卡存档数据字符串), true);
    }, 310);
  });
}
