import { describe, expect, it } from 'vitest'
import type { BibleBook, Verse } from '../bible'
import { matchingBook, scripturePresentation } from './scripture'
import type { TextElement } from './types'

const canvas = { width: 1920, height: 1080 }
const v = (verse: number, text: string): Verse => ({ book: 42, chapter: 3, verse, text })
const kjv = [v(16, 'For God so loved the world'), v(17, 'For God sent not his Son')]
const tag = [v(16, 'Sapagka’t gayon na lamang ang pagsinta ng Dios sa sanglibutan'), v(17, 'Sapagka’t hindi sinugo ng Dios ang Anak')]
const texts = (els: { type: string }[]): TextElement[] => els.filter((e): e is TextElement => e.type === 'text')

describe('two translations on one slide', () => {
  it('puts the translations side by side, matched by verse', () => {
    const pres = scripturePresentation('John', kjv, canvas, { versesPerSlide: 2, showVerseNumbers: false, translation: 'KJV', parallel: { translation: 'TAG', verses: tag, layout: 'side' } })
    expect(pres.name).toBe('John 3:16–17 KJV + TAG')
    const [left, right, ref] = texts(pres.slides[0]?.elements ?? [])
    expect(left?.text).toBe('For God so loved the world For God sent not his Son')
    expect(right?.text).toContain('Sapagka’t hindi sinugo')
    expect(right!.frame.x).toBeGreaterThan(left!.frame.x + left!.frame.width)
    expect(left!.frame.y).toBe(right!.frame.y)
    expect(ref?.text).toBe('John 3:16–17 (KJV · TAG)')
  })

  it('stacks them when asked, and skips verses the second one lacks', () => {
    const pres = scripturePresentation('John', kjv, canvas, { versesPerSlide: 1, showVerseNumbers: false, translation: 'KJV', parallel: { translation: 'TAG', verses: [tag[0]!], layout: 'stacked' } })
    expect(pres.slides).toHaveLength(2)
    const [top, bottom] = texts(pres.slides[0]?.elements ?? [])
    expect(bottom!.frame.y).toBeGreaterThan(top!.frame.y + top!.frame.height)
    expect(texts(pres.slides[1]?.elements ?? [])[1]?.text).toBe('')
  })

  it('finds the same book in another translation', () => {
    const book = (index: number, name: string, abbrev: string): BibleBook => ({ index, name, abbrev, verseCounts: [1] })
    const en = [book(0, 'Genesis', 'Gen'), book(1, 'John', 'Jhn')]
    expect(matchingBook(en, [book(0, 'Genesis', 'Gen'), book(1, 'Juan', 'Jua')], 1)).toBe(1)
    expect(matchingBook(en, [book(0, 'Tobit', 'Tob'), book(1, 'Genesis', 'Gen'), book(2, 'John', 'JHN')], 1)).toBe(2)
    expect(matchingBook(en, [book(0, 'Psalms', 'Psa')], 1)).toBeNull()
  })
})
