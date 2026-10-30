// ============================================
// Rodent's Revenge — Three.js 3D Renderer (top-down, slight angle)
// ============================================
// A "board game diorama" view: perspective camera high above the board,
// tilted at a slight angle so characters show their faces, with real
// height, soft shadows and a warm 90s-arcade palette.
// ============================================
import * as THREE from 'three';
import { ENTITY } from './entities.js';

const CELL = 1;                       // world units per tile
const CAMERA_ELEVATION = 62 * Math.PI / 180; // angle above the horizon (slight tilt from top-down)
const VIEW_FILL = 0.96;              // fraction of the viewport the board should fill

// ---- 90s retro arcade palette (warm & friendly, not neon) ----
const COLORS = {
    bg: '#161a24',
    frame: '#0f1119',
    floorA: '#2f3a55',
    floorB: '#38435f',
    grid: '#222b40',
    wall: '#575a6e',
    block: '#d0653f',
    mouse: '#f4c63f',
    mouseDark: '#cfa231',
    cat: '#2b2533',
    catDark: '#181320',
    catCream: '#f7d7b0',
    cheese: '#ffd23f',
    sinkholeRim: '#7b4fb0',
    sinkhole: '#120d1c',
    trap: '#d23c4a',
    trapDark: '#7c1f28',
    yarn: '#e0619e',
    yarnDark: '#b83e80',
    eye: '#1a1a1a',
    white: '#f5f0e6',
    pink: '#ef9bb0',
};

// Default environment theme (per-level themes override via setBoard)
const DEFAULT_THEME = { bg: '#161a24', frame: '#0f1119', floorA: '#2f3a55', floorB: '#38435f', grid: '#222b40' };

function stdMaterial(color, roughness = 0.72) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

// Shared material cache (one per color string) to avoid duplicates
const matCache = new Map();
function mat(color, roughness = 0.72) {
    const key = color + '|' + roughness;
    if (!matCache.has(key)) matCache.set(key, stdMaterial(color, roughness));
    return matCache.get(key);
}

function shadeMeshes(root, on = true) {
    root.traverse(o => {
        if (o.isMesh) { o.castShadow = on; o.receiveShadow = on; }
    });
}

export class Renderer {
    constructor(canvas, board, theme) {
        this.canvas = canvas;

        // --- WebGL renderer ---
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // --- scene ---
        this.scene = new THREE.Scene();

        // --- camera ---
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 250);
        this.baseCameraPos = new THREE.Vector3();

        // Screen shake state
        this.shakeTime = 0;
        this.shakeDuration = 0;
        this.shakeIntensity = 0;

        // --- lights ---
        this.scene.add(new THREE.AmbientLight(0xdfe6f2, 1.0));
        const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4a3a28, 0.55);
        this.scene.add(hemi);
        this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
        this.sun.position.set(-12, 22, 10);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.left = -16;
        this.sun.shadow.camera.right = 16;
        this.sun.shadow.camera.top = 16;
        this.sun.shadow.camera.bottom = -16;
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 70;
        this.sun.shadow.bias = -0.0004;
        this.scene.add(this.sun);

        // --- containers ---
        this.floorGroup = new THREE.Group();
        this.iceGroup = new THREE.Group();
        this.entities = new THREE.Group();
        this.particleGroup = new THREE.Group();
        this.scene.add(this.floorGroup);
        this.scene.add(this.iceGroup);
        this.scene.add(this.entities);
        this.scene.add(this.particleGroup);

        // --- per-frame bookkeeping ---
        this.staticMeshes = new Map();   // 'x,y' -> {mesh, x, y, type, born}
        this.catMeshes = new Map();      // cat object -> {mesh, target}
        this.yarnMeshes = new Map();     // yarn object -> {mesh, target}
        this.mouseMesh = null;           // {mesh, target}
        this.activeFx = [];              // transient ring/spark effects
        this.particles = [];             // physics particles
        this.sinkholeCoords = [];        // cached sinkhole [x, y] list
        this.lastSinkholeSwirl = 0;
        this.last = performance.now();

        this.setBoard(board, theme);
        this.resize();
    }

    // ------------------------------------------------------------
    // Board lifecycle
    // ------------------------------------------------------------
    setBoard(board, theme) {
        this.board = board;
        this.theme = theme || DEFAULT_THEME;
        this.scene.background = new THREE.Color(this.theme.bg);
        this.clearEntities();
        this.clearParticles();
        this.cacheSinkholes();
        this.buildFloor();
        this.buildIceTiles();
        this.fitCamera();
    }

    cacheSinkholes() {
        this.sinkholeCoords = [];
        if (!this.board) return;
        for (let x = 0; x < this.board.cols; x++) {
            for (let y = 0; y < this.board.rows; y++) {
                if (this.board.get(x, y) === ENTITY.SINKHOLE) {
                    this.sinkholeCoords.push({ x, y });
                }
            }
        }
    }

    clearEntities() {
        const dispose = (obj) => {
            obj.traverse(o => {
                if (o.isMesh || o.isLine) {
                    o.geometry && o.geometry.dispose();
                }
            });
            this.entities.remove(obj);
        };
        this.staticMeshes.forEach(rec => dispose(rec.mesh));
        this.catMeshes.forEach(rec => dispose(rec.mesh));
        this.yarnMeshes.forEach(rec => dispose(rec.mesh));
        if (this.mouseMesh) dispose(this.mouseMesh.mesh);
        if (this.stuckRing) { dispose(this.stuckRing); this.stuckRing = null; }
        this.activeFx.forEach(f => dispose(f.mesh));
        this.staticMeshes.clear();
        this.catMeshes.clear();
        this.yarnMeshes.clear();
        this.mouseMesh = null;
        this.activeFx = [];
    }

    clearParticles() {
        while (this.particleGroup.children.length > 0) {
            const p = this.particleGroup.children.pop();
            if (p.geometry) p.geometry.dispose();
            if (p.material && p.material.dispose) p.material.dispose();
        }
        this.particles = [];
    }

    buildFloor() {
        while (this.floorGroup.children.length) {
            const c = this.floorGroup.children.pop();
            c.geometry && c.geometry.dispose();
        }
        if (this.floorTexture) { this.floorTexture.dispose(); this.floorTexture = null; }
        if (this.floorMaterial) { this.floorMaterial.dispose(); this.floorMaterial = null; }

        const cols = this.board.cols;
        const rows = this.board.rows;

        // --- frame / border (slightly larger, below) ---
        const frame = new THREE.Mesh(
            new THREE.PlaneGeometry((cols + 1.2) * CELL, (rows + 1.2) * CELL),
            mat(this.theme.frame, 0.9)
        );
        frame.rotation.x = -Math.PI / 2;
        frame.position.y = -0.02;
        frame.receiveShadow = true;
        this.floorGroup.add(frame);

        // --- checkerboard floor (canvas texture) ---
        const texel = 40;
        const cv = document.createElement('canvas');
        cv.width = cols * texel;
        cv.height = rows * texel;
        const g = cv.getContext('2d');
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                g.fillStyle = (x + y) % 2 === 0 ? this.theme.floorA : this.theme.floorB;
                g.fillRect(x * texel, y * texel, texel, texel);
            }
        }
        g.strokeStyle = this.theme.grid;
        g.lineWidth = 2;
        for (let x = 0; x <= cols; x++) {
            g.beginPath(); g.moveTo(x * texel, 0); g.lineTo(x * texel, cv.height); g.stroke();
        }
        for (let y = 0; y <= rows; y++) {
            g.beginPath(); g.moveTo(0, y * texel); g.lineTo(cv.width, y * texel); g.stroke();
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        this.floorTexture = tex;
        this.floorMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(cols * CELL, rows * CELL),
            this.floorMaterial
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.floorGroup.add(floor);
    }

    // ------------------------------------------------------------
    // Ice (floor overlay)
    // ------------------------------------------------------------
    buildIceTiles() {
        while (this.iceGroup.children.length) {
            const c = this.iceGroup.children.pop();
            c.geometry && c.geometry.dispose();
        }
        if (!this.board.ice) return;
        for (const key of this.board.ice) {
            const [x, y] = key.split(',').map(Number);
            const tile = this.buildIceTile();
            const pos = this.cellPos(x, y);
            tile.position.set(pos.x, 0, pos.z);
            this.iceGroup.add(tile);
        }
    }

    buildIceTile() {
        const tile = new THREE.Mesh(
            new THREE.BoxGeometry(CELL * 0.96, 0.045, CELL * 0.96),
            new THREE.MeshStandardMaterial({
                color: 0xb3e4f2, roughness: 0.15, metalness: 0.2,
                emissive: 0x0a2a38, emissiveIntensity: 0.3,
            })
        );
        tile.position.y = 0.02;
        tile.receiveShadow = true;
        return tile;
    }

    // ------------------------------------------------------------
    // Camera & Screen Shake
    // ------------------------------------------------------------
    fitCamera() {
        const cols = this.board.cols;
        const rows = this.board.rows;
        const hw = cols * CELL * 0.5;
        const hd = rows * CELL * 0.5;
        const elev = CAMERA_ELEVATION;
        const corners = [
            new THREE.Vector3(-hw, 0, -hd),
            new THREE.Vector3(hw, 0, -hd),
            new THREE.Vector3(hw, 0, hd),
            new THREE.Vector3(-hw, 0, hd),
        ];
        let lo = 4, hi = 400;
        for (let i = 0; i < 45; i++) {
            const D = (lo + hi) / 2;
            this.camera.position.set(0, Math.sin(elev) * D, Math.cos(elev) * D);
            this.camera.lookAt(0, 0, 0);
            this.camera.updateProjectionMatrix();
            this.camera.updateMatrixWorld();
            let fits = true;
            for (const c of corners) {
                const v = c.clone().project(this.camera);
                if (Math.abs(v.x) > VIEW_FILL || Math.abs(v.y) > VIEW_FILL) { fits = false; break; }
            }
            if (fits) hi = D; else lo = D;
        }
        const D = hi;
        this.camera.position.set(0, Math.sin(elev) * D, Math.cos(elev) * D);
        this.camera.lookAt(0, 0, 0);
        this.camera.near = Math.max(0.05, D * 0.05);
        this.camera.far = D * 6;
        this.camera.updateProjectionMatrix();
        this.baseCameraPos.copy(this.camera.position);
    }

    triggerShake(intensity = 0.25, duration = 250) {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
        this.shakeTime = duration;
    }

    resize() {
        const container = this.canvas.parentElement || this.canvas;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.fitCamera();
    }

    // ------------------------------------------------------------
    // Coordinate mapping
    // ------------------------------------------------------------
    cellPos(x, y) {
        const wx = (x - this.board.cols / 2 + 0.5) * CELL;
        const wz = (y - this.board.rows / 2 + 0.5) * CELL;
        return new THREE.Vector3(wx, 0, wz);
    }

    // ------------------------------------------------------------
    // Entity mesh builders
    // ------------------------------------------------------------
    buildWall() {
        const m = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.97, 0.95, CELL * 0.97), mat(COLORS.wall));
        m.position.y = 0.475;
        shadeMeshes(m);
        return m;
    }

    buildBlock() {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.84, 0.62, CELL * 0.84), mat(COLORS.block));
        box.position.y = 0.31;
        g.add(box);
        const band = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.86, 0.12, CELL * 0.86), mat('#b85434', 0.6));
        band.position.y = 0.31;
        g.add(band);
        shadeMeshes(g);
        return g;
    }

    buildMouse() {
        const g = new THREE.Group();
        const gold = mat(COLORS.mouse);
        // body (small chibi body)
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.30, 24, 18), gold);
        body.scale.set(0.95, 0.8, 1.05);
        body.position.y = 0.30;
        g.add(body);
        // head (bigger, sits atop body for a heroic chibi look)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), gold);
        head.scale.set(0.95, 0.85, 1.0);
        head.position.y = 0.52;
        g.add(head);
        // big round ears
        const earGeo = new THREE.SphereGeometry(0.16, 16, 12);
        const earL = new THREE.Mesh(earGeo, gold); earL.position.set(-0.2, 0.68, -0.05); g.add(earL);
        const earR = new THREE.Mesh(earGeo, gold); earR.position.set(0.2, 0.68, -0.05); g.add(earR);
        const innerGeo = new THREE.SphereGeometry(0.085, 12, 10);
        const il = new THREE.Mesh(innerGeo, mat(COLORS.pink)); il.position.set(-0.2, 0.68, 0.02); g.add(il);
        const ir = new THREE.Mesh(innerGeo, mat(COLORS.pink)); ir.position.set(0.2, 0.68, 0.02); g.add(ir);
        // big expressive eyes
        const scleraG = new THREE.SphereGeometry(0.07, 12, 10);
        const sclera = mat(COLORS.white, 0.3);
        const el = new THREE.Mesh(scleraG, sclera); el.position.set(-0.09, 0.54, 0.20); g.add(el);
        const er = new THREE.Mesh(scleraG, sclera); er.position.set(0.09, 0.54, 0.20); g.add(er);
        const pupilG = new THREE.SphereGeometry(0.035, 10, 8);
        const pupil = mat(COLORS.eye, 0.2);
        const pl = new THREE.Mesh(pupilG, pupil); pl.position.set(-0.09, 0.54, 0.27); g.add(pl);
        const pr = new THREE.Mesh(pupilG, pupil); pr.position.set(0.09, 0.54, 0.27); g.add(pr);
        const hlG = new THREE.SphereGeometry(0.014, 8, 6);
        const hl = mat(COLORS.white, 0.1);
        const hll = new THREE.Mesh(hlG, hl); hll.position.set(-0.075, 0.56, 0.29); g.add(hll);
        const hlr = new THREE.Mesh(hlG, hl); hlr.position.set(0.105, 0.56, 0.29); g.add(hlr);
        // rosy cheeks
        const cheekG = new THREE.SphereGeometry(0.04, 10, 8);
        const blush = mat('#f2a0b0', 0.5);
        const cl = new THREE.Mesh(cheekG, blush); cl.position.set(-0.17, 0.46, 0.17); g.add(cl);
        const cr = new THREE.Mesh(cheekG, blush); cr.position.set(0.17, 0.46, 0.17); g.add(cr);
        // smile
        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12, Math.PI), mat(COLORS.eye, 0.35));
        smile.rotation.z = Math.PI;
        smile.position.set(0, 0.44, 0.23);
        g.add(smile);
        // nose
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mat(COLORS.pink, 0.5));
        nose.position.set(0, 0.49, 0.23);
        g.add(nose);
        // ahoge curl
        const ahoge = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 12, Math.PI * 1.2), gold);
        ahoge.position.set(0, 0.76, -0.02);
        g.add(ahoge);
        // tail
        const tail = new THREE.Mesh(
            new THREE.TorusGeometry(0.15, 0.045, 8, 14, Math.PI * 1.1),
            mat(COLORS.mouseDark)
        );
        tail.rotation.x = Math.PI * 0.85;
        tail.position.set(0, 0.34, -0.32);
        g.add(tail);

        g.userData = {
            eyes: [el, er, pl, pr, hll, hlr],
            tail: tail,
            ahoge: ahoge
        };

        shadeMeshes(g);
        return g;
    }

    buildCat() {
        const g = new THREE.Group();
        const fur = mat(COLORS.cat);
        const furDark = mat(COLORS.catDark);
        // body
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 18), fur);
        body.scale.set(0.95, 0.82, 1.15);
        body.position.y = 0.36;
        g.add(body);
        // head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), fur);
        head.scale.set(1.0, 0.88, 0.95);
        head.position.y = 0.58;
        g.add(head);
        // big sharp ears
        const earGeo = new THREE.ConeGeometry(0.18, 0.4, 4);
        const earL = new THREE.Mesh(earGeo, fur); earL.position.set(-0.2, 0.82, -0.06); earL.rotation.z = 0.18; g.add(earL);
        const earR = new THREE.Mesh(earGeo, fur); earR.position.set(0.2, 0.82, -0.06); earR.rotation.z = -0.18; g.add(earR);
        // glowing red predator eyes
        const eyeGlow = new THREE.MeshStandardMaterial({
            color: 0xff3b30, emissive: 0xff180e, emissiveIntensity: 1.7, roughness: 0.3, metalness: 0,
        });
        const eyeG = new THREE.SphereGeometry(0.06, 12, 10);
        const el = new THREE.Mesh(eyeG, eyeGlow); el.position.set(-0.12, 0.60, 0.22); g.add(el);
        const er = new THREE.Mesh(eyeG, eyeGlow); er.position.set(0.12, 0.60, 0.22); g.add(er);
        // slitted pupils
        const slitG = new THREE.SphereGeometry(0.03, 8, 8);
        const slit = mat(COLORS.eye, 0.2);
        const pl = new THREE.Mesh(slitG, slit); pl.scale.set(0.45, 1.8, 0.45); pl.position.set(-0.12, 0.60, 0.28); g.add(pl);
        const pr = new THREE.Mesh(slitG, slit); pr.scale.set(0.45, 1.8, 0.45); pr.position.set(0.12, 0.60, 0.28); g.add(pr);
        // angry slanted brows
        const browG = new THREE.BoxGeometry(0.13, 0.028, 0.03);
        const brow = mat('#453e50', 0.4);
        const bl = new THREE.Mesh(browG, brow); bl.position.set(-0.14, 0.71, 0.22); bl.rotation.z = -0.5; g.add(bl);
        const br = new THREE.Mesh(browG, brow); br.position.set(0.14, 0.71, 0.22); br.rotation.z = 0.5; g.add(br);
        // muzzle with fangs
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mat(COLORS.catCream));
        muzzle.scale.set(1, 0.6, 0.7);
        muzzle.position.set(0, 0.47, 0.20);
        g.add(muzzle);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mat(COLORS.trapDark, 0.4));
        nose.position.set(0, 0.50, 0.30); g.add(nose);
        const fangG = new THREE.ConeGeometry(0.03, 0.1, 6);
        const fang = mat(COLORS.white, 0.3);
        const fl = new THREE.Mesh(fangG, fang); fl.position.set(-0.05, 0.41, 0.28); fl.rotation.x = Math.PI; g.add(fl);
        const fr = new THREE.Mesh(fangG, fang); fr.position.set(0.05, 0.41, 0.28); fr.rotation.x = Math.PI; g.add(fr);
        // tail
        const tail = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.05, 8, 14, Math.PI * 1.2),
            furDark
        );
        tail.rotation.x = Math.PI * 0.8;
        tail.position.set(0, 0.4, -0.38);
        g.add(tail);

        g.userData = {
            eyes: [el, er, pl, pr],
            tail: tail
        };

        shadeMeshes(g);
        return g;
    }

    buildCheese() {
        const g = new THREE.Group();
        const wedge = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.42, 0.28, 3),
            mat(COLORS.cheese, 0.55)
        );
        wedge.rotation.y = Math.PI / 6;
        wedge.position.y = 0.14;
        g.add(wedge);
        shadeMeshes(g);
        return g;
    }

    buildSinkhole() {
        const g = new THREE.Group();
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 24), mat(COLORS.sinkholeRim, 0.5));
        rim.position.y = 0.04; g.add(rim);
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 24), mat(COLORS.sinkhole, 0.4));
        hole.position.y = 0.02; g.add(hole);
        shadeMeshes(g);
        return g;
    }

    buildTrap() {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.52), mat(COLORS.trapDark));
        base.position.y = 0.035; g.add(base);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.52), mat('#c9c2b4', 0.4));
        bar.position.set(-0.24, 0.12, 0); g.add(bar);
        const beacon = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 4), mat(COLORS.trap));
        beacon.position.set(0.22, 0.16, 0); g.add(beacon);
        shadeMeshes(g);
        return g;
    }

    buildYarn() {
        const g = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), mat(COLORS.yarn, 0.5));
        ball.position.y = 0.3; g.add(ball);
        const thread = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), mat(COLORS.yarnDark, 0.5));
        thread.rotation.x = Math.PI / 2;
        thread.position.y = 0.3;
        g.add(thread);
        shadeMeshes(g);
        return g;
    }

    buildForType(type) {
        switch (type) {
            case ENTITY.WALL: return this.buildWall();
            case ENTITY.BLOCK: return this.buildBlock();
            case ENTITY.MOUSE: return this.buildMouse();
            case ENTITY.CAT: return this.buildCat();
            case ENTITY.CHEESE: return this.buildCheese();
            case ENTITY.SINKHOLE: return this.buildSinkhole();
            case ENTITY.TRAP: return this.buildTrap();
            case ENTITY.YARN: return this.buildYarn();
            default: return null;
        }
    }

    staticType(type) {
        return type === ENTITY.WALL || type === ENTITY.BLOCK || type === ENTITY.CHEESE ||
            type === ENTITY.SINKHOLE || type === ENTITY.TRAP || type === ENTITY.YARN;
    }

    // ------------------------------------------------------------
    // Effects & Particles
    // ------------------------------------------------------------
    addEffect(type, x, y, duration = 480) {
        let color = 0xffd23f;
        if (type === 'death' || type === 'trap') color = 0xff4060;
        else if (type === 'stuck') return;

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.25, 0.38, 32),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        const pos = this.cellPos(x, y);
        pos.y = 0.06;
        ring.position.copy(pos);
        this.entities.add(ring);
        this.activeFx.push({ mesh: ring, born: performance.now(), duration, kind: 'ring' });
    }

    /** Burst particles of various types */
    addParticles(type, x, y, options = {}) {
        const center = this.cellPos(x, y);
        const count = options.count || (type === 'cheese' ? 9 : type === 'dust' ? 7 : type === 'poof' ? 12 : 10);

        for (let i = 0; i < count; i++) {
            let mesh, vx, vy, vz, maxLife, gravity = -9.8, drag = 0.95;

            if (type === 'cheese') {
                // Golden cheese crumbs popping upward and outward
                const size = 0.04 + Math.random() * 0.04;
                mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat(COLORS.cheese, 0.5));
                mesh.position.set(center.x + (Math.random() - 0.5) * 0.3, 0.22, center.z + (Math.random() - 0.5) * 0.3);
                const angle = Math.random() * Math.PI * 2;
                const spd = 1.2 + Math.random() * 2.2;
                vx = Math.cos(angle) * spd;
                vy = 2.2 + Math.random() * 2.5;
                vz = Math.sin(angle) * spd;
                maxLife = 400 + Math.random() * 200;
            } else if (type === 'dust') {
                // Low floor dust puffed around block push
                const r = 0.05 + Math.random() * 0.04;
                const dMat = new THREE.MeshStandardMaterial({
                    color: 0x8a7f72, transparent: true, opacity: 0.7, roughness: 0.9
                });
                mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), dMat);
                mesh.position.set(center.x + (Math.random() - 0.5) * 0.4, 0.08, center.z + (Math.random() - 0.5) * 0.4);
                const angle = Math.random() * Math.PI * 2;
                const spd = 0.8 + Math.random() * 1.4;
                vx = Math.cos(angle) * spd;
                vy = 0.4 + Math.random() * 0.6;
                vz = Math.sin(angle) * spd;
                gravity = -1.2;
                maxLife = 320 + Math.random() * 150;
            } else if (type === 'poof') {
                // Cartoon cloud puff spheres for trapped cat
                const r = 0.10 + Math.random() * 0.09;
                const pMat = new THREE.MeshStandardMaterial({
                    color: 0xf5f0e6, transparent: true, opacity: 0.85, roughness: 0.4
                });
                mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), pMat);
                mesh.position.set(center.x + (Math.random() - 0.5) * 0.25, 0.3 + (Math.random() - 0.5) * 0.2, center.z + (Math.random() - 0.5) * 0.25);
                const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                const spd = 1.4 + Math.random() * 1.8;
                vx = Math.cos(angle) * spd;
                vy = 1.0 + Math.random() * 1.5;
                vz = Math.sin(angle) * spd;
                gravity = -1.5;
                maxLife = 420 + Math.random() * 180;
            } else if (type === 'sinkhole') {
                // Violet vortex particles spiraling into sinkhole
                const r = 0.04 + Math.random() * 0.03;
                const sMat = new THREE.MeshBasicMaterial({
                    color: 0x9b5de5, transparent: true, opacity: 0.85
                });
                mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), sMat);
                const initAngle = Math.random() * Math.PI * 2;
                const initRadius = 0.38 + Math.random() * 0.15;
                mesh.position.set(center.x + Math.cos(initAngle) * initRadius, 0.12, center.z + Math.sin(initAngle) * initRadius);
                vx = -Math.cos(initAngle) * 0.8 - Math.sin(initAngle) * 1.5;
                vy = -0.4;
                vz = -Math.sin(initAngle) * 0.8 + Math.cos(initAngle) * 1.5;
                gravity = -0.8;
                maxLife = 450;
            }

            if (mesh) {
                this.particleGroup.add(mesh);
                this.particles.push({
                    mesh, vx, vy, vz, gravity, drag,
                    born: performance.now(),
                    maxLife,
                    type,
                    initScale: mesh.scale.x
                });
            }
        }
    }

    updateParticles(now, dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const age = now - p.born;
            const prog = age / p.maxLife;

            if (prog >= 1) {
                this.particleGroup.remove(p.mesh);
                p.mesh.geometry && p.mesh.geometry.dispose();
                p.mesh.material && p.mesh.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }

            // Physics update
            p.vy += p.gravity * dt;
            p.vx *= Math.pow(p.drag, dt * 60);
            p.vz *= Math.pow(p.drag, dt * 60);

            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += p.vz * dt;

            // Don't let particles fall endlessly below floor
            if (p.mesh.position.y < 0.02 && p.type !== 'sinkhole') {
                p.mesh.position.y = 0.02;
                p.vy = -p.vy * 0.3; // tiny bounce
                p.vx *= 0.7;
                p.vz *= 0.7;
            }

            // Eased scale and fade
            const easeOut = 1 - Math.pow(1 - prog, 2);
            if (p.type === 'poof') {
                const s = p.initScale * (0.8 + easeOut * 1.4);
                p.mesh.scale.setScalar(s);
            } else if (p.type === 'dust') {
                const s = p.initScale * (0.6 + easeOut * 1.2);
                p.mesh.scale.setScalar(s);
            } else {
                const s = p.initScale * (1 - prog * 0.7);
                p.mesh.scale.setScalar(s);
            }

            if (p.mesh.material) {
                p.mesh.material.opacity = Math.max(0, 0.9 * (1 - prog));
            }
        }

        // Ambient gentle swirling on sinkholes
        if (this.sinkholeCoords.length > 0 && now - this.lastSinkholeSwirl > 160) {
            this.lastSinkholeSwirl = now;
            for (const s of this.sinkholeCoords) {
                if (Math.random() < 0.45) {
                    this.addParticles('sinkhole', s.x, s.y, { count: 1 });
                }
            }
        }
    }

    // ------------------------------------------------------------
    // Per-frame sync + render
    // ------------------------------------------------------------
    render(state) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;

        // Apply screen shake decay
        if (this.shakeTime > 0) {
            this.shakeTime -= dt * 1000;
            const p = Math.max(0, this.shakeTime / this.shakeDuration);
            const ox = (Math.random() * 2 - 1) * this.shakeIntensity * p;
            const oy = (Math.random() * 2 - 1) * this.shakeIntensity * p;
            this.camera.position.set(
                this.baseCameraPos.x + ox,
                this.baseCameraPos.y + oy,
                this.baseCameraPos.z
            );
        } else if (this.baseCameraPos.lengthSq() > 0) {
            this.camera.position.copy(this.baseCameraPos);
        }

        this.syncStatic(now);
        this.syncMouse(state, dt);
        this.syncCats(state, dt);
        this.syncYarn(state, dt);
        this.updateFx(now, dt);
        this.updateParticles(now, dt);
        this.updateStuckRing(state, now);

        this.renderer.render(this.scene, this.camera);
    }

    removeStatic(key) {
        const rec = this.staticMeshes.get(key);
        if (!rec) return;
        rec.mesh.traverse(o => { if (o.isMesh) { o.geometry && o.geometry.dispose(); } });
        this.entities.remove(rec.mesh);
        this.staticMeshes.delete(key);
    }

    syncStatic(now) {
        const board = this.board;
        for (const [key, rec] of this.staticMeshes) {
            const [x, y] = key.split(',').map(Number);
            if (board.get(x, y) !== rec.type) this.removeStatic(key);
        }
        for (let x = 0; x < board.cols; x++) {
            for (let y = 0; y < board.rows; y++) {
                const t = board.get(x, y);
                if (!this.staticType(t)) continue;
                const key = x + ',' + y;
                if (!this.staticMeshes.has(key)) {
                    const mesh = this.buildForType(t);
                    const pos = this.cellPos(x, y);
                    mesh.position.set(pos.x, 0, pos.z);
                    this.entities.add(mesh);
                    this.staticMeshes.set(key, { mesh, x, y, type: t, born: now });
                }
            }
        }
        this.staticMeshes.forEach(rec => {
            const age = (now - rec.born) / 1000;
            const s = age < 0.16 ? 0.6 + 0.4 * (age / 0.16) : 1;
            rec.mesh.scale.setScalar(s);
        });
    }

    glideTo(rec, target, dt, k, isMouse = false) {
        if (!rec.lastTarget) rec.lastTarget = target.clone();
        if (!rec.startPos) rec.startPos = rec.mesh.position.clone();

        // Detect new move destination
        if (rec.lastTarget.distanceTo(target) > 0.05) {
            rec.startPos.copy(rec.mesh.position);
            rec.totalDist = Math.max(0.2, rec.startPos.distanceTo(target));
            rec.lastTarget.copy(target);

            // Compute facing rotation vector
            const dx = target.x - rec.startPos.x;
            const dz = target.z - rec.startPos.z;
            if (Math.hypot(dx, dz) > 0.05) {
                rec.targetRotY = Math.atan2(dx, dz);
            }
        }

        // Snap for large jumps (respawn teleport)
        if (rec.mesh.position.distanceTo(target) > 4 * CELL) {
            rec.mesh.position.copy(target);
            rec.startPos.copy(target);
            rec.lastTarget.copy(target);
            return;
        }

        const t = 1 - Math.exp(-dt * k);
        rec.mesh.position.x += (target.x - rec.mesh.position.x) * t;
        rec.mesh.position.z += (target.z - rec.mesh.position.z) * t;

        const distRemaining = Math.hypot(target.x - rec.mesh.position.x, target.z - rec.mesh.position.z);
        const moving = distRemaining > 0.025;

        // Rotate character toward movement vector (shortest angular distance)
        if (rec.targetRotY !== undefined) {
            if (rec.currentRotY === undefined) rec.currentRotY = rec.mesh.rotation.y;
            let diff = rec.targetRotY - rec.currentRotY;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            rec.currentRotY += diff * (1 - Math.exp(-dt * 15));
            rec.mesh.rotation.y = rec.currentRotY;
        }

        const now = performance.now();

        if (moving) {
            // Smooth sine hop arc (zero sharp floor bounce!)
            const total = rec.totalDist || CELL;
            const prog = Math.max(0, Math.min(1, 1 - distRemaining / total));
            const maxHop = isMouse ? 0.22 : 0.14;
            rec.mesh.position.y = Math.sin(prog * Math.PI) * maxHop;

            // Squash on move-start, stretch mid-glide, ease to rest
            let targetSy = 1;
            let targetSxz = 1;
            if (prog < 0.22) {
                const p = Math.sin((prog / 0.22) * Math.PI);
                targetSy = 1 - 0.14 * p;
                targetSxz = 1 + 0.08 * p;
            } else if (prog < 0.85) {
                const p = Math.sin(((prog - 0.22) / 0.63) * Math.PI);
                targetSy = 1 + 0.16 * p;
                targetSxz = 1 - 0.08 * p;
            }
            const scaleLerp = 1 - Math.exp(-dt * 18);
            rec.mesh.scale.y += (targetSy - rec.mesh.scale.y) * scaleLerp;
            rec.mesh.scale.x += (targetSxz - rec.mesh.scale.x) * scaleLerp;
            rec.mesh.scale.z += (targetSxz - rec.mesh.scale.z) * scaleLerp;

            // Restore eyes if previously blinking
            if (rec.mesh.userData && rec.mesh.userData.eyes) {
                rec.mesh.userData.eyes.forEach(e => { e.scale.y = 1; });
            }
        } else {
            // Idle life: subtle bob + breathing
            const bobSeed = rec.bobSeed || (rec.bobSeed = Math.random() * 10);
            const idleBob = Math.sin(now * 0.004 + bobSeed) * 0.02;
            rec.mesh.position.y = idleBob;

            const targetSy = 1 + idleBob * 0.5;
            const targetSxz = 1 - idleBob * 0.25;
            const scaleLerp = 1 - Math.exp(-dt * 10);
            rec.mesh.scale.y += (targetSy - rec.mesh.scale.y) * scaleLerp;
            rec.mesh.scale.x += (targetSxz - rec.mesh.scale.x) * scaleLerp;
            rec.mesh.scale.z += (targetSxz - rec.mesh.scale.z) * scaleLerp;

            // Tail wag
            if (rec.mesh.userData && rec.mesh.userData.tail) {
                rec.mesh.userData.tail.rotation.z = Math.sin(now * 0.005 + bobSeed) * 0.14;
            }

            // Occasional blink
            if (rec.mesh.userData && rec.mesh.userData.eyes) {
                if (!rec.nextBlink) rec.nextBlink = now + 1500 + Math.random() * 3000;
                if (now > rec.nextBlink) {
                    const blinkAge = now - rec.nextBlink;
                    if (blinkAge < 120) {
                        const blinkP = Math.sin((blinkAge / 120) * Math.PI);
                        rec.mesh.userData.eyes.forEach(e => {
                            e.scale.y = Math.max(0.08, 1 - 0.92 * blinkP);
                        });
                    } else {
                        rec.mesh.userData.eyes.forEach(e => { e.scale.y = 1; });
                        rec.nextBlink = now + 2500 + Math.random() * 4000;
                    }
                }
            }
        }
    }

    syncMouse(state, dt) {
        const m = state.mouse;
        if (!m) return;
        if (!this.mouseMesh) {
            this.mouseMesh = { mesh: this.buildMouse(), target: new THREE.Vector3() };
            this.entities.add(this.mouseMesh.mesh);
        }
        const target = this.cellPos(m.x, m.y);
        this.glideTo(this.mouseMesh, target, dt, 14, true);
    }

    syncCats(state, dt) {
        const cats = state.cats || [];
        for (const [catObj, rec] of this.catMeshes) {
            if (!cats.includes(catObj)) {
                rec.mesh.traverse(o => { if (o.isMesh) o.geometry && o.geometry.dispose(); });
                this.entities.remove(rec.mesh);
                this.catMeshes.delete(catObj);
            }
        }
        for (const cat of cats) {
            if (!this.catMeshes.has(cat)) {
                const mesh = this.buildCat();
                this.entities.add(mesh);
                this.catMeshes.set(cat, { mesh, target: new THREE.Vector3() });
            }
            const rec = this.catMeshes.get(cat);
            const target = this.cellPos(cat.x, cat.y);
            this.glideTo(rec, target, dt, 9, false);
        }
    }

    syncYarn(state, dt) {
        const yarns = state.yarnBalls || [];
        for (const [yObj, rec] of this.yarnMeshes) {
            if (!yarns.includes(yObj)) {
                rec.mesh.traverse(o => { if (o.isMesh) o.geometry && o.geometry.dispose(); });
                this.entities.remove(rec.mesh);
                this.yarnMeshes.delete(yObj);
            }
        }
        for (const y of yarns) {
            if (!this.yarnMeshes.has(y)) {
                const mesh = this.buildYarn();
                this.entities.add(mesh);
                this.yarnMeshes.set(y, { mesh, target: new THREE.Vector3() });
            }
            const rec = this.yarnMeshes.get(y);
            const target = this.cellPos(y.x, y.y);
            this.glideTo(rec, target, dt, 11, false);
        }
    }

    updateFx(now, dt) {
        for (let i = this.activeFx.length - 1; i >= 0; i--) {
            const f = this.activeFx[i];
            const prog = (now - f.born) / f.duration;
            if (prog >= 1) {
                this.entities.remove(f.mesh);
                f.mesh.geometry.dispose();
                f.mesh.material.dispose();
                this.activeFx.splice(i, 1);
                continue;
            }
            // Cubic ease-out on ring effects instead of linear scale
            const easeOut = 1 - Math.pow(1 - prog, 3);
            const s = 0.4 + easeOut * 2.2;
            f.mesh.scale.setScalar(s);
            f.mesh.material.opacity = Math.max(0, 0.95 * (1 - easeOut));
        }
    }

    updateStuckRing(state, now) {
        if (!state.mouseStuck || !this.mouseMesh) {
            if (this.stuckRing) { this.entities.remove(this.stuckRing); this.stuckRing.geometry.dispose(); this.stuckRing.material.dispose(); this.stuckRing = null; }
            return;
        }
        if (!this.stuckRing) {
            this.stuckRing = new THREE.Mesh(
                new THREE.RingGeometry(0.42, 0.5, 32),
                new THREE.MeshBasicMaterial({ color: 0x8a5ae0, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
            );
            this.stuckRing.rotation.x = -Math.PI / 2;
            this.entities.add(this.stuckRing);
        }
        this.stuckRing.position.copy(this.mouseMesh.mesh.position);
        this.stuckRing.position.y = 0.05;
        const pulse = 0.5 + Math.sin(now * 0.01) * 0.5;
        this.stuckRing.material.opacity = 0.25 + pulse * 0.45;
        this.stuckRing.scale.setScalar(0.8 + pulse * 0.35);
    }
}
