import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { generateDeathParticles, generateSummaryParticles } from '../src/game/world/death-particles';
import { declaration } from './oracle/source';

const lcg = (seed: number) => { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; };

describe('death screen particles (生成死亡粒子)', () => {
  it('consumes the same prng draws and yields the same particles as the source', () => {
    const context = vm.createContext({});
    new vm.Script(`${declaration('生成死亡粒子')}
      class Style { constructor() { this.props = []; this.cssText = ''; } setProperty(k, v) { this.props.push([k, v]); } }
      class Div { constructor(tag) { this.tag = tag; this.className = ''; this.style = new Style(); } }
      globalThis.document = { createElement: tag => new Div(tag) };
      globalThis.run = (rand) => { let draws = 0; globalThis.prng = () => { draws++; return rand(); };
        const children = []; 生成死亡粒子({ appendChild: c => children.push(c) }); return { children, draws }; };`).runInContext(context);
    const run = new vm.Script('run').runInContext(context) as (r: () => number) => { children: { tag: string; className: string; style: { cssText: string; props: [string, unknown][] } }[]; draws: number };
    const num = (css: string, re: RegExp) => Number(re.exec(css)![1]);
    for (let seed = 1; seed <= 300; seed++) {
      const source = run(lcg(seed));
      let draws = 0; const rand = lcg(seed);
      const mine = generateDeathParticles(() => { draws++; return rand(); });
      expect(draws).toBe(source.draws);
      expect(mine.length).toBe(source.children.length);
      source.children.forEach((child, i) => {
        const css = child.style.cssText; const p = mine[i]!;
        expect([child.tag, child.className]).toEqual(['div', '死亡粒子']);
        expect({
          width: num(css, /width: ([^p]+)px/), height: num(css, /height: ([^p]+)px/), background: /background: ([^;]+);/.exec(css)![1],
          left: num(css, /left: ([^%]+)%/), top: num(css, /top: ([^%]+)%/), duration: num(css, /粒子飘落 ([^s]+)s/), opacity: num(css, /opacity: ([^;]+);/),
          random: child.style.props.length === 1 && child.style.props[0]![0] === '--random' ? child.style.props[0]![1] : NaN,
        }).toEqual(p);
      });
    }
  });

  it('summary particles (生成结算粒子) match the source draws and values', () => {
    const context = vm.createContext({});
    new vm.Script(`${declaration('生成结算粒子')}
      class Div { constructor(tag) { this.tag = tag; this.className = ''; this.style = {}; } }
      globalThis.document = { createElement: tag => new Div(tag) };
      globalThis.run = (rand, has) => { let draws = 0; globalThis.prng = () => { draws++; return rand(); };
        const children = []; const box = has ? { innerHTML: 'old', appendChild: c => children.push(c) } : null; 生成结算粒子(box);
        return { children, draws, html: box && box.innerHTML }; };`).runInContext(context);
    const run = new vm.Script('run').runInContext(context) as (r: () => number, has: boolean) => { children: { tag: string; className: string; style: Record<string, string> }[]; draws: number; html: string | null };
    for (let seed = 1; seed <= 300; seed++) {
      const has = seed % 7 !== 0;
      const source = run(lcg(seed), has);
      let draws = 0; const rand = lcg(seed);
      const mine = generateSummaryParticles(() => { draws++; return rand(); }, has);
      expect(draws).toBe(source.draws);
      expect(source.html).toBe(has ? '' : null);
      expect(source.children.map((c) => ({ left: Number(c.style.left!.slice(0, -1)), delay: Number(c.style.animationDelay!.slice(0, -1)),
        duration: Number(c.style.animationDuration!.slice(0, -1)) }))).toEqual(mine);
      expect(source.children.every((c) => c.tag === 'div' && c.className === '结算粒子')).toBe(true);
    }
  });
});
