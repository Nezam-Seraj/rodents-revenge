// ============================================
// Rodent's Revenge — Level Definitions
// ============================================
// Coordinates: [col, row], origin top-left.
// Each level: { cols, rows, mouse, cats, blocks, walls, sinkholes, traps, ice,
//               yarnSpawnInterval, catSpawnInterval, theme }

const COLS = 23;
const ROWS = 23;

// ---- per-level colour themes (environment only; entities stay constant) ----
export const THEMES = {
    classic:     { bg: '#161a24', frame: '#0f1119', floorA: '#2f3a55', floorB: '#38435f', grid: '#222b40' },
    underground: { bg: '#191225', frame: '#0f0a18', floorA: '#3a2e4e', floorB: '#463a60', grid: '#251c35' },
    ice:         { bg: '#0c1824', frame: '#07101a', floorA: '#284058', floorB: '#31506b', grid: '#1b2e42' },
};

// Helper: generate a ring of blocks around center
function generateBlockRing(cx, cy, innerR, outerR, holes = []) {
    const blocks = [];
    for (let x = cx - outerR; x <= cx + outerR; x++) {
        for (let y = cy - outerR; y <= cy + outerR; y++) {
            const dx = Math.abs(x - cx);
            const dy = Math.abs(y - cy);
            if (dx >= innerR || dy >= innerR) {
                if (dx <= outerR && dy <= outerR) {
                    const isHole = holes.some(h => h[0] === x && h[1] === y);
                    if (!isHole) blocks.push([x, y]);
                }
            }
        }
    }
    return blocks;
}

// Helper: build ice lanes (perimeter + centre plus), skipping occupied cells
function generateIce(cols, rows, occupied) {
    const occ = new Set(occupied.map(([x, y]) => x + ',' + y));
    const ice = [];
    const add = (x, y) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        const k = x + ',' + y;
        if (!occ.has(k)) { occ.add(k); ice.push([x, y]); }
    };
    for (let x = 2; x <= 20; x++) { add(x, 2); add(x, 20); }
    for (let y = 2; y <= 20; y++) { add(2, y); add(20, y); }
    for (let i = 9; i <= 13; i++) { add(i, 11); add(11, i); }
    return ice;
}

export const levels = [
    // ===== LEVEL 1 — classic intro =====
    {
        cols: COLS, rows: ROWS,
        mouse: [11, 11],
        cats: [[2, 2], [20, 20]],
        blocks: generateBlockRing(11, 11, 4, 7, [
            [11, 4], [11, 18], [4, 11], [18, 11],
            [8, 8], [14, 8], [8, 14], [14, 14]
        ]),
        walls: [[0, 0], [0, 22], [22, 0], [22, 22], [5, 0], [17, 0], [5, 22], [17, 22], [0, 5], [0, 17], [22, 5], [22, 17]],
        sinkholes: [], traps: [], ice: [],
        yarnSpawnInterval: 0,
        catSpawnInterval: 90,
        theme: THEMES.classic,
    },

    // ===== LEVEL 2 — Sinkhole Crossroads =====
    {
        cols: COLS, rows: ROWS,
        mouse: [11, 11],
        cats: [[2, 2], [20, 2], [11, 20]],
        blocks: generateBlockRing(11, 11, 4, 7, [
            [11, 4], [11, 18], [4, 11], [18, 11],
            [8, 8], [14, 8], [8, 14], [14, 14]
        ]),
        walls: [[0, 0], [0, 22], [22, 0], [22, 22], [5, 0], [17, 0], [5, 22], [17, 22], [0, 5], [0, 17], [22, 5], [22, 17],
                [11, 0], [11, 22], [0, 11], [22, 11]],
        sinkholes: [[5, 5], [17, 17], [5, 17], [17, 5]],
        traps: [], ice: [],
        yarnSpawnInterval: 0,
        catSpawnInterval: 55,
        theme: THEMES.underground,
    },

    // ===== LEVEL 3 — Frozen Gauntlet (ice + yarn) =====
    (() => {
        const mouse = [11, 11];
        const cats = [[2, 2], [20, 2], [20, 20], [2, 20]];
        const blocks = generateBlockRing(11, 11, 4, 6, [
            [11, 5], [11, 17], [5, 11], [17, 11],
            [9, 9], [13, 9], [9, 13], [13, 13]
        ]);
        const walls = [[0, 0], [0, 22], [22, 0], [22, 22]];
        const sinkholes = [[5, 5], [17, 17]];
        const traps = [[3, 11], [19, 11]];
        const occupied = [...blocks, ...walls, ...sinkholes, ...traps, ...cats, mouse];
        const ice = generateIce(COLS, ROWS, occupied);
        return {
            cols: COLS, rows: ROWS,
            mouse, cats, blocks, walls, sinkholes, traps, ice,
            yarnSpawnInterval: 40,
            catSpawnInterval: 45,
            theme: THEMES.ice,
        };
    })(),
];
