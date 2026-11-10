import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { exec } from 'child_process'
import * as fs from 'fs'

const edsdkDevPlugin = (): Plugin => ({
  name: 'edsdk-dev-plugin',
  configureServer(server) {
    server.middlewares.use('/api/edsdk-capture', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}')
          let targetPath = (payload.savePath || 'F:/Fotolism_image/capture_' + Date.now() + '.jpg').replace(/\\/g, '/')
          if (/^[dD]:/.test(targetPath) && !fs.existsSync('D:/')) {
            targetPath = targetPath.replace(/^[dD]:/, 'F:')
          }
          const targetDir = resolve(targetPath, '..')
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true })
          }
          const canonExe = 'F:/Fotolism/desktop/electron/fotolism_canon_capture.exe'
          const script = 'F:/Fotolism/desktop/electron/canon_edsdk_capture.ps1'
          const captureCmd = fs.existsSync(canonExe)
            ? `"${canonExe}" -savePath "${targetPath}"`
            : `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" -savePath "${targetPath}"`

          exec(captureCmd, { timeout: 22000, encoding: 'utf8' }, (err, stdout) => {
            res.setHeader('Content-Type', 'application/json')
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
              const buffer = fs.readFileSync(targetPath)
              res.end(
                JSON.stringify({
                  success: true,
                  data: {
                    savedPath: targetPath,
                    dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
                    source: 'Canon EOS R100 (Native 64-bit EDSDK)',
                    resolution: '24MP (Full Resolution)',
                    fileSizeMb: (buffer.length / (1024 * 1024)).toFixed(1),
                  },
                })
              )
            } else {
              let scriptError = ''
              try {
                const parsed = JSON.parse(stdout || '{}')
                if (parsed && parsed.error) scriptError = parsed.error
              } catch {}

              res.end(
                JSON.stringify({
                  success: false,
                  error: scriptError || err?.message || 'Không thể nhận được ảnh từ máy ảnh Canon EOS R100',
                })
              )
            }
          })
        } catch (ex: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: false, error: ex.message }))
        }
      })
    })
  },
})

export default defineConfig({
  plugins: [react({}), edsdkDevPlugin()],
  base: './', // relative paths cho Electron file:// protocol
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
