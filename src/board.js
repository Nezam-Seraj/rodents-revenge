// ============================================
// Rodent's Revenge — Board (Grid Model)
// ============================================
import { ENTITY } from './entities.js';

export class Board {
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        this.grid = [];
        this.clear();
    }

    clear() {
        this.grid = [];
        for (let x = 0; x < this.cols; x++) {
            this.grid[x] = [];
            for (let y = 0; y < this.rows; y++) {
                this.grid[x][y] = ENTITY.EMPTY;
            }
        }
    }

    inBounds(x, y) {
        return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
    }

    get(x, y) {
        if (!this.inBounds(x, y)) return -1;
        return this.grid[x][y];
    }

    set(x, y, type) {
        if (this.inBounds(x, y)) {
            this.grid[x][y] = type;
        }
    }

    isEmpty(x, y) {
        return this.inBounds(x, y) && this.grid[x][y] === ENTITY.EMPTY;
    }

    // Returns {x, y} of the neighbor in the given direction, or null if out of bounds
    getNeighbor(x, y, dir) {
        const offsets = {
            up: { x: 0, y: -1 },
            down: { x: 0, y: 1 },
            left: { x: -1, y: 0 },
            right: { x: 1, y: 0 },
        };
        const off = offsets[dir];
        if (!off) return null;
        const nx = x + off.x;
        const ny = y + off.y;
        if (!this.inBounds(nx, ny)) return null;
        return { x: nx, y: ny };
    }

    findRandomEmpty() {
        const empties = [];
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                if (this.grid[x][y] === ENTITY.EMPTY) {
                    empties.push({ x, y });
                }
            }
        }
        if (empties.length === 0) return null;
        return empties[Math.floor(Math.random() * empties.length)];
    }

    // Find an empty square near the edges (for spawning cats)
    findEdgeEmpty() {
        const empties = [];
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                if (this.grid[x][y] === ENTITY.EMPTY) {
                    if (x <= 2 || x >= this.cols - 3 || y <= 2 || y >= this.rows - 3) {
                        empties.push({ x, y });
                    }
                }
            }
        }
        if (empties.length === 0) return this.findRandomEmpty();
        return empties[Math.floor(Math.random() * empties.length)];
    }
}
