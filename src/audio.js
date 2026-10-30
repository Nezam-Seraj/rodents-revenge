// ============================================
// Rodent's Revenge — Web Audio Synthesizer
// ============================================
// 100% synthesized audio via Web Audio API.
// No external audio files or dependencies.
// Warm 90s retro sound palette: punchy SFX + chill ambient pad.
// ============================================

class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.noiseBuffer = null;

        this.muted = false;
        try {
            this.muted = localStorage.getItem('rodents_revenge_muted') === 'true';
        } catch (_) {}

        this.musicRunning = false;
        this.musicTimer = null;
        this.musicStep = 0;

        // Auto-unlock Web Audio on first user gesture
        this._unlockBound = this.unlock.bind(this);
        ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
            window.addEventListener(evt, this._unlockBound, { once: false, passive: true });
        });
    }

    ensureContext() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return false;
            this.ctx = new AudioCtx();

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
            this.sfxGain.connect(this.masterGain);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
            this.musicGain.connect(this.masterGain);

            this.generateNoiseBuffer();
        }
        return true;
    }

    unlock() {
        if (!this.ensureContext()) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                if (!this.musicRunning && !this.muted) {
                    this.startMusic();
                }
            });
        } else if (!this.musicRunning && !this.muted) {
            this.startMusic();
        }
    }

    generateNoiseBuffer() {
        if (!this.ctx) return;
        const length = this.ctx.sampleRate * 0.5; // 500ms noise
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
    }

    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }

    setMuted(muted) {
        this.muted = !!muted;
        try {
            localStorage.setItem('rodents_revenge_muted', this.muted ? 'true' : 'false');
        } catch (_) {}

        if (this.masterGain && this.ctx) {
            const t = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(t);
            this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0 : 1, t + 0.05);
        }

        if (this.muted) {
            this.stopMusic();
        } else if (this.ctx && this.ctx.state === 'running') {
            this.startMusic();
        }
    }

    isMuted() {
        return this.muted;
    }

    // ------------------------------------------------------------
    // Sound Effects
    // ------------------------------------------------------------

    /** Short, snappy chirpy blip on player movement */
    playMove() {
        if (this.muted || !this.ensureContext()) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(540, t + 0.035);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + 0.05);
    }

    /** Satisfying bubbly pop/chime when cheese is collected */
    playCheese() {
        if (this.muted || !this.ensureContext()) return;
        const t = this.ctx.currentTime;

        // Two harmonized sine pops
        [
            { freq: 659.25, target: 1318.5, delay: 0 },       // E5 -> E6
            { freq: 987.77, target: 1975.5, delay: 0.035 }   // B5 -> B6
        ].forEach(({ freq, target, delay }) => {
            const st = t + delay;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, st);
            osc.frequency.exponentialRampToValueAtTime(target, st + 0.08);

            gain.gain.setValueAtTime(0.001, st);
            gain.gain.linearRampToValueAtTime(0.24, st + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.12);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(st);
            osc.stop(st + 0.13);
        });
    }

    /** Solid wooden crate thud + friction impact */
    playPush() {
        if (this.muted || !this.ensureContext()) return;
        const t = this.ctx.currentTime;

        // Low tonal thump
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(115, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.12);

        oscGain.gain.setValueAtTime(0.3, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.15);

        // Low-pass filtered noise burst (crate scrape/impact)
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(380, t);
            filter.frequency.exponentialRampToValueAtTime(80, t + 0.09);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.25, t);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.sfxGain);

            noise.start(t);
            noise.stop(t + 0.1);
        }
    }

    /** Cat trapped / turned into cheese musical chime */
    playCatCaught() {
        if (this.muted || !this.ensureContext()) return;
        const t = this.ctx.currentTime;

        // Bright 4-note ascending major arpeggio (G5, B5, D6, G6)
        const notes = [783.99, 987.77, 1174.66, 1567.98];
        notes.forEach((freq, idx) => {
            const noteTime = t + idx * 0.055;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = idx === 3 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, noteTime);

            gain.gain.setValueAtTime(0.001, noteTime);
            gain.gain.linearRampToValueAtTime(0.22, noteTime + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(noteTime);
            osc.stop(noteTime + 0.24);
        });
    }

    /** Retro dramatic defeat / death sting */
    playDeath() {
        if (this.muted || !this.ensureContext()) return;
        const t = this.ctx.currentTime;

        // Descending dissonant synth crunch
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc2.type = 'square';

        osc1.frequency.setValueAtTime(370, t);
        osc1.frequency.exponentialRampToValueAtTime(75, t + 0.35);

        osc2.frequency.setValueAtTime(392, t);
        osc2.frequency.exponentialRampToValueAtTime(70, t + 0.35);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);
        filter.frequency.exponentialRampToValueAtTime(120, t + 0.35);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.42);
        osc2.stop(t + 0.42);
    }

    /** Celebratory level-complete arpeggio */
    playLevelComplete() {
        if (this.muted || !this.ensureContext()) return;
        const t = this.ctx.currentTime;

        // Triumphant 6-note arpeggio (C5, E5, G5, B5, C6, E6)
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
            const noteTime = t + idx * 0.085;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteTime);

            const isLast = idx >= 4;
            const decay = isLast ? 0.65 : 0.28;

            gain.gain.setValueAtTime(0.001, noteTime);
            gain.gain.linearRampToValueAtTime(0.24, noteTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTime + decay);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(noteTime);
            osc.stop(noteTime + decay + 0.02);
        });
    }

    /** Sci-fi vortex downward warp (sinkhole suction) */
    playWarp() {
        if (this.muted || !this.ensureContext()) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const mainGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.exponentialRampToValueAtTime(65, t + 0.42);

        mod.type = 'triangle';
        mod.frequency.setValueAtTime(26, t);
        mod.frequency.linearRampToValueAtTime(10, t + 0.42);

        modGain.gain.setValueAtTime(180, t);
        modGain.gain.linearRampToValueAtTime(20, t + 0.42);
        mod.connect(modGain);
        modGain.connect(osc.frequency);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, t);
        filter.frequency.exponentialRampToValueAtTime(150, t + 0.42);

        mainGain.gain.setValueAtTime(0.001, t);
        mainGain.gain.linearRampToValueAtTime(0.28, t + 0.03);
        mainGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

        osc.connect(filter);
        filter.connect(mainGain);
        mainGain.connect(this.sfxGain);

        mod.start(t);
        osc.start(t);
        mod.stop(t + 0.46);
        osc.stop(t + 0.46);
    }

    // ------------------------------------------------------------
    // Ambient Music Loop (Soft synthesized 90s chiptune pad)
    // ------------------------------------------------------------

    startMusic() {
        if (this.musicRunning || this.muted) return;
        if (!this.ensureContext()) return;
        this.musicRunning = true;
        this.musicStep = 0;
        this.scheduleNextBar();
    }

    stopMusic() {
        this.musicRunning = false;
        if (this.musicTimer) {
            clearTimeout(this.musicTimer);
            this.musicTimer = null;
        }
    }

    scheduleNextBar() {
        if (!this.musicRunning || this.muted || !this.ctx) return;

        // Gentle, mellow retro chords (root + 3rd + 5th + 7th):
        // 0: Cmaj7 (C3, G3, B3, E4)
        // 1: Am7   (A2, E3, G3, C4)
        // 2: Fmaj7 (F2, C3, E3, A3)
        // 3: G7    (G2, D3, F3, B3)
        const chordProgressions = [
            [130.81, 196.00, 246.94, 329.63], // Cmaj7
            [110.00, 164.81, 196.00, 261.63], // Am7
            [87.31,  130.81, 164.81, 220.00], // Fmaj7
            [98.00,  146.83, 174.61, 246.94], // G7
        ];

        const barDuration = 2.4; // seconds per chord
        const chord = chordProgressions[this.musicStep % chordProgressions.length];
        this.musicStep++;

        const now = this.ctx.currentTime;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);

        chord.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = i === 0 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, now);

            // Soft swell and slow release
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.05 / (i + 1), now + 0.6);
            gain.gain.linearRampToValueAtTime(0.035 / (i + 1), now + barDuration - 0.5);
            gain.gain.exponentialRampToValueAtTime(0.001, now + barDuration + 0.2);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);

            osc.start(now);
            osc.stop(now + barDuration + 0.3);
        });

        // Subtly schedule next bar
        this.musicTimer = setTimeout(() => {
            this.scheduleNextBar();
        }, barDuration * 1000 - 80);
    }
}

export const audio = new AudioManager();
