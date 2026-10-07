import { useState } from 'react';
import { DungeonRandom } from '../engine/random';
export function App() {
  const [seed, setSeed] = useState('中文地牢');
  const [sample, setSample] = useState<number[]>([]);
  return <main><header><span className="eyebrow">REFORGED CHINESE DUNGEON</span><h1>重铸 · 中文地牢</h1><p>独立逻辑引擎，一步一步重建冒险。</p></header>
    <section><h2>一致性实验室</h2><p>阶段 A · 测试基架。游戏尚未迁移，此页面不是可玩完成版。</p>
      <label htmlFor="seed">世界种子</label><div className="row"><input id="seed" value={seed} onChange={e => setSeed(e.target.value)} /><button onClick={() => { const rng = new DungeonRandom(seed); setSample(Array.from({ length: 5 }, rng.next)); }}>检查随机序列</button></div>
      <output aria-live="polite">{sample.length ? sample.map(n => n.toFixed(8)).join(' · ') : '输入种子，生成与冻结原版相同的随机序列。'}</output>
    </section><footer>GPL-3.0 · 原作 Chinese-Dungeon / SUSTechHSAS · 候选版本，尚未验收</footer></main>;
}
