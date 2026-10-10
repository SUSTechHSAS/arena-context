type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type PieceClass = new (options: Loose) => Loose;

export interface PuzzleBoardPorts {
  random(): number;
  /** Source `performance.now()` when available, else `Date.now()`. The search is time-budgeted. */
  now(): number;
  /** Source piece classes `[国际象棋车, 国际象棋象, 中国象棋炮, 国际象棋马]` in this order (packet `t10-chess-pieces`). */
  pieces: readonly PieceClass[];
  /** Source `可以放置(x, y, 类, 棋盘)` and `计算新增威胁格子数(x, y, 类, 棋盘)` (packet `t10-chess-solver`). */
  canPlace(x: number, y: number, piece: PieceClass, board: Loose[][]): unknown;
  countThreats(x: number, y: number, piece: PieceClass, board: Loose[][]): number;
  /** Source `放置物品到房间(piece, room)`. */
  placeItemInRoom(item: unknown, room: Loose): unknown;
}

/**
 * Source `生成解谜棋盘(房间)` (HTML L50788): randomized restarts of a beam search that places non-attacking pieces,
 * centre-first, within a time budget. The best board's pieces go into the room and `房间.棋子数量` counts them.
 * Each restart's weights sit on the working board as a non-enumerable, non-writable `__权重` for `计算新增威胁格子数`.
 */
export function generatePuzzleBoard(ports: PuzzleBoardPorts, room: Loose): { 棋盘: Loose[][] } {
  const width = room.w;
  const height = room.h;
  const area = width * height;
  const R = ports.random;
  const now = ports.now;
  const totalBudget = Math.min(1000, 35 + Math.floor(area * 0.35));
  const restarts = Math.min(6, Math.max(2, Math.ceil(Math.log2(area + 3))));
  const kinds = ports.pieces;
  let globalBest: Loose[][] | null = null;
  let globalBestCount = 0;
  const globalStart = now();
  let remaining = totalBudget;

  for (let round = 0; round < restarts && remaining > 0; round++) {
    const roundLimit = Math.max(10, Math.floor(remaining / (restarts - round)));
    const weights = { w吃: 2.8 + R() * 1.0, w空: 1.8 + R() * 0.8, w线: 0.8 + R() * 0.8, 噪声: 0.12 + R() * 0.25 };
    const exponent = 0.9 + R() * 0.8;
    const orderNoise = 0.15 + R() * 0.25;
    const tempStart = 1.0 + R() * 0.6;
    const tempMin = 0.35 + R() * 0.15;
    const beamCap = area >= 120 ? 4 : area >= 64 ? 3 : 2;
    const skipChance = 0.05 + 0.1 * R();

    const board: Loose[][] = Array.from({ length: height }, () => Array(width).fill(0));
    Object.defineProperty(board, '__权重', { value: weights, enumerable: false, configurable: true, writable: false });

    const cells: { x: number; y: number; key: number }[] = [];
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        const key = -Math.pow(d2 + 1e-6, exponent) + (R() - 0.5) * orderNoise;
        cells.push({ x, y, key });
      }
    }
    cells.sort((a, b) => b.key - a.key);

    let placedCount = 0;
    let localBest: Loose[][] | null = null;
    let localBestCount = 0;
    const start = now();
    const updateLocalBest = () => {
      if (placedCount > localBestCount) {
        localBestCount = placedCount;
        localBest = board.map(row => row.slice());
      }
    };
    const timedOut = () => (now() - start) > roundLimit;
    const temperatureAt = (idx: number) => tempMin + (tempStart - tempMin) * (1 - idx / cells.length);

    const search = (idx: number): boolean => {
      if (timedOut()) { updateLocalBest(); return true; }
      if (idx >= cells.length) { updateLocalBest(); return false; }
      const left = cells.length - idx;
      if (placedCount + left <= localBestCount) return false;
      const { x, y } = cells[idx]!;
      if (board[y]![x]) return search(idx + 1);
      const temperature = temperatureAt(idx);
      const tNorm = (temperature - tempMin) / Math.max(1e-6, tempStart - tempMin);
      if (R() < skipChance * (0.5 + 0.5 * tNorm)) {
        if (search(idx + 1)) return true;
      }
      const candidates: { 类: PieceClass; 分: number; 键: number }[] = [];
      for (const kind of kinds) {
        if (ports.canPlace(x, y, kind, board)) {
          const score = ports.countThreats(x, y, kind, board);
          const key = score + (R() - 0.5) * 2 * weights.噪声 * temperature;
          candidates.push({ 类: kind, 分: score, 键: key });
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.键 - a.键);
        let K = 1 + Math.floor(R() * beamCap);
        K = Math.min(K, candidates.length);
        for (let i = 0; i < K; i++) {
          const candidate = candidates[i]!;
          board[y]![x] = new candidate.类({});
          placedCount++;
          if (search(idx + 1)) return true;
          placedCount--;
          board[y]![x] = 0;
        }
      }
      return search(idx + 1);
    };

    search(0);
    if (localBestCount > globalBestCount) {
      globalBestCount = localBestCount;
      globalBest = localBest;
    }
    remaining = totalBudget - (now() - globalStart);
  }

  const result = globalBest || Array.from({ length: height }, () => Array(width).fill(0));
  const pieces: Loose[] = [];
  room.棋子数量 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (result[y]![x]) pieces.push(result[y]![x]);
    }
  }
  pieces.forEach(piece => {
    ports.placeItemInRoom(piece, room);
    room.棋子数量++;
  });
  return { 棋盘: result };
}
