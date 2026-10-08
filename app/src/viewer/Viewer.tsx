import { useEffect, useRef, useState } from 'react';
import { generateViewerLevel } from './generator';
import { drawViewer } from './render';
import { type ViewerSnapshot } from './model';

function LevelCard({ map, floor }: { map: ViewerSnapshot; floor: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (context) { drawViewer(context, map); ref.current!.dataset.ready = 'true'; }
  }, [map]);
  return <article className="level-card"><div className="level-heading"><h3>第 {floor} 层</h3><span>{map.地牢大小} × {map.地牢大小}</span></div><canvas ref={ref} width={300} height={300} role="img" aria-label={`第 ${floor} 层地牢地图`} data-testid="viewer-canvas" data-ready="false" /><div className="map-stats"><span>{map.房间列表.length} 个房间</span><span>{map.上锁房间列表.length} 个锁定房间</span></div></article>;
}

export function Viewer() {
  const [seed, setSeed] = useState('');
  const [maps, setMaps] = useState<ViewerSnapshot[]>([]);
  const [status, setStatus] = useState('输入种子，查看原作 0–15 层的完整地牢布局。');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function generate() {
    let chosen = seed.trim();
    if (!chosen) { chosen = Date.now().toString(); setSeed(chosen); }
    setMaps([]); setBusy(true); setError(false); setStatus('正在生成地图…');
    timer.current = setTimeout(() => {
      const generated: ViewerSnapshot[] = [];
      try {
        for (let floor = 0; floor <= 15; floor++) generated.push(generateViewerLevel(chosen, floor));
        setMaps(generated); setStatus(`为种子 “${chosen}” 生成了 16 层地牢地图（0–15）。`);
      } catch (failure) {
        setMaps(generated); setError(true);
        setStatus(`生成中止：${failure instanceof Error ? failure.message : String(failure)}。已完成 ${generated.length} 层；没有用不同算法替代原作错误。`);
      } finally { setBusy(false); }
    }, 10);
  }

  return <section aria-labelledby="viewer-title">
    <div className="panel viewer-controls"><div className="panel-heading"><span className="section-index">01 / DUNGEON ATLAS</span><h2 id="viewer-title">地图查看器</h2><p>完整移植原查看器的生成与绘制逻辑；主游戏生成器是另一项契约，尚未迁移。</p></div><form className="seed-form" onSubmit={event => { event.preventDefault(); generate(); }}><label htmlFor="viewer-seed">地图种子</label><div className="input-row"><input id="viewer-seed" placeholder="留空使用当前时间种子" value={seed} onChange={event => setSeed(event.target.value)} /><button type="submit" disabled={busy}>{busy ? '正在生成…' : '生成地图'} <span aria-hidden="true">↗</span></button></div></form><div className="map-legend"><span><i className="legend-room" />房间</span><span><i className="legend-corridor" />走廊</span><span><i className="legend-door" />门／彩色锁</span><span><i className="legend-start" />起点</span><span>⬇️ 下楼 · ⬆️ 上楼</span></div></div>
    <p className={error ? 'viewer-status error' : 'viewer-status'} role="status" data-testid="viewer-status">{status}</p><div className="map-grid" aria-busy={busy}>{maps.map((map, floor) => <LevelCard key={floor} map={map} floor={floor} />)}</div>
  </section>;
}
