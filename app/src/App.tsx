import { useState } from 'react';
import { DungeonRandom } from './domain/random';

export function App() {
  const [seed, setSeed] = useState('中文地牢');
  const [draws, setDraws] = useState<number[]>([]);
  const [randomState, setRandomState] = useState<number | null>(null);
  function previewSeed() {
    const stream = new DungeonRandom(seed);
    setDraws(Array.from({ length: 8 }, () => stream.next()));
    setRandomState(stream.state);
  }
  return <main className="app-shell">
    <header className="masthead"><a className="brand" href="/" aria-label="中文地牢首页"><span className="brand-mark">地</span><span>中文地牢<small>REFORGED · CONSISTENCY FIRST</small></span></a><span className="build-label">未完成候选 · #10</span></header>
    <section className="hero"><p className="eyebrow">从原始行为，重新锻造</p><h1>每一次探索，<br /><em>都应有迹可循。</em></h1><p className="hero-copy">React 与 TypeScript 的独立重写，保留原作的随机序列和逻辑边界。完整游戏仍在迁移；当前页面是可验证的引擎实验室。</p></section>
    <section className="panel" aria-labelledby="seed-title"><div className="panel-heading"><span className="section-index">01 / ENGINE LAB</span><h2 id="seed-title">种子序列实验室</h2><p>与固定版本原作逐项比较输出及内部状态，不改变随机抽取顺序。</p></div><form className="seed-form" onSubmit={event => { event.preventDefault(); previewSeed(); }}><label htmlFor="seed">世界种子</label><div className="input-row"><input id="seed" value={seed} onChange={event => setSeed(event.target.value)} /><button type="submit">生成序列 <span aria-hidden="true">↗</span></button></div></form>{draws.length > 0 && <div className="sequence" aria-live="polite"><ol>{draws.map((value, index) => <li key={index}><span>DRAW {String(index + 1).padStart(2, '0')}</span><code>{value.toFixed(8)}</code></li>)}</ol><p className="state">流状态 <code data-testid="random-state">{randomState}</code> · 同一输入可精确重放</p></div>}</section>
    <section className="status-grid" aria-label="重写边界"><article><span>固定参考</span><strong>8d80b5a</strong><p>原游戏、查看器、关卡管理器与 NPC 示例的不可变快照。</p></article><article><span>实现原则</span><strong>独立引擎</strong><p>原始脚本仅用于测试 oracle，不随生产应用执行。</p></article><article><span>当前范围</span><strong>尚未完成</strong><p>不能用地图或序列演示替代完整游戏的一致性验收。</p></article></section>
    <footer><span>源自 Chinese Dungeon · GPL-3.0</span><span>候选实现，待 Kibiandkimi 审核</span></footer>
  </main>;
}
