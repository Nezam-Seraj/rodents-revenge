import { defineConfig } from 'vite';

const isElectron = process.env.ELECTRON === 'true' || process.env.ELECTRON_BUILD === 'true';

export default defineConfig({
    base: isElectron ? './' : '/rodents-revenge/',
    root: '.',
    publicDir: 'public',
    server: {
        port: 5173,
        open: true
    }
});
