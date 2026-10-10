/** One falling particle on the death screen (source CSS: px sizes, % position, seconds, opacity, `--random`). */
export interface DeathParticle {
  width: number; // px
  height: number; // px
  background: string;
  left: number; // %
  top: number; // %
  duration: number; // s, `animation: 粒子飘落 <duration>s linear infinite`
  opacity: number;
  random: number; // CSS custom property --random
}

export const DEATH_PARTICLE_COUNT = 30;
export const DEATH_PARTICLE_COLORS = ['#ff0000', '#ff4444', '#ff8888'] as const;

/**
 * Source `生成死亡粒子(容器)` (HTML L41516): 30 decorative particles for the death screen. Although purely visual, it
 * draws 8 values per particle from the game's seeded `prng` (240 in total), in this exact order: width, height, colour,
 * left, top, duration, opacity, --random. The rewrite must consume the same draws to keep later seeded behaviour equal.
 */
export function generateDeathParticles(prng: () => number): DeathParticle[] {
  const particles: DeathParticle[] = [];
  for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
    const width = prng() * 4 + 2;
    const height = prng() * 4 + 2;
    const background = DEATH_PARTICLE_COLORS[Math.floor(prng() * DEATH_PARTICLE_COLORS.length)]!;
    const left = prng() * 100;
    const top = prng() * 100;
    const duration = prng() * 3 + 2;
    const opacity = prng() * 0.6 + 0.4;
    const random = prng();
    particles.push({ width, height, background, left, top, duration, opacity, random });
  }
  return particles;
}

/** One floating particle on the run-summary screen. */
export interface SummaryParticle {
  left: number; // %
  delay: number; // s, animationDelay
  duration: number; // s, animationDuration
}

/**
 * Source `生成结算粒子(容器)` (HTML L34991): 20 summary-screen particles, 3 seeded `prng` draws each (left, delay,
 * duration), so 60 draws. When there is no container the source returns before drawing anything; pass
 * `hasContainer = false` for the same effect.
 */
export function generateSummaryParticles(prng: () => number, hasContainer: unknown = true): SummaryParticle[] {
  if (!hasContainer) return [];
  const particles: SummaryParticle[] = [];
  for (let i = 0; i < 20; i++) {
    const left = prng() * 100;
    const delay = prng() * 15;
    const duration = 5 + prng() * 10;
    particles.push({ left, delay, duration });
  }
  return particles;
}
