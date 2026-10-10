/** TEST ONLY. Recorded upstream fixes applied to exact source declarations (owner rule 2026-10-10).
 *
 * Each patch is a literal find/replace on one ChineseDungeon.html top-level declaration and must match
 * exactly once. The differential oracle therefore runs "source + these recorded patches" and nothing else.
 * Every patch is listed as **Fixed (primary decision)** in docs/task-10/DEVIATIONS.md under its SRC id.
 */
export interface SourceEdit { find: string; replace: string }
export interface SourcePatch { id: string; declaration: string; edits: readonly SourceEdit[]; reason: string }

export const SOURCE_PATCHES: readonly SourcePatch[] = [
  {
    id: 'SRC-03', declaration: '更新光源地图',
    reason: 'a light timer at column x = 0 is a valid position, not a missing one',
    edits: [{ find: '&& 计时器?.x) {', replace: '&& 计时器?.x != null) {' }],
  },
  {
    id: 'SRC-11', declaration: '处理回合逻辑',
    reason: 'the health bar low-value warning must follow health (copy-paste of the power-bar test)',
    edits: [{ find: 'if (玩家属性.当前能量值 <= 20) healthBar.classList.add', replace: 'if (玩家属性.当前生命值 <= 20) healthBar.classList.add' }],
  },
  {
    id: 'SRC-18', declaration: '处理上锁的门',
    reason: 'null room-list entries (left by removed rooms) must be skipped instead of throwing',
    edits: [
      { find: '(房间) =>\n\t\t\t            房间.门.length > 0 &&', replace: '(房间) =>\n\t\t\t            房间 && 房间.门.length > 0 &&' },
      { find: '房间列表.find((r) => r.id === 房间.id)', replace: '房间列表.find((r) => r && r.id === 房间.id)' },
    ],
  },
  {
    id: 'SRC-20', declaration: '检查解谜是否成功',
    reason: 'look the room up by id with index fallback (as 获取当前玩家棋盘房间 does) and tolerate a missing room',
    edits: [
      { find: 'const 当前房间 = 房间列表[当前房间ID];', replace: 'const 当前房间 = 房间列表.find((r) => r && r.id === 当前房间ID) || 房间列表[当前房间ID];' },
      { find: 'if (当前房间.类型 !== "隐藏解谜棋盘") return false;', replace: 'if (!当前房间 || 当前房间.类型 !== "隐藏解谜棋盘") return false;' },
    ],
  },
  {
    id: 'SRC-24a', declaration: '引爆烟雾网络',
    reason: 'a missing dungeon row must be treated like a missing cell',
    edits: [{ find: '地牢[ny][nx]?.关联物品', replace: '地牢[ny]?.[nx]?.关联物品' }],
  },
  {
    id: 'SRC-24b', declaration: '引燃烟雾网络',
    reason: 'a missing dungeon row must be treated like a missing cell',
    edits: [{ find: '地牢[ny][nx]?.关联物品', replace: '地牢[ny]?.[nx]?.关联物品' }],
  },
  {
    id: 'SRC-27', declaration: '检查Q字形彩蛋',
    reason: 'an undefined 关联物品 is an empty cell, not an occupied one that throws',
    edits: [{ find: '单元格.关联物品 !== null && 单元格.关联物品.能否拾起', replace: '单元格.关联物品 != null && 单元格.关联物品.能否拾起' }],
  },
  {
    id: 'SRC-30', declaration: '净化HTML',
    reason: 'the escape regex matches & " \' but the map lacked them, producing the text "undefined"',
    edits: [{ find: "'>': '&gt;',", replace: "'>': '&gt;', '&': '&amp;', '\"': '&quot;', \"'\": '&#39;'," }],
  },
  {
    id: 'SRC-31a', declaration: '添加到融合区',
    reason: 'the online emit ran before the null check and threw for a missing item',
    edits: [{ find: "socket.emit('playerAction', { type: 'fuseAdd'", replace: "if (物品实例) socket.emit('playerAction', { type: 'fuseAdd'" }],
  },
  {
    id: 'SRC-31b', declaration: '从融合区移除',
    reason: 'an out-of-range slot index (undefined) must be skipped like an empty slot',
    edits: [{ find: 'if (物品实例 === null) return;', replace: 'if (物品实例 == null) return;' }],
  },
];

function occurrences(text: string, find: string) {
  let count = 0;
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + find.length)) count++;
  return count;
}

/** Applies every recorded patch for `name`; throws unless each edit matches exactly once. */
export function applySourcePatches(name: string, original: string, only?: readonly string[]): string {
  let text = original;
  for (const patch of SOURCE_PATCHES) {
    if (patch.declaration !== name || (only && !only.includes(patch.id))) continue;
    for (const edit of patch.edits) {
      const count = occurrences(text, edit.find);
      if (count !== 1) throw new Error(`${patch.id}: expected exactly one match in ${name}, found ${count}`);
      text = text.replace(edit.find, () => edit.replace);
    }
  }
  return text;
}
