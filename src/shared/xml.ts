/** XML entities (&amp;, &#233;, &#xE9;…) in text read with regular expressions. */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => safeCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

function safeCodePoint(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

/* ------------------------------ Tiny XML tree ------------------------------ */

/** An element of a parsed XML document. Names keep their prefix ("a:p"). */
export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** Text directly inside this element (entities decoded) */
  text: string
}

/**
 * A small non-validating XML parser for Office files: elements, attributes and text. Comments,
 * processing instructions, doctype and CDATA are handled; namespaces are left as prefixes.
 */
export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1] as XmlNode
    if (m[1] !== undefined) top.text += m[1]
    else if (m[2] !== undefined) {
      // Close the matching element (tolerates stray closers).
      for (let i = stack.length - 1; i > 0; i--) {
        if ((stack[i] as XmlNode).name === m[2]) {
          stack.length = i
          break
        }
      }
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {}
      for (const a of (m[4] ?? '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1] as string] = decodeXmlEntities(a[2] ?? a[3] ?? '')
      const node: XmlNode = { name: m[3], attrs, children: [], text: '' }
      top.children.push(node)
      if (!m[5]) stack.push(node)
    } else if (m[6] !== undefined && stack.length > 1) top.text += decodeXmlEntities(m[6])
  }
  return root
}

/** First child element named `name`. */
export function xmlChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name)
}

/** Child elements named `name` (all children when omitted). */
export function xmlChildren(node: XmlNode | undefined, name?: string): XmlNode[] {
  return node ? (name ? node.children.filter((c) => c.name === name) : node.children) : []
}

/** Follows a path of child names: xmlPath(sp, 'p:spPr', 'a:xfrm', 'a:off'). */
export function xmlPath(node: XmlNode | undefined, ...names: string[]): XmlNode | undefined {
  let n = node
  for (const name of names) n = xmlChild(n, name)
  return n
}

/** First descendant named `name` (depth first). */
export function xmlFind(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined
  for (const c of node.children) {
    if (c.name === name) return c
    const hit = xmlFind(c, name)
    if (hit) return hit
  }
  return undefined
}
