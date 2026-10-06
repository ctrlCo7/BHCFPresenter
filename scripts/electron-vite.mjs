// Runs electron-vite with ELECTRON_RUN_AS_NODE removed. Terminals inside VS Code (and other
// Electron-based tools) export that variable, which makes Electron start as plain Node and
// crash with "Cannot read properties of undefined (reading 'isPackaged')".
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const cli = path.join(path.dirname(require.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
