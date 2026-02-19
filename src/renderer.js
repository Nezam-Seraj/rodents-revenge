// ============================================
// Rodent's Revenge — Canvas Renderer
// ============================================
import { ENTITY } from './entities.js';

// Color palette
const COLORS = {
    bg: '#0d0d1a',
    gridLine: 'rgba(0, 229, 255, 0.06)',
    gridBg: '#0f0f22',
    wall: '#2a2a4a',
    wallTop: '#3a3a6a',
    block: '#4a6fa5',
    blockTop: '#6a8fc5',
    mouse: '#ffcc02',
    mouseEar: '#ff8800',
    mouseTail: '#cc9900',
    cat: '#ff4060',
    catStripe: '#cc2040',
    catEye: '#ffffff',
    cheese: '#ffd740',
    cheeseHole: '#e6a800',
    sinkhole: '#1a0a30',
    sinkholeRim: '#6a2fba',
    trap: '#ff1744',
    trapBase: '#880e2e',
    yarn: '#e040fb',
    yarnLine: '#ce20eb',
};

export class Renderer {
    constructor(canvas, board) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.board = board;
        this.cellSize = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.effects = []; // Visual effects queue
        this.resize();
    }

    resize() {
        const container = this.canvas.parentElement;
        const maxW = container.clientWidth - 24;
        const maxH = container.clientHeight - 24;

        // Calculate cell size to fit the board
        const cellW = Math.floor(maxW / this.board.cols);
        const cellH = Math.floor(maxH / this.board.rows);
        this.cellSize = Math.max(12, Math.min(cellW, cellH, 36));

        const totalW = this.cellSize * this.board.cols;
        const totalH = this.cellSize * this.board.rows;

        this.canvas.width = totalW;
        this.canvas.height = totalH;
        this.canvas.style.width = totalW + 'px';
        this.canvas.style.height = totalH + 'px';
    }

    // Add a visual effect
    addEffect(type, x, y, duration = 500) {
        this.effects.push({ type, x, y, start: Date.now(), duration });
    }

    render(gameState) {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const board = this.board;

        // Clear
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        for (let x = 0; x < board.cols; x++) {
            for (let y = 0; y < board.rows; y++) {
                const px = x * cs;
                const py = y * cs;

                // Grid cell background
                ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.gridBg : '#111126';
                ctx.fillRect(px, py, cs, cs);

                // Grid lines
                ctx.strokeStyle = COLORS.gridLine;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px, py, cs, cs);

                // Draw entity
                const entity = board.get(x, y);
                this.drawEntity(ctx, entity, px, py, cs, gameState);
            }
        }

        // Draw effects
        this.renderEffects(ctx, cs);
    }

    drawEntity(ctx, entity, px, py, cs, gameState) {
        const cx = px + cs / 2;
        const cy = py + cs / 2;
        const r = cs * 0.38;

        switch (entity) {
            case ENTITY.WALL:
                this.drawWall(ctx, px, py, cs);
                break;
            case ENTITY.BLOCK:
                this.drawBlock(ctx, px, py, cs);
                break;
            case ENTITY.MOUSE:
                this.drawMouse(ctx, cx, cy, r, cs, gameState);
                break;
            case ENTITY.CAT:
                this.drawCat(ctx, cx, cy, r, cs);
                break;
            case ENTITY.CHEESE:
                this.drawCheese(ctx, cx, cy, r, cs);
                break;
            case ENTITY.SINKHOLE:
                this.drawSinkhole(ctx, cx, cy, r, cs);
                break;
            case ENTITY.TRAP:
                this.drawTrap(ctx, cx, cy, r, cs);
                break;
            case ENTITY.YARN:
                this.drawYarn(ctx, cx, cy, r, cs);
                break;
        }
    }

    drawWall(ctx, px, py, cs) {
        // 3D brick-like wall
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
        // Highlight top
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(px + 1, py + 1, cs - 2, cs * 0.3);
        // Dark edge
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + 1, py + cs * 0.8, cs - 2, cs * 0.2 - 1);
    }

    drawBlock(ctx, px, py, cs) {
        const margin = 1;
        // Main block
        ctx.fillStyle = COLORS.block;
        ctx.fillRect(px + margin, py + margin, cs - margin * 2, cs - margin * 2);
        // Top highlight
        ctx.fillStyle = COLORS.blockTop;
        ctx.fillRect(px + margin, py + margin, cs - margin * 2, cs * 0.25);
        // Side shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(px + cs * 0.75, py + margin, cs * 0.25 - margin, cs - margin * 2);
    }

    drawMouse(ctx, cx, cy, r, cs, gameState) {
        // Body
        ctx.fillStyle = COLORS.mouse;
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.1, r * 0.85, r, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ears
        ctx.fillStyle = COLORS.mouseEar;
        ctx.beginPath();
        ctx.arc(cx - r * 0.55, cy - r * 0.65, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.55, cy - r * 0.65, r * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(cx - r * 0.28, cy - r * 0.15, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.28, cy - r * 0.15, r * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = '#ff6699';
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.2, r * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Stuck indicator
        if (gameState && gameState.mouseStuck) {
            ctx.strokeStyle = COLORS.sinkholeRim;
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    drawCat(ctx, cx, cy, r, cs) {
        // Body
        ctx.fillStyle = COLORS.cat;
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.1, r * 0.85, r, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ears (pointy triangles)
        ctx.fillStyle = COLORS.cat;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy - r * 0.3);
        ctx.lineTo(cx - r * 0.45, cy - r * 1.05);
        ctx.lineTo(cx - r * 0.15, cy - r * 0.3);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.15, cy - r * 0.3);
        ctx.lineTo(cx + r * 0.45, cy - r * 1.05);
        ctx.lineTo(cx + r * 0.7, cy - r * 0.3);
        ctx.fill();

        // Eyes
        ctx.fillStyle = COLORS.catEye;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.3, cy - r * 0.1, r * 0.15, r * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.3, cy - r * 0.1, r * 0.15, r * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.3, cy - r * 0.08, r * 0.06, r * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.3, cy - r * 0.08, r * 0.06, r * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Stripes
        ctx.strokeStyle = COLORS.catStripe;
        ctx.lineWidth = 1.5;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * r * 0.25, cy + r * 0.3);
            ctx.lineTo(cx + i * r * 0.3, cy + r * 0.75);
            ctx.stroke();
        }
    }

    drawCheese(ctx, cx, cy, r, cs) {
        // Wedge shape
        ctx.fillStyle = COLORS.cheese;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy + r * 0.5);
        ctx.lineTo(cx, cy - r);
        ctx.lineTo(cx + r, cy + r * 0.5);
        ctx.closePath();
        ctx.fill();

        // Base
        ctx.fillRect(cx - r, cy + r * 0.3, r * 2, r * 0.4);

        // Holes
        ctx.fillStyle = COLORS.cheeseHole;
        ctx.beginPath();
        ctx.arc(cx - r * 0.2, cy + r * 0.1, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.3, cy - r * 0.1, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
    }

    drawSinkhole(ctx, cx, cy, r, cs) {
        // Outer ring
        ctx.fillStyle = COLORS.sinkholeRim;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        // Inner dark
        ctx.fillStyle = COLORS.sinkhole;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Spiral hint
        ctx.strokeStyle = COLORS.sinkholeRim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 1.5);
        ctx.stroke();
    }

    drawTrap(ctx, cx, cy, r, cs) {
        // Base plate
        ctx.fillStyle = COLORS.trapBase;
        ctx.fillRect(cx - r * 0.8, cy + r * 0.1, r * 1.6, r * 0.5);
        // Spring arc
        ctx.strokeStyle = COLORS.trap;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, Math.PI, 0);
        ctx.stroke();
        // Danger symbol
        ctx.fillStyle = COLORS.trap;
        ctx.font = `${r * 0.8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠', cx, cy - r * 0.1);
    }

    drawYarn(ctx, cx, cy, r, cs) {
        // Ball
        ctx.fillStyle = COLORS.yarn;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
        // Thread lines
        ctx.strokeStyle = COLORS.yarnLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.15, r * 0.35, Math.PI * 0.3, Math.PI * 1.2);
        ctx.stroke();
        // Trailing thread
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.6, cy + r * 0.3);
        ctx.quadraticCurveTo(cx + r * 1.1, cy + r * 0.8, cx + r * 0.5, cy + r * 0.9);
        ctx.stroke();
    }

    renderEffects(ctx, cs) {
        const now = Date.now();
        this.effects = this.effects.filter(e => {
            const elapsed = now - e.start;
            if (elapsed > e.duration) return false;
            const progress = elapsed / e.duration;
            const px = e.x * cs + cs / 2;
            const py = e.y * cs + cs / 2;

            switch (e.type) {
                case 'trap':
                    // Red flash
                    ctx.fillStyle = `rgba(255, 23, 68, ${0.6 * (1 - progress)})`;
                    ctx.beginPath();
                    ctx.arc(px, py, cs * (0.5 + progress), 0, Math.PI * 2);
                    ctx.fill();
                    break;
                case 'cheese':
                    // Gold sparkle
                    ctx.fillStyle = `rgba(255, 215, 64, ${0.8 * (1 - progress)})`;
                    const sparkleR = cs * 0.3 * (1 + progress * 2);
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI * 2 / 6) * i + progress * Math.PI;
                        const sx = px + Math.cos(angle) * sparkleR;
                        const sy = py + Math.sin(angle) * sparkleR;
                        ctx.beginPath();
                        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
                case 'death':
                    // Red shockwave
                    ctx.strokeStyle = `rgba(255, 64, 96, ${0.7 * (1 - progress)})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(px, py, cs * progress * 2, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                case 'stuck':
                    // Purple pulse
                    ctx.strokeStyle = `rgba(106, 47, 186, ${0.5 * (1 - progress)})`;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.arc(px, py, cs * 0.5, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    break;
            }
            return true;
        });
    }
}
