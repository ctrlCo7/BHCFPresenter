import '../styles/fonts.css'
import { createRoot } from 'react-dom/client'
import { OutputApp } from './OutputApp'

window.addEventListener('error', (e) => window.bhcfOutput.log('error', `${e.message} @ ${e.filename}:${e.lineno}`))
window.addEventListener('unhandledrejection', (e) => window.bhcfOutput.log('error', `Unhandled rejection: ${String(e.reason)}`))

const root = document.getElementById('root')
if (root) createRoot(root).render(<OutputApp />)
