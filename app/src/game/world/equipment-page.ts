import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface EquipmentPagePorts {
  isOnline(): boolean; // 联机模式
  emit(event: string, payload: unknown): void; // socket.emit
  refreshEquipment(): void; // 更新装备显示
  /** `document.querySelector('.装备栏')`. */
  equipmentBar(): { style: Record<string, string> } | null;
  schedule(callback: () => void, ms: number): void; // setTimeout
}

/**
 * Source `切换装备页(方向)` (HTML L50289): moves the equipment page, clamped to the pages the backpack capacity can fill
 * (and below 最大装备页). Online play also sends the action, but the local page still changes (client prediction).
 */
export function switchEquipmentPage(state: WorldState, ports: EquipmentPagePorts, direction: Loose): void {
  const S = state as Loose;
  if (ports.isOnline()) ports.emit('playerAction', { type: 'switchPage', dir: direction });
  const oldPage = S.当前装备页;
  S.当前装备页 += direction;
  const highestSlot = S.最大背包容量;
  const maxPage = Math.min(S.最大装备页 - 1, Math.max(0, Math.ceil(highestSlot / S.装备栏每页装备数) - 1));
  S.当前装备页 = Math.max(0, Math.min(S.当前装备页, maxPage));
  if (S.当前装备页 !== oldPage) {
    ports.refreshEquipment();
    const bar = ports.equipmentBar();
    if (bar) {
      bar.style.transition = 'transform 0.1s ease-out';
      bar.style.transform = `translateX(${direction > 0 ? '-' : ''}5px)`;
      ports.schedule(() => { bar.style.transform = ''; }, 100);
    }
  }
}
