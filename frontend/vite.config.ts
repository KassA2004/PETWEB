import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Dev-only snapshot sink.
 *
 * The procedural asset system has to be verified by looking at it. This lets the
 * running app POST a rendered frame (as a data URL) to be written to
 * `.snapshots/` on disk. It is registered only by `configureServer`, so it does
 * not exist in a production build.
 */
function devSnapshotPlugin(): Plugin {
  return {
    name: 'petweb-dev-snapshot',
    configureServer(server) {
      server.middlewares.use('/__snapshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            const payload = Buffer.concat(chunks).toString('utf8')
            const comma = payload.indexOf(',')
            const base64 = comma === -1 ? payload : payload.slice(comma + 1)
            const name = (req.headers['x-snapshot-name'] as string) || 'latest'
            const safeName = name.replace(/[^a-z0-9._-]/gi, '_')
            const out = resolve(process.cwd(), '.snapshots', `${safeName}.png`)

            mkdirSync(dirname(out), { recursive: true })
            writeFileSync(out, Buffer.from(base64, 'base64'))

            res.statusCode = 200
            res.end(out)
          } catch (error) {
            res.statusCode = 500
            res.end(String(error))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devSnapshotPlugin()],
})
