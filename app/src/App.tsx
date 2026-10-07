import { useState } from 'react';
import { generateDistanceMap, type Cell, type Dungeon, type Position } from './domain/distance-map';

const SIZE = 7;
const initialStart = { x: 1, y: 3 };
const tools = [
  ['start', '移动起点'], ['wall', '墙壁'], ['locked-door', '上锁的门'],
  ['obsidian', '黑曜石'], ['switch-brick', '阻挡开关砖'], ['erase', '清除障碍'],
] as const;
type Tool = typeof tools[number][0];

function initialMap(): Dungeon {
  return Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x): Cell => ({
    terrain: x === 3 && y !== 5 ? 'wall' : 'room', walls: {},
  })));
}
function cellDescription(cell: Cell): string {
  if (cell.terrain === 'wall') return '墙壁';
  if (cell.terrain === 'locked-door') return '上锁的门';
  if (cell.item?.kind === 'obsidian') return '黑曜石';
  if (cell.item?.kind === 'switch-brick') return '阻挡开关砖';
  return '地面';
}

export function App() {
  const [dungeon, setDungeon] = useState<Dungeon>(initialMap);
  const [start, setStart] = useState<Position>(initialStart);
  const [tool, setTool] = useState<Tool>('start');
  const distances = generateDistanceMap(dungeon, start);
  const reachable = distances.flat().filter(Number.isFinite).length;

  function edit(x: number, y: number) {
    if (tool === 'start') {
      setStart({ x, y });
      return;
    }
    const cell: Cell = {
      terrain: tool === 'wall' || tool === 'locked-door' ? tool : 'room',
      walls: {},
      item: tool === 'obsidian' || tool === 'switch-brick' ? { kind: tool, blocksMonsters: true } : null,
    };
    setDungeon(current => current.map((row, rowIndex) => rowIndex !== y ? row
      : row.map((previous, columnIndex) => columnIndex === x ? cell : previous)));
  }

  return (
    <main>
      <header className="masthead">
        <a className="brand" href="#main">重铸<span>CHINESE DUNGEON</span></a>
        <span className="badge">UNIT 01 · 逻辑实验</span>
      </header>
      <section id="main" className="intro">
        <p className="eyebrow">REFORGED / BEHAVIOR FIRST</p>
        <h1>每一步，都有迹可循。</h1>
        <p>从原版的一个函数开始，逐步重写地牢。这里展示四方向路径距离，<strong>不是完整游戏</strong>。</p>
      </section>
      <div className="workspace">
        <section className="map-panel" aria-labelledby="map-title">
          <div className="panel-heading"><div><p className="eyebrow">DISTANCE FIELD</p><h2 id="map-title">玩家距离图</h2></div><span className="size-label">7 × 7</span></div>
          <div className="map" role="group" aria-label="可编辑的七乘七距离图">
            {dungeon.map((row, y) => row.map((cell, x) => {
              const distance = distances[y]![x]!;
              const isStart = x === start.x && y === start.y;
              const blocked = cell.terrain === 'wall' || cell.terrain === 'locked-door' || Boolean(cell.item);
              const symbol = cell.terrain === 'wall' ? '■' : cell.terrain === 'locked-door' ? '门'
                : cell.item?.kind === 'obsidian' ? '◆' : cell.item ? '▣' : Number.isFinite(distance) ? distance : '∞';
              return <button key={`${x},${y}`} type="button"
                className={`cell ${blocked ? 'blocked' : ''} ${isStart ? 'player' : ''}`}
                aria-label={`第${y + 1}行第${x + 1}列，${cellDescription(cell)}，${isStart ? '起点，' : ''}距离${Number.isFinite(distance) ? distance : '不可达'}`}
                onClick={() => edit(x, y)}>{isStart ? '你' : symbol}</button>;
            }))}
          </div>
          <div className="map-caption"><span><i /> 起点</span><span>数字 = 最短步数</span><span>∞ = 不可达</span></div>
          <p className="live-status" role="status">起点 ({start.x}, {start.y}) · 可达 {reachable} / {SIZE * SIZE} 格</p>
        </section>
        <aside className="controls" aria-labelledby="tools-title">
          <p className="eyebrow">TRY THE RULES</p><h2 id="tools-title">改变地图，观察路径。</h2>
          <p>选择工具，然后点击格子。也可用 Tab 切换格子，按 Enter 或空格操作。</p>
          <div className="tools" role="group" aria-label="地图编辑工具">
            {tools.map(([value, label]) => <button type="button" key={value} aria-pressed={tool === value}
              onClick={() => setTool(value)}>{label}</button>)}
          </div>
          <button className="reset" type="button" onClick={() => { setDungeon(initialMap()); setStart(initialStart); setTool('start'); }}>↺ 重置示例</button>
          <div className="note"><h3>保留原版规则</h3><ul>
            <li>只能向上、下、左、右移动。</li><li>墙壁、锁门和特定物品阻挡路径。</li>
            <li>最远记录到 100 步；不可达使用 Infinity。</li><li>起点即使位于障碍上，仍从 0 开始计算。</li>
          </ul></div>
        </aside>
      </div>
      <footer><span>参考版本 <code>8d80b5a4</code> · 候选迁移单元，待人工审核</span>
        <span>基于 SUSTechHSAS / Chinese Dungeon · <a href="/LICENSE.txt">GPL-3.0</a> · 无担保</span></footer>
    </main>
  );
}
