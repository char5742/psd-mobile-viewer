import { defineConfig } from 'vite';

export default defineConfig({
  // Update this to match your GitHub repository name.
  // Example: if your repo URL is https://github.com/user/psd-mobile-viewer
  // set base to '/psd-mobile-viewer/'
  base: '/psd-mobile-viewer/',

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
