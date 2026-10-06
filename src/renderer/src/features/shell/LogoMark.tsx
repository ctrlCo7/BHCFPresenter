import type { ReactElement } from 'react'
import logoUrl from '../../assets/logo.png'

/**
 * The BHCF logo. `badge` places it on a white circle so it stays visible on the green title bar
 * (the artwork itself is green on a transparent background).
 */
export function LogoMark({ size = 20, badge = false }: { size?: number; badge?: boolean }): ReactElement {
  const img = <img src={logoUrl} width={size} height={size} alt="" draggable={false} style={{ display: 'block' }} />
  if (!badge) return img
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size + 6,
        height: size + 6,
        borderRadius: '50%',
        background: '#ffffff'
      }}
    >
      {img}
    </span>
  )
}
