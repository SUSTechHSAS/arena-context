import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CreativeExportPorts {
  notify(message: string, type: string): void; // 显示通知
  prompt(message: string, defaultValue: string): string | null;
  saveGameState(): unknown; // 保存游戏状态 (audit t10-save-envelope-audit)
  sign(dataString: string): PromiseLike<string> | string; // 生成签名 (world/utils.ts)
  animationMode(): unknown; // 切换动画 (UI setting)
  /** `URL.createObjectURL(new Blob([text], { type: 'application/json' }))` plus creating the `<a>` with that href. */
  createDownloadUrl(text: string): unknown;
  isoNow(): string; // new Date().toISOString()
  /** Set `download`, append the link, click it, remove it. */
  clickDownload(url: unknown, fileName: string): void;
  revokeUrl(url: unknown): void; // URL.revokeObjectURL
  logError(error: unknown): void; // console.error
}

/** Sloppy-mode property write: throws on null/undefined, silently ignored on other primitives (source is not strict). */
function sloppySet(target: Loose, key: string, value: unknown): void {
  // null/undefined fall through to the native TypeError, exactly as the sloppy-mode source throws.
  if (target == null || typeof target === 'object' || typeof target === 'function') target[key] = value;
}

/**
 * Source `导出当前状态为创意关卡()` (HTML L52808): developer-only export of the live editor-play state as a signed,
 * published creative level JSON download. Editor state data and recipe info are stripped and the signature is
 * recomputed over the remaining data (signature removed first so it ends up as the last key).
 */
export async function exportCurrentStateAsCreativeLevel(state: WorldState, ports: CreativeExportPorts): Promise<void> {
  const S = state as Loose;
  if (S.游戏状态 !== '编辑器游玩' || !S.开发者模式) {
    ports.notify('此功能仅在开发者模式下的编辑器游玩中使用。', '错误');
    return;
  }

  const title = ports.prompt('请输入关卡标题：', '我的实时状态关卡');
  if (title === null || title.trim() === '') {
    ports.notify('已取消发布。', '信息');
    return;
  }

  try {
    const liveState = ports.saveGameState();
    if (!liveState) throw new Error('无法获取当前游戏状态。');

    const mapData = JSON.parse(liveState as string);
    sloppySet(mapData, '关卡标题', title);
    sloppySet(mapData, 'isPublished', true);
    sloppySet(mapData, '强制动画模式', ports.animationMode());
    delete mapData.编辑器状态数据;
    delete mapData.配方信息;

    delete mapData.signature;
    const dataString = JSON.stringify(mapData);
    sloppySet(mapData, 'signature', await ports.sign(dataString));

    const finalText = JSON.stringify(mapData);
    const url = ports.createDownloadUrl(finalText);
    const timestamp = ports.isoNow().replace(/[:.]/g, '-');
    ports.clickDownload(url, `[DEV]${title}_${timestamp}.json`);
    ports.revokeUrl(url);
    ports.notify('当前状态已作为创意关卡导出!', '成功');
  } catch (e) {
    ports.notify('导出当前状态时发生错误！', '错误');
    ports.logError(e);
  }
}
