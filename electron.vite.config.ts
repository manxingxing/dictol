import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'dictionary-import-worker': resolve('src/main/dictionary-import-worker.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          dictionary: resolve('src/preload/dictionary.ts'),
          'search-popover': resolve('src/preload/search-popover.ts'),
          'selection-toolbar': resolve('src/preload/selection-toolbar.ts'),
          'selection-explanation': resolve('src/preload/selection-explanation.ts'),
          'selection-entry': resolve('src/preload/selection-entry.ts')
        }
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          'search-popover': resolve('src/renderer/search-popover.html'),
          'selection-toolbar': resolve('src/renderer/selection-toolbar.html'),
          'selection-explanation': resolve('src/renderer/selection-explanation.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
