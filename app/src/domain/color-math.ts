/**
 * Isolated port of three original colour helpers from ChineseDungeon.html
 * (upstream 8d80b5a4dd3d737ed6d3060f05611eaa3de611ab):
 *   hexToRgba   ChineseDungeon.html:51756-51768
 *   hexToRgb    ChineseDungeon.html:51770-51777
 *   blendColors ChineseDungeon.html:51778-51885
 *
 * The helpers are pure: they read no world state and use no RNG, clock, DOM or network.
 * Source expressions, operand order and floating-point operation order are kept verbatim so
 * results are bit-identical. Observed quirks (for example `alpha` 0 taking the opaque branch,
 * '#' not stripped by hexToRgba, partial parseInt) are preserved, not repaired; see
 * docs/task-10/packets/color-math.md for the recorded list.
 */

/** Explicit port surface. These helpers have no external reads or effects, so the set is empty. */
export interface ColorMathPorts {}

export interface ColorMath {
  hexToRgba(hex: string, alpha?: unknown): string;
  hexToRgb(hex: string): [number, number, number];
  blendColors(hexArray: readonly string[]): string;
}

export function createColorMath(_ports: ColorMathPorts = {}): ColorMath {
  function hexToRgba(hex: string, alpha?: unknown): string {
    let r = parseInt(hex.slice(0, 2), 16),
      g = parseInt(hex.slice(2, 4), 16),
      b = parseInt(hex.slice(4, 6), 16);

    if (alpha) {
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    } else {
      return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    }
  }

  // Hex转RGB
  function hexToRgb(hex: string): [number, number, number] {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      // length is exactly 3 here, so every index exists (non-null assertions are type-only).
      hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
    }
    const num = parseInt(hex, 16);
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  }

  // RGB转HSL
  function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    // The original leaves h undefined when no switch case matches (only possible for NaN input).
    let h = Number.NaN,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h *= 60;
    }
    return [h, s, l];
  }

  // HSL转RGB
  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l; // 灰色
    } else {
      const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h / 360 + 1 / 3);
      g = hue2rgb(p, q, h / 360);
      b = hue2rgb(p, q, h / 360 - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  // RGB转Hex
  function rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')
    );
  }

  function blendColors(hexArray: readonly string[]): string {
    if (hexArray.length === 0) return '#000000'; // 处理空数组情况

    // 处理每个Hex颜色 (reuses this module's hexToRgb, as the original reuses its global)
    const hslArray = hexArray.map((hex) => {
      const [r, g, b] = hexToRgb(hex);
      return rgbToHsl(r, g, b);
    });

    // 计算平均H（向量平均）
    let sumSin = 0,
      sumCos = 0;
    for (const [h] of hslArray) {
      const radians = (h * Math.PI) / 180;
      sumSin += Math.sin(radians);
      sumCos += Math.cos(radians);
    }
    const avgH =
      (Math.atan2(sumSin / hexArray.length, sumCos / hexArray.length) * 180) / Math.PI;
    const normalizedH = (avgH + 360) % 360; // 确保在0-360度之间

    // 计算平均S和L
    const avgS = hslArray.reduce((sum, [, s]) => sum + s, 0) / hexArray.length;
    const avgL = hslArray.reduce((sum, [, , l]) => sum + l, 0) / hexArray.length;

    // 转换回RGB并转为Hex
    const [r, g, b] = hslToRgb(normalizedH, avgS, avgL);
    return rgbToHex(r, g, b);
  }

  return { hexToRgba, hexToRgb, blendColors };
}
