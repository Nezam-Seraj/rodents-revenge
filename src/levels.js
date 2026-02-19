// ============================================
// Rodent's Revenge — Level Definitions
// ============================================
// Each level: { cols, rows, mouse, cats, blocks, walls, sinkholes, traps, yarnSpawnInterval }
// Coordinates: [col, row], origin top-left

const COLS = 23;
const ROWS = 23;

// Helper: generate a ring of blocks around center
function generateBlockRing(cx, cy, innerR, outerR, holes = []) {
    const blocks = [];
    for (let x = cx - outerR; x <= cx + outerR; x++) {
        for (let y = cy - outerR; y <= cy + outerR; y++) {
            const dx = Math.abs(x - cx);
            const dy = Math.abs(y - cy);
            if (dx >= innerR || dy >= innerR) {
                if (dx <= outerR && dy <= outerR) {
                    // Check if this is a hole
                    const isHole = holes.some(h => h[0] === x && h[1] === y);
                    if (!isHole) {
                        blocks.push([x, y]);
                    }
                }
            }
        }
    }
    return blocks;
}

// Helper: scatter walls around the edges
function generateEdgeWalls(count, cols, rows, rng) {
    const walls = [];
    const positions = [];
    for (let i = 0; i < cols; i++) {
        positions.push([i, 0], [i, rows - 1]);
    }
    for (let j = 1; j < rows - 1; j++) {
        positions.push([0, j], [cols - 1, j]);
    }
    // Deterministic shuffle
    for (let i = positions.length - 1; i > 0; i--) {
        const j = rng(i + 1);
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    return positions.slice(0, count);
}

function seededRng(seed) {
    let s = seed;
    return function (max) {
        s = (s * 16807 + 0) % 2147483647;
        return s % max;
    };
}

export const levels = [
    // ===== LEVEL 1 — Easy intro =====
    {
        cols: COLS, rows: ROWS,
        mouse: [11, 11],
        cats: [[2, 2], [20, 20]],
        blocks: generateBlockRing(11, 11, 4, 7, [
            [11, 4], [11, 18], [4, 11], [18, 11],  // openings
            [8, 8], [14, 8], [8, 14], [14, 14]
        ]),
        walls: [[0, 0], [0, 22], [22, 0], [22, 22], [5, 0], [17, 0], [5, 22], [17, 22], [0, 5], [0, 17], [22, 5], [22, 17]],
        sinkholes: [],
        traps: [],
        yarnSpawnInterval: 0, // no yarn on level 1
        catSpawnInterval: 90, // ~54 seconds — very relaxed
    },

    // ===== LEVEL 2 — Add sinkholes =====
    {
        cols: COLS, rows: ROWS,
        mouse: [11, 11],
        cats: [[1, 1], [21, 1], [1, 21]],
        blocks: generateBlockRing(11, 11, 3, 7, [
            [11, 4], [11, 18], [4, 11], [18, 11],
            [7, 7], [15, 7], [7, 15], [15, 15],
            [11, 7], [7, 11], [15, 11], [11, 15]
        ]),
        walls: [
            [0, 0], [0, 22], [22, 0], [22, 22],
            [3, 0], [10, 0], [12, 0], [19, 0],
            [3, 22], [10, 22], [12, 22], [19, 22],
            [0, 3], [0, 10], [0, 12], [0, 19],
            [22, 3], [22, 10], [22, 12], [22, 19]
        ],
        sinkholes: [[5, 5], [17, 17]],
        traps: [],
        yarnSpawnInterval: 0,
        catSpawnInterval: 70, // ~42 seconds
    },

    // ===== LEVEL 3 — Traps + Yarn =====
    {
        cols: COLS, rows: ROWS,
        mouse: [11, 11],
        cats: [[1, 1], [21, 1], [21, 21], [1, 21]],
        blocks: generateBlockRing(11, 11, 3, 6, [
            [11, 5], [11, 17], [5, 11], [17, 11],
            [8, 8], [14, 8], [8, 14], [14, 14],
            [11, 8], [8, 11], [14, 11], [11, 14]
        ]),
        walls: (() => {
            const w = [];
            for (let i = 0; i < COLS; i++) {
                if (i !== 11 && i !== 5 && i !== 17) { w.push([i, 0]); w.push([i, 22]); }
            }
            for (let j = 1; j < ROWS - 1; j++) {
                if (j !== 11 && j !== 5 && j !== 17) { w.push([0, j]); w.push([22, j]); }
            }
            return w;
        })(),
        sinkholes: [[3, 3], [19, 19]],
        traps: [[6, 2], [16, 20]],
        yarnSpawnInterval: 45, // ~27 seconds between yarn
        catSpawnInterval: 55, // ~33 seconds
    },

    // ===== LEVEL 4 — More cats, fewer blocks =====
    {
        cols: COLS, rows: ROWS,
        mouse: [11, 11],
        cats: [[2, 2], [20, 2], [20, 20], [2, 20], [11, 2]],
        blocks: generateBlockRing(11, 11, 3, 5, [
            [11, 6], [11, 16], [6, 11], [16, 11],
            [8, 8], [14, 8], [8, 14], [14, 14]
        ]),
        walls: (() => {
            const w = [];
            for (let i = 0; i < COLS; i++) { w.push([i, 0]); w.push([i, 22]); }
            for (let j = 1; j < ROWS - 1; j++) { w.push([0, j]); w.push([22, j]); }
            // Internal walls
            w.push([5, 5], [17, 5], [5, 17], [17, 17]);
            w.push([11, 3], [3, 11], [19, 11], [11, 19]);
            return w;
        })(),
        sinkholes: [[4, 4], [18, 18], [4, 18], [18, 4]],
        traps: [[3, 10], [19, 12], [10, 3], [12, 19]],
        yarnSpawnInterval: 35, // ~21 seconds
        catSpawnInterval: 42, // ~25 seconds
    },

    // ===== LEVEL 5 — Gauntlet =====
    {
        cols: COLS, rows: ROWS,
        mouse: [11, 11],
        cats: [[2, 2], [20, 2], [20, 20], [2, 20], [11, 2], [2, 11], [20, 11]],
        blocks: generateBlockRing(11, 11, 2, 4, [
            [11, 7], [11, 15], [7, 11], [15, 11],
            [9, 9], [13, 9], [9, 13], [13, 13]
        ]),
        walls: (() => {
            const w = [];
            for (let i = 0; i < COLS; i++) { w.push([i, 0]); w.push([i, 22]); }
            for (let j = 1; j < ROWS - 1; j++) { w.push([0, j]); w.push([22, j]); }
            // Maze-like internal walls
            for (let i = 3; i <= 19; i += 4) {
                w.push([i, 5], [i, 17]);
                w.push([5, i], [17, i]);
            }
            return w;
        })(),
        sinkholes: [[6, 6], [16, 16], [6, 16], [16, 6], [11, 6], [11, 16]],
        traps: [[3, 3], [19, 19], [3, 19], [19, 3]],
        yarnSpawnInterval: 25, // ~15 seconds
        catSpawnInterval: 32, // ~19 seconds
    },
];
