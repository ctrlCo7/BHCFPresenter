/**
 * Font choices for slide text: fonts bundled with the app (styles/fonts.css), common system
 * fonts, and — when the browser allows it — every font installed on this computer.
 */

export interface FontChoice {
  /** Name shown in the picker */
  name: string
  /** CSS font-family value stored on the text style */
  stack: string
}

export interface FontGroup {
  label: string
  fonts: FontChoice[]
}

const font = (name: string, stack: string): FontChoice => ({ name, stack })

/** Always available, even on computers without them installed. */
export const BUNDLED_FONTS: FontChoice[] = [
  font('Montserrat', "'Montserrat Variable', Montserrat, sans-serif"),
  font('Poppins', 'Poppins, sans-serif'),
  font('Open Sans', "'Open Sans Variable', 'Open Sans', sans-serif"),
  font('Roboto', "'Roboto Variable', Roboto, sans-serif"),
  font('Lato', 'Lato, sans-serif'),
  font('Nunito', "'Nunito Variable', Nunito, sans-serif"),
  font('Raleway', "'Raleway Variable', Raleway, sans-serif"),
  font('Oswald', "'Oswald Variable', Oswald, sans-serif"),
  font('Bebas Neue', "'Bebas Neue', sans-serif"),
  font('Anton', 'Anton, sans-serif'),
  font('Playfair Display', "'Playfair Display Variable', 'Playfair Display', serif"),
  font('Merriweather', 'Merriweather, serif'),
  font('Lora', "'Lora Variable', Lora, serif"),
  font('Dancing Script', "'Dancing Script Variable', 'Dancing Script', cursive"),
  font('Great Vibes', "'Great Vibes', cursive"),
  font('Pacifico', 'Pacifico, cursive')
]

/** Fonts that ship with Windows / macOS (with fallbacks). */
export const SYSTEM_FONTS: FontChoice[] = [
  font('Segoe UI', 'Segoe UI, Helvetica Neue, Arial, sans-serif'),
  font('Arial', 'Arial, Helvetica, sans-serif'),
  font('Arial Black', "'Arial Black', Arial, sans-serif"),
  font('Calibri', 'Calibri, Carlito, sans-serif'),
  font('Candara', 'Candara, Calibri, sans-serif'),
  font('Century Gothic', "'Century Gothic', 'Avenir', sans-serif"),
  font('Corbel', 'Corbel, Calibri, sans-serif'),
  font('Franklin Gothic', "'Franklin Gothic Medium', 'Franklin Gothic', Arial, sans-serif"),
  font('Gill Sans', "'Gill Sans MT', 'Gill Sans', sans-serif"),
  font('Verdana', 'Verdana, Geneva, sans-serif'),
  font('Tahoma', 'Tahoma, Geneva, sans-serif'),
  font('Trebuchet MS', 'Trebuchet MS, sans-serif'),
  font('Impact', 'Impact, Haettenschweiler, sans-serif'),
  font('Georgia', 'Georgia, serif'),
  font('Times New Roman', 'Times New Roman, Times, serif'),
  font('Garamond', 'Garamond, Georgia, serif'),
  font('Book Antiqua', "'Book Antiqua', Palatino, serif"),
  font('Palatino Linotype', 'Palatino Linotype, Palatino, serif'),
  font('Cambria', 'Cambria, Georgia, serif'),
  font('Constantia', 'Constantia, Georgia, serif'),
  font('Segoe Script', "'Segoe Script', 'Brush Script MT', cursive"),
  font('Brush Script', "'Brush Script MT', cursive"),
  font('Lucida Handwriting', "'Lucida Handwriting', cursive"),
  font('Consolas', 'Consolas, monospace'),
  font('Courier New', 'Courier New, monospace')
]

/** The first family of a stack, unquoted — the name shown for a stored value. */
export function fontName(stack: string): string {
  return (stack.split(',')[0] ?? stack).trim().replace(/^['"]|['"]$/g, '')
}

/** A font-family value for a single installed family. */
export function stackFor(family: string): string {
  return `"${family.replace(/["\\]/g, '')}", sans-serif`
}

interface LocalFontData {
  family: string
}
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>
  }
}

let installed: Promise<string[]> | null = null

/** Families installed on this computer (sorted, deduplicated); empty if unavailable. */
export function installedFontFamilies(): Promise<string[]> {
  installed ??= (async () => {
    try {
      const fonts = (await window.queryLocalFonts?.()) ?? []
      return [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  })()
  // Try again next time if nothing came back (e.g. permission not granted yet).
  void installed.then((list) => {
    if (list.length === 0) installed = null
  })
  return installed
}
