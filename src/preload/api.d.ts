import type { BhcfApi, BhcfOutputApi } from '../shared/ipc'

declare global {
  interface Window {
    bhcf: BhcfApi
    bhcfOutput: BhcfOutputApi
  }
}

export {}
