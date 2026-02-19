import { defineConfig } from 'vite';

export default defineConfig({
    base: '/rodents-revenge/',
    root: '.',
    publicDir: 'public',
    server: {
        port: 5173,
        open: true
    }
});
