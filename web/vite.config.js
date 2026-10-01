import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const webDir = fileURLToPath(new URL('.', import.meta.url));
// The app imports ../shared/templates.js (reminder text + wa.me link).
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

/**
 * A production build must never silently fall back to the Dev login form
 * pointed at localhost. Require the real API URL and Google client ID unless
 * VITE_ALLOW_DEV_LOGIN=1 is set on purpose (dev/staging builds ONLY).
 */
function checkProductionEnv(mode) {
  const env = loadEnv(mode, webDir, 'VITE_'); // .env files + process.env
  if (env.VITE_ALLOW_DEV_LOGIN === '1') {
    console.warn(
      '\n[gurukhata] VITE_ALLOW_DEV_LOGIN=1: this build shows the name-only "Dev login" form.' +
        '\n[gurukhata] Dev/staging only. Never deploy it to real users.\n',
    );
    return;
  }
  const missing = ['VITE_API_URL', 'VITE_GOOGLE_CLIENT_ID'].filter((k) => !String(env[k] || '').trim());
  if (missing.length) {
    throw new Error(
      `\n\n[gurukhata] Production build stopped: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set.\n` +
        'Without them the app would call http://localhost:3000 and show the "Dev login" form to real users.\n' +
        'Set them in the environment (or web/.env.production), e.g.\n' +
        '  VITE_API_URL=https://api.example.com VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com npm run build\n' +
        'For a dev/staging build that uses Dev login on purpose, set VITE_ALLOW_DEV_LOGIN=1 instead.\n',
    );
  }
}

// No @vitejs/plugin-react on purpose (allowed-deps list): Vite's built-in
// transformer handles .jsx with the automatic React runtime.
export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') checkProductionEnv(mode);

  return {
    oxc: { jsx: { runtime: 'automatic' } },
    server: {
      // Setting fs.allow replaces Vite's default, so keep the web/ root in the list.
      fs: { allow: [searchForWorkspaceRoot(webDir), sharedDir] },
    },
    build: {
      rolldownOptions: {
        onwarn(w, warn) {
          // react-router ships "use client" directives; harmless for a client-only SPA.
          if (w.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(w);
        },
      },
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'GuruKhata',
          short_name: 'GuruKhata',
          description: 'Fees register for tuition teachers',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f7f9f8',
          theme_color: '#1f6f5c',
          lang: 'en-IN',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          // App shell only. The API lives on another origin (VITE_API_URL) and
          // there is deliberately NO runtimeCaching — /api responses are never cached.
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  };
});
