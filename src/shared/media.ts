import type { MediaKind } from './model/types'

interface MediaTypeInfo {
  kind: MediaKind
  mimeType: string
}

/** Supported media formats, keyed by lower-case extension (without the dot). */
export const MEDIA_TYPES: Readonly<Record<string, MediaTypeInfo>> = {
  jpg: { kind: 'image', mimeType: 'image/jpeg' },
  jpeg: { kind: 'image', mimeType: 'image/jpeg' },
  png: { kind: 'image', mimeType: 'image/png' },
  gif: { kind: 'image', mimeType: 'image/gif' },
  webp: { kind: 'image', mimeType: 'image/webp' },
  mp4: { kind: 'video', mimeType: 'video/mp4' },
  m4v: { kind: 'video', mimeType: 'video/mp4' },
  mov: { kind: 'video', mimeType: 'video/quicktime' },
  webm: { kind: 'video', mimeType: 'video/webm' },
  mp3: { kind: 'audio', mimeType: 'audio/mpeg' },
  wav: { kind: 'audio', mimeType: 'audio/wav' },
  m4a: { kind: 'audio', mimeType: 'audio/mp4' },
  ogg: { kind: 'audio', mimeType: 'audio/ogg' }
}

export const MEDIA_EXTENSIONS = Object.keys(MEDIA_TYPES)

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

export function mediaTypeFor(fileName: string): MediaTypeInfo | null {
  return MEDIA_TYPES[extensionOf(fileName)] ?? null
}

/** Custom protocol used by renderers to load project media (supports HTTP range requests). */
export const MEDIA_PROTOCOL = 'bhcf-media'

export function mediaUrl(fileName: string): string {
  return `${MEDIA_PROTOCOL}://project/${encodeURIComponent(fileName)}`
}

/** URL of a video's poster image stored in media/.thumbs. */
export function thumbnailUrl(thumbnail: string): string {
  return `${MEDIA_PROTOCOL}://project/.thumbs/${encodeURIComponent(thumbnail)}`
}
