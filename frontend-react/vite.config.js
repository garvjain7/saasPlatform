import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // REDIRECTS ALL API CALLS TO THE MOCK LAYER FOR DEMO MODE
      '../../services/api': path.resolve(__dirname, './src/services/mock_api.js'),
      '../services/api': path.resolve(__dirname, './src/services/mock_api.js'),
      '../../services/api.js': path.resolve(__dirname, './src/services/mock_api.js'),
      '../services/api.js': path.resolve(__dirname, './src/services/mock_api.js'),
    }
  }
})
