/**
 * Simple Intl.Segmenter shim for NativeScript.
 *
 * Provides word and grapheme segmentation without depending on the platform's
 * built-in Intl.Segmenter (which may be missing or behave differently across
 * NativeScript runtime versions).
 *
 * Grapheme segmentation — uses the JS string iterator which is Unicode
 * code-point aware (handles surrogate pairs).  Multi-codepoint grapheme
 * clusters such as emoji ZWJ sequences are not merged: each code point is
 * yielded as a separate segment.  This is the "simple shim" trade-off.
 *
 * Word segmentation — splits text into word-like and non-word-like runs.
 * CJK characters are always yielded individually as word-like single-character
 * segments (matching Intl.Segmenter word-granularity behaviour).
 *
 * Install with installSegmenterShim() before the first prepare() call.
 * The webpack config in app/ prepends this module so it always runs first.
 */

// ---------------------------------------------------------------------------
// CJK code-point ranges — must stay in sync with isCJKCodePoint in analysis.ts
// ---------------------------------------------------------------------------

function isCJKCodePoint(cp: number): boolean {
  return (
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x20000 && cp <= 0x2A6DF) ||
    (cp >= 0x2A700 && cp <= 0x2B73F) ||
    (cp >= 0x2B740 && cp <= 0x2B81F) ||
    (cp >= 0x2B820 && cp <= 0x2CEAF) ||
    (cp >= 0x2CEB0 && cp <= 0x2EBEF) ||
    (cp >= 0x2EBF0 && cp <= 0x2EE5D) ||
    (cp >= 0x2F800 && cp <= 0x2FA1F) ||
    (cp >= 0x30000 && cp <= 0x3134F) ||
    (cp >= 0x31350 && cp <= 0x323AF) ||
    (cp >= 0x323B0 && cp <= 0x33479) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0x3000 && cp <= 0x303F) ||
    (cp >= 0x3040 && cp <= 0x309F) ||
    (cp >= 0x30A0 && cp <= 0x30FF) ||
    (cp >= 0x3130 && cp <= 0x318F) ||
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    (cp >= 0xFF00 && cp <= 0xFFEF)
  )
}

// ---------------------------------------------------------------------------
// Letter / digit ranges used to decide isWordLike for non-CJK code points.
// This covers the scripts most commonly found in app text.
// ---------------------------------------------------------------------------

function isWordCodePoint(cp: number): boolean {
  // ASCII letters and digits
  if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) return true
  if (cp >= 0x30 && cp <= 0x39) return true
  if (cp === 0x5F) return true // underscore
  // Latin Extended
  if (cp >= 0xC0 && cp <= 0x2AF) return true
  // Greek
  if (cp >= 0x370 && cp <= 0x3CE) return true
  // Cyrillic
  if (cp >= 0x400 && cp <= 0x52F) return true
  // Hebrew
  if (cp >= 0x5D0 && cp <= 0x5EA) return true
  // Arabic
  if (cp >= 0x600 && cp <= 0x6FF) return true
  if (cp >= 0x750 && cp <= 0x77F) return true
  if (cp >= 0x8A0 && cp <= 0x8FF) return true
  // Devanagari and other Indic scripts up to Malayalam
  if (cp >= 0x900 && cp <= 0xD7F) return true
  // Thai
  if (cp >= 0xE00 && cp <= 0xE7F) return true
  // Lao
  if (cp >= 0xE80 && cp <= 0xEFF) return true
  // Myanmar
  if (cp >= 0x1000 && cp <= 0x109F) return true
  // Khmer
  if (cp >= 0x1780 && cp <= 0x17FF) return true
  // Korean Jamo
  if (cp >= 0x1100 && cp <= 0x11FF) return true
  if (cp >= 0xA960 && cp <= 0xA97F) return true
  if (cp >= 0xD7B0 && cp <= 0xD7FF) return true
  // Note: `codePointAt()` always returns full Unicode code points, never raw
  // surrogate values (0xD800–0xDFFF), so no surrogate check is needed here.
  // Astral characters outside the CJK and above ranges (e.g. emoji) fall
  // through to false and are treated as non-word-like, matching Intl.Segmenter.
  return false
}

// ---------------------------------------------------------------------------
// Segment iterators
// ---------------------------------------------------------------------------

type ShimSegment = { segment: string; index: number; isWordLike?: boolean }

function* graphemeSegmentsOf(text: string): Generator<ShimSegment> {
  let index = 0
  for (const char of text) {
    yield { segment: char, index }
    index += char.length
  }
}

function* wordSegmentsOf(text: string): Generator<ShimSegment & { isWordLike: boolean }> {
  let i = 0
  while (i < text.length) {
    const segStart = i
    const cp = text.codePointAt(i)!
    const charLen = cp > 0xFFFF ? 2 : 1

    // CJK: always a single-character word-like segment
    if (isCJKCodePoint(cp)) {
      yield { segment: text.slice(i, i + charLen), index: i, isWordLike: true }
      i += charLen
      continue
    }

    // Non-CJK: accumulate a run of the same word-likeness
    const isWord = isWordCodePoint(cp)
    i += charLen
    while (i < text.length) {
      const nextCp = text.codePointAt(i)!
      if (isCJKCodePoint(nextCp)) break
      if (isWordCodePoint(nextCp) !== isWord) break
      i += nextCp > 0xFFFF ? 2 : 1
    }

    yield { segment: text.slice(segStart, i), index: segStart, isWordLike: isWord }
  }
}

// ---------------------------------------------------------------------------
// Shim class — mimics the Intl.Segmenter interface
// ---------------------------------------------------------------------------

class SegmenterShim {
  private readonly _granularity: 'word' | 'grapheme'

  constructor(_locale?: string, options?: { granularity?: 'word' | 'grapheme' }) {
    this._granularity = options?.granularity ?? 'grapheme'
  }

  segment(text: string): Iterable<ShimSegment> {
    if (this._granularity === 'grapheme') {
      return { [Symbol.iterator]: () => graphemeSegmentsOf(text) }
    }
    return { [Symbol.iterator]: () => wordSegmentsOf(text) }
  }

  resolvedOptions(): { locale: string; granularity: 'word' | 'grapheme' } {
    // Return 'und' (undefined language tag) — the shim has no locale concept.
    return { locale: 'und', granularity: this._granularity }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Override globalThis.Intl.Segmenter with SegmenterShim so all calls to
 * `new Intl.Segmenter(...)` in the library use our predictable implementation.
 *
 * Call before the first prepare() invocation.  The webpack config for the
 * NativeScript app prepends this module as a bundle entry so it always runs
 * before any library code.
 */
export function installSegmenterShim(): void {
  if (typeof globalThis !== 'undefined' && globalThis.Intl !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis.Intl as unknown as Record<string, unknown>)['Segmenter'] = SegmenterShim
  }
}
