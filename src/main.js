// ============================================
// Rodent's Revenge — Entry Point
// ============================================
import './styles.css';
import { Game } from './game.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);
    game.init();

    // ===== UI Buttons =====

    document.getElementById('start-btn').addEventListener('click', () => {
        game.hideStartScreen();
        game.startGame();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        game.hideGameOver();
        game.restart();
    });

    document.getElementById('nextlevel-btn').addEventListener('click', () => {
        game.hideLevelComplete();
        game.nextLevel();
    });

    // ===== Resize Handling =====
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (game.renderer) {
                game.renderer.resize();
                game.draw();
            }
        }, 100);
    });

    // Prevent scrolling on arrow keys
    window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
    });

    // Prevent double-tap / double-click zoom
    document.addEventListener('dblclick', (e) => e.preventDefault());

    // ===== Service Worker (PWA — installable + offline) =====
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register(import.meta.env.BASE_URL + 'sw.js')
                .catch((err) => console.warn('Service worker registration failed:', err));
        });
    }

    // Show start screen
    game.showStartScreen();
});
