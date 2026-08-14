import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const outDir = join(root, 'out', 'self-hosted-relay')
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'self-hosted-relay', 'entry.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: join(outDir, 'server.cjs'),
  minify: true,
  sourcemap: false
})
copyFileSync(
  join(root, 'config', 'docker', 'self-hosted-relay', 'Dockerfile'),
  join(outDir, 'Dockerfile')
)

console.log(`Built self-hosted Relay → ${outDir}/server.cjs`)
