import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

export default defineConfig({
  // Base URL for GitHub Pages (repository name)
  base: '/Melodyx/',
  
  // Build configuration
  build: {
    // Output directory
    outDir: 'dist',
    
    // Asset handling
    assetsDir: 'assets',
    
    // Enable source maps for debugging
    sourcemap: true,
    
    // Minification settings
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true
      }
    },
    
    // Code splitting configuration
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'src/pages/app.html'),
        callback: resolve(__dirname, 'src/pages/callback.html'),
        playlistSelector: resolve(__dirname, 'src/pages/playlist-selector.html'),
        spotifyPlayer: resolve(__dirname, 'src/pages/spotify-player.html')
      },
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          'spotify-api': ['src/js/api/spotify-web-api-service.js'],
          'player': ['src/js/player/spotify-player.js', 'src/js/player/true-random.js'],
          'auth': ['src/js/auth/spotify-auth.js']
        },
        // Asset naming
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js'
      }
    },
    
    // Chunk size warnings
    chunkSizeWarningLimit: 1000
  },
  
  // Plugins
  plugins: [
    // Support for older browsers
    legacy({
      targets: ['defaults', 'not IE 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    }),
    // Custom plugin to copy JS files
    {
      name: 'copy-js-files',
      writeBundle() {
        // Create directories
        mkdirSync('dist/src/js/auth', { recursive: true });
        mkdirSync('dist/src/js/api', { recursive: true });
        mkdirSync('dist/src/js/player', { recursive: true });
        mkdirSync('dist/src/js/ui', { recursive: true });
        mkdirSync('dist/src/css/base', { recursive: true });
        mkdirSync('dist/src/css/components', { recursive: true });
        
        // Copy JS files
        copyFileSync('src/js/auth/config.js', 'dist/src/js/auth/config.js');
        copyFileSync('src/js/auth/spotify-auth.js', 'dist/src/js/auth/spotify-auth.js');
        copyFileSync('src/js/api/spotify-web-api-service.js', 'dist/src/js/api/spotify-web-api-service.js');
        copyFileSync('src/js/player/spotify-player.js', 'dist/src/js/player/spotify-player.js');
        copyFileSync('src/js/player/playlist-selector.js', 'dist/src/js/player/playlist-selector.js');
        copyFileSync('src/js/player/true-random.js', 'dist/src/js/player/true-random.js');
        copyFileSync('src/js/ui/script.js', 'dist/src/js/ui/script.js');
        
        // Copy CSS files
        copyFileSync('src/css/base/main.css', 'dist/src/css/base/main.css');
        copyFileSync('src/css/components/player.css', 'dist/src/css/components/player.css');
        copyFileSync('src/css/components/playlist-selector.css', 'dist/src/css/components/playlist-selector.css');
      }
    }
  ],
  
  // Development server configuration
  server: {
    port: 3000,
    open: true,
    cors: true
  },
  
  // Preview server configuration (for testing production build)
  preview: {
    port: 4173,
    open: true
  },
  
  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  }
});