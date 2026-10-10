import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DeathPoint { x: number; y: number }
export interface DeathMarker { x: number; y: number; startTime: number }
export interface DeathRow { level_id: unknown; x: number; y: number }

export interface CreativeDeathPorts {
  /** `supabase.from('death_locations').select('x, y').eq('level_id', levelId)` */
  selectDeathLocations(levelId: unknown): PromiseLike<{ data: DeathPoint[] | null; error: unknown }>;
  /** `supabase.from('death_locations').insert(rows)` */
  insertDeathLocations(rows: DeathRow[]): PromiseLike<{ error: unknown }>;
  /** Current viewport (视口偏移X, 视口偏移Y, 相机显示边长), read after the fetch resolves. */
  viewport(): { offsetX: number; offsetY: number; side: number };
  setDeathDisplay(active: boolean): void; // document.body.classList add/remove 'death-display-active'
  setDeathMarkers(markers: DeathMarker[]): void; // 待绘制死亡标记 = …
  now(): number; // Date.now
  random(): number; // Math.random
  requestAnimationFrame(callback: () => void): void;
  draw(): void; // 绘制
  showDeathScreen(reason: unknown): void; // 显示死亡界面
  logError(message: string, error: unknown): void; // console.error
}

/**
 * Source `处理创意关卡死亡事件(死亡原因)` (HTML L40857): on death in an online creative level, fetch the level's recorded
 * death locations, upload the player's own position (fire-and-forget), and if any recorded death lies in the current
 * viewport show them as markers for 2.5 s before the death screen. Any failure falls back to uploading and showing the
 * death screen immediately. Each path decrements `玩家属性.允许移动` once before `显示死亡界面`.
 */
export async function handleCreativeLevelDeath(state: WorldState, ports: CreativeDeathPorts, reason: unknown): Promise<void> {
  const S = state as Loose;
  try {
    const { data, error } = await ports.selectDeathLocations(S.当前关卡ID);
    if (error) throw error;

    const view = ports.viewport();
    const left = view.offsetX;
    const top = view.offsetY;
    const right = view.offsetX + view.side;
    const bottom = view.offsetY + view.side;

    const visible = data!.filter((p) => p.x >= left && p.x < right && p.y >= top && p.y < bottom);

    ports.insertDeathLocations([{ level_id: S.当前关卡ID, x: S.玩家.x, y: S.玩家.y }]).then(({ error }) => {
      if (error) ports.logError('上传死亡位置失败:', error);
    });

    if (visible.length > 0) {
      ports.setDeathDisplay(true);
      ports.setDeathMarkers(visible.map((p) => ({ x: p.x, y: p.y, startTime: ports.now() + ports.random() * 300 })));

      const animationStart = ports.now();
      const animationDuration = 2500;

      const loop = (): void => {
        const elapsed = ports.now() - animationStart;
        if (elapsed < animationDuration) {
          ports.draw();
          ports.requestAnimationFrame(loop);
        } else {
          ports.setDeathMarkers([]);
          ports.setDeathDisplay(false);
          S.玩家属性.允许移动--;
          ports.showDeathScreen(reason);
        }
      };

      ports.requestAnimationFrame(loop);
    } else {
      S.玩家属性.允许移动--;
      ports.showDeathScreen(reason);
    }
  } catch (e) {
    ports.logError('处理创意关卡死亡事件时出错:', e);
    ports.insertDeathLocations([{ level_id: S.当前关卡ID, x: S.玩家.x, y: S.玩家.y }]).then();
    S.玩家属性.允许移动--;
    ports.showDeathScreen(reason);
  }
}
