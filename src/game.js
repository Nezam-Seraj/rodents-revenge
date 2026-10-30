// ============================================
// Rodent's Revenge — Game Engine
// ============================================
import { ENTITY } from './entities.js';
import { Board } from './board.js';
import { Renderer } from './renderer.js';
import { levels } from './levels.js';
import { audio } from './audio.js';

const DIR_OFFSETS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.state = 'start'; // start | playing | paused | gameover | levelcomplete
        this.level = 0;
        this.score = 0;
        this.lives = 3;

        // Mouse position
        this.mouse = { x: 0, y: 0 };
        this.mouseStuck = false;
        this.stuckTimer = null;

        // Cats: array of {x, y}
        this.cats = [];

        // Yarn balls: array of {x, y, dx, dy}
        this.yarnBalls = [];

        // Timers
        this.catMoveInterval = null;
        this.catSpawnTimer = 0;
        this.catSpawnInterval = 30; // seconds
        this.yarnSpawnTimer = 0;
        this.yarnSpawnInterval = 0;
        this.gameTime = 0;
        this.lastTick = 0;
        this.tickInterval = 600; // ms between cat moves

        // Board & Renderer
        this.board = null;
        this.renderer = null;

        // Bind input
        this._boundKeydown = this.handleKeydown.bind(this);
        this._animFrame = null;

        // Touch / swipe support
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._lastDpadTouch = 0;
        this._boundTouchStart = this.handleTouchStart.bind(this);
        this._boundTouchEnd = this.handleTouchEnd.bind(this);

        // Hit-stop freeze duration
        this.hitStopUntil = 0;
    }

    // ===== INITIALIZATION =====

    init() {
        this.bindInput();
        this.bindMobileControls();

        // Mute button in HUD
        const muteBtn = document.getElementById('mute-btn');
        if (muteBtn) {
            muteBtn.textContent = audio.isMuted() ? '🔇' : '🔊';
            muteBtn.addEventListener('click', () => {
                const muted = audio.toggleMute();
                muteBtn.textContent = muted ? '🔇' : '🔊';
            });
        }
    }

    triggerHitStop(ms = 60) {
        this.hitStopUntil = performance.now() + ms;
    }

    startGame() {
        this.level = 0;
        this.score = 0;
        this.lives = 3;
        this.loadLevel(this.level);
        this.state = 'playing';
        this.updateHUD();
        this.startGameLoop();
    }

    loadLevel(levelIndex) {
        const lvl = levels[levelIndex % levels.length];
        this.board = new Board(lvl.cols, lvl.rows);
        // Reuse the WebGL renderer across restarts (avoids leaking GL contexts)
        if (this.renderer) this.renderer.setBoard(this.board, lvl.theme);
        else this.renderer = new Renderer(this.canvas, this.board, lvl.theme);
        this.cats = [];
        this.yarnBalls = [];
        this.mouseStuck = false;
        this.gameTime = 0;
        this.lastTick = Date.now();
        this.catSpawnTimer = 0;
        this.catSpawnInterval = lvl.catSpawnInterval || 30;
        this.yarnSpawnInterval = lvl.yarnSpawnInterval || 0;
        this.yarnSpawnTimer = 0;

        // Place walls
        for (const [x, y] of lvl.walls) {
            this.board.set(x, y, ENTITY.WALL);
        }

        // Place blocks
        for (const [x, y] of lvl.blocks) {
            if (this.board.isEmpty(x, y)) {
                this.board.set(x, y, ENTITY.BLOCK);
            }
        }

        // Place sinkholes
        for (const [x, y] of lvl.sinkholes) {
            if (this.board.isEmpty(x, y)) {
                this.board.set(x, y, ENTITY.SINKHOLE);
            }
        }

        // Place traps
        for (const [x, y] of lvl.traps) {
            if (this.board.isEmpty(x, y)) {
                this.board.set(x, y, ENTITY.TRAP);
            }
        }

        // Place ice (floor overlay, kept separate from the entity grid)
        for (const [x, y] of (lvl.ice || [])) {
            this.board.setIce(x, y);
        }

        // Place mouse
        this.mouse = { x: lvl.mouse[0], y: lvl.mouse[1] };
        this.board.set(this.mouse.x, this.mouse.y, ENTITY.MOUSE);

        // Place cats
        for (const [x, y] of lvl.cats) {
            if (this.board.isEmpty(x, y)) {
                this.cats.push({ x, y });
                this.board.set(x, y, ENTITY.CAT);
            }
        }

        this.renderer.resize();
    }

    // ===== GAME LOOP =====

    startGameLoop() {
        if (this._animFrame) cancelAnimationFrame(this._animFrame);
        this.lastTick = Date.now();
        const loop = () => {
            this._animFrame = requestAnimationFrame(loop);
            this.update();
            this.draw();
        };
        loop();
    }

    stopGameLoop() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
    }

    update() {
        if (this.state !== 'playing') return;

        // Hit-stop freeze on impact
        if (performance.now() < this.hitStopUntil) return;

        const now = Date.now();
        const delta = now - this.lastTick;

        // Smooth frame-by-frame timer bar update
        const tickFraction = Math.min(1, Math.max(0, delta / this.tickInterval));
        const progress = Math.max(0, 1 - (this.catSpawnTimer + tickFraction) / this.catSpawnInterval);
        this.updateTimerBar(progress);

        if (delta >= this.tickInterval) {
            this.lastTick = now;
            this.gameTime++;

            // Move cats
            this.moveCats();

            // Move yarn balls
            this.moveYarnBalls();

            // Cat spawn timer
            this.catSpawnTimer++;
            if (this.catSpawnTimer >= this.catSpawnInterval) {
                this.catSpawnTimer = 0;
                this.spawnCat();
            }

            // Yarn spawn
            if (this.yarnSpawnInterval > 0) {
                this.yarnSpawnTimer++;
                if (this.yarnSpawnTimer >= this.yarnSpawnInterval) {
                    this.yarnSpawnTimer = 0;
                    this.spawnYarn();
                }
            }
        }
    }

    draw() {
        if (!this.renderer) return;
        this.renderer.render({
            mouse: this.mouse,
            cats: this.cats,
            yarnBalls: this.yarnBalls,
            mouseStuck: this.mouseStuck,
        });
    }

    // ===== INPUT =====

    bindInput() {
        document.addEventListener('keydown', this._boundKeydown);
        // Swipe support for mobile
        this.canvas.addEventListener('touchstart', this._boundTouchStart, { passive: true });
        this.canvas.addEventListener('touchend', this._boundTouchEnd, { passive: true });
    }

    unbindInput() {
        document.removeEventListener('keydown', this._boundKeydown);
        this.canvas.removeEventListener('touchstart', this._boundTouchStart);
        this.canvas.removeEventListener('touchend', this._boundTouchEnd);
    }

    bindMobileControls() {
        const btns = document.querySelectorAll('.dpad-btn[data-dir]');
        btns.forEach(btn => {
            // Use touchstart for instant response on mobile
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this._lastDpadTouch = Date.now();
                const dir = btn.dataset.dir;
                if (dir) this.movePlayer(dir);
            }, { passive: false });
            btn.addEventListener('click', () => {
                // Ignore the synthesized click that follows a touch on the same tap,
                // otherwise one tap = two moves (esp. iOS Safari).
                if (this._lastDpadTouch && Date.now() - this._lastDpadTouch < 500) return;
                const dir = btn.dataset.dir;
                if (dir) this.movePlayer(dir);
            });
        });
    }

    handleTouchStart(e) {
        if (e.touches.length > 0) {
            this._touchStartX = e.touches[0].clientX;
            this._touchStartY = e.touches[0].clientY;
        }
    }

    handleTouchEnd(e) {
        if (e.changedTouches.length > 0) {
            const dx = e.changedTouches[0].clientX - this._touchStartX;
            const dy = e.changedTouches[0].clientY - this._touchStartY;
            const threshold = 20;
            if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

            if (Math.abs(dx) > Math.abs(dy)) {
                this.movePlayer(dx > 0 ? 'right' : 'left');
            } else {
                this.movePlayer(dy > 0 ? 'down' : 'up');
            }
        }
    }

    handleKeydown(e) {
        if (this.state !== 'playing') return;

        const keyMap = {
            ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
            w: 'up', W: 'up', a: 'left', A: 'left', s: 'down', S: 'down', d: 'right', D: 'right',
        };

        const dir = keyMap[e.key];
        if (dir) {
            e.preventDefault();
            this.movePlayer(dir);
        }
    }

    // ===== PLAYER MOVEMENT =====

    movePlayer(dir) {
        if (this.state !== 'playing' || this.mouseStuck) return;

        const off = DIR_OFFSETS[dir];
        if (!off) return;

        const nx = this.mouse.x + off.x;
        const ny = this.mouse.y + off.y;

        if (!this.board.inBounds(nx, ny)) return;

        const target = this.board.get(nx, ny);

        switch (target) {
            case ENTITY.EMPTY:
                if (this.board.isIce(nx, ny)) this.slideMouse(nx, ny, dir);
                else this.doMove(nx, ny);
                audio.playMove();
                break;

            case ENTITY.BLOCK:
                if (this.pushBlockChain(nx, ny, dir)) {
                    this.doMove(nx, ny);
                    audio.playMove();
                }
                break;

            case ENTITY.CHEESE:
                this.score += 50;
                this.doMove(nx, ny);
                this.renderer.addEffect('cheese', nx, ny, 400);
                this.renderer.addParticles('cheese', nx, ny);
                audio.playCheese();
                this.updateHUD();
                break;

            case ENTITY.CAT:
            case ENTITY.YARN:
                this.renderer.triggerShake(0.35, 300);
                this.triggerHitStop(70);
                this.playerDie();
                break;

            case ENTITY.SINKHOLE:
                this.doMove(nx, ny);
                this.playerStuck();
                audio.playWarp();
                this.renderer.addParticles('sinkhole', nx, ny);
                this.renderer.triggerShake(0.2, 220);
                break;

            case ENTITY.TRAP:
                this.renderer.addEffect('trap', nx, ny, 400);
                this.renderer.triggerShake(0.35, 300);
                this.triggerHitStop(70);
                this.board.set(nx, ny, ENTITY.EMPTY); // trap consumed
                this.playerDie();
                break;

            case ENTITY.WALL:
                // Can't move into walls
                break;
        }
    }

    doMove(nx, ny) {
        this.board.set(this.mouse.x, this.mouse.y, ENTITY.EMPTY);
        this.mouse.x = nx;
        this.mouse.y = ny;
        this.board.set(nx, ny, ENTITY.MOUSE);
    }

    // Slide the mouse across contiguous ice in the movement direction,
    // stopping on the last ice cell before a non-ice cell or the edge.
    slideMouse(nx, ny, dir) {
        const off = DIR_OFFSETS[dir];
        let x = nx, y = ny;
        while (this.board.isIce(x + off.x, y + off.y)) {
            x += off.x;
            y += off.y;
        }
        this.doMove(x, y);
    }

    playerDie() {
        this.lives--;
        audio.playDeath();
        this.renderer.addEffect('death', this.mouse.x, this.mouse.y, 600);
        this.renderer.triggerShake(0.38, 320);
        this.triggerHitStop(70);
        this.updateHUD();

        if (this.lives <= 0) {
            this.gameOver();
            return;
        }

        // Respawn mouse at a random empty location
        this.board.set(this.mouse.x, this.mouse.y, ENTITY.EMPTY);
        const spot = this.board.findRandomEmpty();
        if (spot) {
            this.mouse.x = spot.x;
            this.mouse.y = spot.y;
            this.board.set(spot.x, spot.y, ENTITY.MOUSE);
        }
    }

    playerStuck() {
        this.mouseStuck = true;
        this.renderer.addEffect('stuck', this.mouse.x, this.mouse.y, 3000);
        if (this.stuckTimer) clearTimeout(this.stuckTimer);
        this.stuckTimer = setTimeout(() => {
            this.mouseStuck = false;
        }, 3000);
    }

    // ===== BLOCK PUSHING =====

    pushBlockChain(x, y, dir) {
        const off = DIR_OFFSETS[dir];
        // Follow the chain of blocks
        let cx = x;
        let cy = y;
        let chainLength = 0;

        while (this.board.inBounds(cx, cy) && this.board.get(cx, cy) === ENTITY.BLOCK) {
            chainLength++;
            cx += off.x;
            cy += off.y;
        }

        // cx, cy is now the cell after the last block in the chain
        if (!this.board.inBounds(cx, cy)) return false; // chain hits boundary

        const endCell = this.board.get(cx, cy);

        if (endCell === ENTITY.EMPTY) {
            // Move last block to empty cell, first block disappears (mouse takes its place)
            this.board.set(cx, cy, ENTITY.BLOCK);
            this.board.set(x, y, ENTITY.EMPTY);
            audio.playPush();
            this.renderer.addParticles('dust', x, y, { dir });
            this.checkTrappedCats();
            return true;
        } else if (endCell === ENTITY.SINKHOLE) {
            // Block falls into sinkhole — both disappear
            this.board.set(cx, cy, ENTITY.EMPTY);
            this.board.set(x, y, ENTITY.EMPTY);
            audio.playPush();
            audio.playWarp();
            this.renderer.addParticles('dust', x, y, { dir });
            this.renderer.addParticles('sinkhole', cx, cy);
            this.renderer.triggerShake(0.2, 200);
            return true;
        }

        // Blocked by wall, cat, or other immovable
        return false;
    }

    // ===== CAT TRAPPING =====

    checkTrappedCats() {
        const trapped = [];

        for (let i = this.cats.length - 1; i >= 0; i--) {
            const cat = this.cats[i];
            if (this.isSurrounded(cat.x, cat.y)) {
                trapped.push(i);
            }
        }

        for (const idx of trapped) {
            const cat = this.cats[idx];
            // Turn cat into cheese
            this.board.set(cat.x, cat.y, ENTITY.CHEESE);
            this.renderer.addEffect('cheese', cat.x, cat.y, 500);
            this.renderer.addParticles('poof', cat.x, cat.y);
            this.renderer.addParticles('cheese', cat.x, cat.y);
            this.cats.splice(idx, 1);
            this.score += 100;
        }

        if (trapped.length > 0) {
            audio.playCatCaught();
            this.renderer.triggerShake(0.25, 220);
            this.triggerHitStop(60);
            this.updateHUD();
            // Check if all cats trapped
            if (this.cats.length === 0) {
                this.levelComplete();
            }
        }
    }

    isSurrounded(x, y) {
        const dirs = ['up', 'down', 'left', 'right'];
        for (const dir of dirs) {
            const nb = this.board.getNeighbor(x, y, dir);
            if (!nb) continue; // wall edge counts as blocked
            const cell = this.board.get(nb.x, nb.y);
            if (cell === ENTITY.EMPTY || cell === ENTITY.CHEESE || cell === ENTITY.SINKHOLE ||
                cell === ENTITY.TRAP || cell === ENTITY.MOUSE || cell === ENTITY.YARN) {
                return false; // has an open side
            }
        }
        return true;
    }

    // ===== CAT AI =====

    moveCats() {
        for (const cat of this.cats) {
            this.moveCat(cat);
        }
    }

    moveCat(cat) {
        // Smart chase: BFS shortest path to the mouse (navigates walls/blocks).
        const path = this.findPath(cat.x, cat.y, this.mouse.x, this.mouse.y);
        if (path && path.length >= 2) {
            const next = path[1];
            const dir = next.x > cat.x ? 'right'
                : next.x < cat.x ? 'left'
                : next.y > cat.y ? 'down' : 'up';
            this.tryCatMove(cat, dir);
            return;
        }
        // Mouse unreachable (boxed in): fall back to greedy chase
        this.greedyCatMove(cat);
    }

    greedyCatMove(cat) {
        const dx = this.mouse.x - cat.x;
        const dy = this.mouse.y - cat.y;
        let primaryDir, secondaryDir;

        if (Math.abs(dx) >= Math.abs(dy)) {
            primaryDir = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
            secondaryDir = dy > 0 ? 'down' : dy < 0 ? 'up' : null;
        } else {
            primaryDir = dy > 0 ? 'down' : dy < 0 ? 'up' : null;
            secondaryDir = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
        }

        if (primaryDir && this.tryCatMove(cat, primaryDir)) return;
        if (secondaryDir && this.tryCatMove(cat, secondaryDir)) return;

        const allDirs = ['up', 'down', 'left', 'right'];
        for (const d of allDirs) {
            if (d !== primaryDir && d !== secondaryDir && this.tryCatMove(cat, d)) return;
        }
    }

    // Breadth-first search from (sx,sy) to (tx,ty). Passable = EMPTY or the
    // MOUSE cell (the goal). Returns an array of {x,y} cells or null.
    findPath(sx, sy, tx, ty) {
        const board = this.board;
        const cols = board.cols, rows = board.rows;
        const size = cols * rows;
        const start = sy * cols + sx;
        const goal = ty * cols + tx;
        if (start === goal) return [{ x: sx, y: sy }];

        const dist = new Int32Array(size).fill(-1);
        const prev = new Int32Array(size).fill(-1);
        dist[start] = 0;
        const queue = [start];
        let head = 0;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

        while (head < queue.length) {
            const cur = queue[head++];
            if (cur === goal) break;
            const cx = cur % cols;
            const cy = (cur / cols) | 0;
            for (let i = 0; i < 4; i++) {
                const nx = cx + dirs[i][0];
                const ny = cy + dirs[i][1];
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                const cell = board.get(nx, ny);
                if (cell !== ENTITY.EMPTY && cell !== ENTITY.MOUSE) continue;
                const ni = ny * cols + nx;
                if (dist[ni] !== -1) continue;
                dist[ni] = dist[cur] + 1;
                prev[ni] = cur;
                queue.push(ni);
            }
        }
        if (dist[goal] === -1) return null;

        const path = [];
        let cur = goal;
        while (cur !== -1) {
            path.push(cur);
            if (cur === start) break;
            cur = prev[cur];
        }
        path.reverse();
        return path.map(i => ({ x: i % cols, y: (i / cols) | 0 }));
    }

    tryCatMove(cat, dir) {
        const off = DIR_OFFSETS[dir];
        const nx = cat.x + off.x;
        const ny = cat.y + off.y;

        if (!this.board.inBounds(nx, ny)) return false;

        const target = this.board.get(nx, ny);

        if (target === ENTITY.EMPTY) {
            this.board.set(cat.x, cat.y, ENTITY.EMPTY);
            cat.x = nx;
            cat.y = ny;
            this.board.set(nx, ny, ENTITY.CAT);
            return true;
        }

        if (target === ENTITY.MOUSE) {
            // Cat catches mouse
            this.playerDie();
            // Cat moves into mouse's old position
            this.board.set(cat.x, cat.y, ENTITY.EMPTY);
            cat.x = nx;
            cat.y = ny;
            this.board.set(nx, ny, ENTITY.CAT);
            return true;
        }

        return false; // blocked
    }

    // ===== YARN BALLS =====

    spawnYarn() {
        // Spawn at a random edge
        const spot = this.board.findEdgeEmpty();
        if (!spot) return;

        // Random direction
        const dirs = [
            { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
            { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
        ];
        const d = dirs[Math.floor(Math.random() * dirs.length)];

        this.yarnBalls.push({ x: spot.x, y: spot.y, dx: d.x, dy: d.y });
        this.board.set(spot.x, spot.y, ENTITY.YARN);
    }

    moveYarnBalls() {
        for (let i = this.yarnBalls.length - 1; i >= 0; i--) {
            const yarn = this.yarnBalls[i];
            const nx = yarn.x + yarn.dx;
            const ny = yarn.y + yarn.dy;

            // Remove old position
            if (this.board.get(yarn.x, yarn.y) === ENTITY.YARN) {
                this.board.set(yarn.x, yarn.y, ENTITY.EMPTY);
            }

            if (!this.board.inBounds(nx, ny)) {
                // Yarn exits the board
                this.yarnBalls.splice(i, 1);
                continue;
            }

            const target = this.board.get(nx, ny);

            if (target === ENTITY.MOUSE) {
                this.playerDie();
                this.yarnBalls.splice(i, 1);
                continue;
            }

            if (target === ENTITY.EMPTY) {
                yarn.x = nx;
                yarn.y = ny;
                this.board.set(nx, ny, ENTITY.YARN);
            } else {
                // Yarn hits something and disappears
                this.yarnBalls.splice(i, 1);
            }
        }
    }

    spawnCat() {
        const spot = this.board.findEdgeEmpty();
        if (!spot) return;
        this.cats.push({ x: spot.x, y: spot.y });
        this.board.set(spot.x, spot.y, ENTITY.CAT);
    }

    // ===== GAME STATE =====

    levelComplete() {
        this.state = 'levelcomplete';
        const bonus = 200 + (this.level * 50);
        this.score += bonus;
        this.updateHUD();
        audio.playLevelComplete();

        const isLast = this.level >= levels.length - 1;
        if (isLast) {
            setTimeout(() => {
                this.showLevelComplete();
            }, 800);
            return;
        }

        // Seamless transition with fade + brief "LEVEL N" banner instead of abrupt overlay
        this.showLevelBanner(`STAGE ${this.level + 1} CLEARED`, `LEVEL ${this.level + 1}`, `+${bonus} BONUS`);

        setTimeout(() => {
            const fade = document.getElementById('screen-fade');
            if (fade) {
                fade.classList.remove('hidden');
                fade.classList.add('active');
            }
            setTimeout(() => {
                this.level++;
                this.loadLevel(this.level);
                this.updateHUD();
                this.showLevelBanner(`STAGE ${this.level + 1}`, `LEVEL ${this.level + 1}`, 'GET READY!');
                if (fade) {
                    fade.classList.remove('active');
                    setTimeout(() => fade.classList.add('hidden'), 350);
                }
                this.state = 'playing';
            }, 400);
        }, 1300);
    }

    showLevelBanner(tag, title, sub) {
        const banner = document.getElementById('level-banner');
        const tagEl = document.getElementById('banner-tag');
        const titleEl = document.getElementById('banner-title');
        const subEl = document.getElementById('banner-sub');
        if (banner && titleEl) {
            if (tagEl) tagEl.textContent = tag;
            titleEl.textContent = title;
            if (subEl) subEl.textContent = sub;
            banner.classList.remove('hidden');
            banner.style.animation = 'none';
            void banner.offsetHeight; // trigger reflow
            banner.style.animation = '';
            setTimeout(() => {
                banner.classList.add('hidden');
            }, 1500);
        }
    }

    nextLevel() {
        if (this.level >= levels.length - 1) {
            this.restart();
            return;
        }
        this.level++;
        this.loadLevel(this.level);
        this.state = 'playing';
        this.updateHUD();
    }

    gameOver() {
        this.state = 'gameover';
        this.showGameOver();
    }

    restart() {
        this.startGame();
    }

    // ===== HUD =====

    updateHUD() {
        const scoreEl = document.getElementById('hud-score');
        const levelEl = document.getElementById('hud-level');
        const livesEl = document.getElementById('hud-lives');

        if (scoreEl) scoreEl.textContent = this.score;
        if (levelEl) levelEl.textContent = this.level + 1;
        if (livesEl) livesEl.textContent = '🐭'.repeat(Math.max(0, this.lives));
    }

    updateTimerBar(progress) {
        const bar = document.getElementById('timer-bar');
        if (bar) {
            if (progress === undefined) {
                progress = Math.max(0, 1 - (this.catSpawnTimer / this.catSpawnInterval));
            }
            bar.style.transform = `scaleX(${progress})`;
        }
    }

    // ===== OVERLAY UI =====

    showGameOver() {
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('final-level').textContent = this.level + 1;
        document.getElementById('gameover-screen').classList.remove('hidden');
    }

    hideGameOver() {
        document.getElementById('gameover-screen').classList.add('hidden');
    }

    showLevelComplete() {
        const isLast = this.level >= levels.length - 1;
        const title = document.getElementById('level-complete-title');
        const btn = document.getElementById('nextlevel-btn');
        if (title) title.textContent = isLast ? '🏆 YOU WIN! 🏆' : '🧀 LEVEL COMPLETE! 🧀';
        if (btn) btn.textContent = isLast ? 'PLAY AGAIN' : 'NEXT LEVEL';
        document.getElementById('level-score').textContent = this.score;
        document.getElementById('levelcomplete-screen').classList.remove('hidden');
    }

    hideLevelComplete() {
        document.getElementById('levelcomplete-screen').classList.add('hidden');
    }

    showStartScreen() {
        document.getElementById('start-screen').classList.remove('hidden');
    }

    hideStartScreen() {
        document.getElementById('start-screen').classList.add('hidden');
    }
}
