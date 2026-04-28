import { isCJK } from './analysis.js'

export type SegmentMetrics = {
  width: number
  containsCJK: boolean
  emojiCount?: number
  breakableFitMode?: BreakableFitMode
  breakableFitAdvances?: number[] | null
}

export type EngineProfile = {
  lineFitEpsilon: number
  carryCJKAfterClosingQuote: boolean
  breakKeepAllAfterPunctuation: boolean
  preferPrefixWidthsForBreakableRuns: boolean
  preferEarlySoftHyphenBreak: boolean
}

export type BreakableFitMode = 'sum-graphemes' | 'segment-prefixes' | 'pair-context'

// Minimal interface for a 2D drawing context used only for text measurement.
type MeasureCtx = { font: string; measureText(text: string): { width: number } }

// DOM canvas context used for text measurement.
let measureCtx: MeasureCtx | null = null
// Track the last font applied to the shared context to avoid redundant assignments.
let measureCtxFont = ''
const segmentMetricCaches = new Map<string, Map<string, SegmentMetrics>>()
let cachedEngineProfile: EngineProfile | null = null

// Safari's prefix-fit policy is useful for ordinary word-sized runs, but letting
// it measure every growing prefix of a giant segment recreates a pathological
// superlinear prepare-time path. Past this size, switch to the cheaper
// pair-context model and keep the public behavior linear.
const MAX_PREFIX_FIT_GRAPHEMES = 96

const emojiPresentationRe = /\p{Emoji_Presentation}/u
const maybeEmojiRe = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u
let sharedGraphemeSegmenter: Intl.Segmenter | null = null
const emojiCorrectionCache = new Map<string, number>()

// Parse the px font size from a CSS font shorthand string.
// Uses a linear scan rather than a regex to avoid potential ReDoS on adversarial inputs.
export function parseFontSize(font: string): number {
  const pxIdx = font.indexOf('px')
  if (pxIdx < 1) return 16
  let end = pxIdx
  // Skip any space between the number and 'px'
  while (end > 0 && font[end - 1] === ' ') end--
  let start = end
  while (start > 0) {
    const ch = font[start - 1]!
    if ((ch >= '0' && ch <= '9') || ch === '.') start--
    else break
  }
  if (start === end) return 16
  return parseFloat(font.slice(start, end))
}

// Return the shared canvas 2D context configured for the given font.
function getMeasureContext(font: string): MeasureCtx {
  if (measureCtx === null) {
    let ctx: MeasureCtx
    if (typeof OffscreenCanvas !== 'undefined') {
      ctx = new OffscreenCanvas(0, 0).getContext('2d') as unknown as MeasureCtx
    } else {
      ctx = (document.createElement('canvas') as HTMLCanvasElement).getContext('2d') as unknown as MeasureCtx
    }
    measureCtx = ctx
    measureCtxFont = ''
  }
  if (font !== measureCtxFont) {
    measureCtx.font = font
    measureCtxFont = font
  }
  return measureCtx
}

export function getSegmentMetricCache(font: string): Map<string, SegmentMetrics> {
  let cache = segmentMetricCaches.get(font)
  if (!cache) {
    cache = new Map()
    segmentMetricCaches.set(font, cache)
  }
  return cache
}

export function getSegmentMetrics(seg: string, cache: Map<string, SegmentMetrics>, font: string): SegmentMetrics {
  let metrics = cache.get(seg)
  if (metrics === undefined) {
    const ctx = getMeasureContext(font)
    metrics = {
      width: ctx.measureText(seg).width,
      containsCJK: isCJK(seg),
    }
    cache.set(seg, metrics)
  }
  return metrics
}

export function getEngineProfile(): EngineProfile {
  if (cachedEngineProfile !== null) return cachedEngineProfile

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua)
  const isFirefox = /Firefox/.test(ua)

  if (isSafari) {
    cachedEngineProfile = {
      lineFitEpsilon: 1 / 64,
      carryCJKAfterClosingQuote: false,
      breakKeepAllAfterPunctuation: false,
      preferPrefixWidthsForBreakableRuns: true,
      preferEarlySoftHyphenBreak: true,
    }
  } else if (isFirefox) {
    cachedEngineProfile = {
      lineFitEpsilon: 0.005,
      carryCJKAfterClosingQuote: true,
      breakKeepAllAfterPunctuation: true,
      preferPrefixWidthsForBreakableRuns: false,
      preferEarlySoftHyphenBreak: false,
    }
  } else {
    // Chrome / Chromium default
    cachedEngineProfile = {
      lineFitEpsilon: 0.005,
      carryCJKAfterClosingQuote: true,
      breakKeepAllAfterPunctuation: true,
      preferPrefixWidthsForBreakableRuns: false,
      preferEarlySoftHyphenBreak: false,
    }
  }
  return cachedEngineProfile
}

export function setEngineProfile(profile: EngineProfile): void {
  cachedEngineProfile = profile
}

function getSharedGraphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

function isEmojiGrapheme(g: string): boolean {
  return emojiPresentationRe.test(g) || g.includes('\uFE0F')
}

export function textMayContainEmoji(text: string): boolean {
  return maybeEmojiRe.test(text)
}

// Detect how much the canvas over-measures emoji relative to DOM at the given font.
// Returns the per-emoji inflation (positive means canvas is wider than DOM).
// The correction depends only on the font string (which encodes the size);
// it is cached per font string and is 0 when canvas and DOM agree.
function getEmojiCorrection(font: string): number {
  let correction = emojiCorrectionCache.get(font)
  if (correction !== undefined) return correction

  if (typeof document === 'undefined') {
    emojiCorrectionCache.set(font, 0)
    return 0
  }

  const testEmoji = '🔴'
  const canvasWidth = getMeasureContext(font).measureText(testEmoji).width

  const span = document.createElement('span')
  // Set style properties individually to avoid CSS injection via the font string.
  span.style.font = font
  span.style.visibility = 'hidden'
  span.style.position = 'fixed'
  span.style.whiteSpace = 'pre'
  span.textContent = testEmoji
  document.body.appendChild(span)
  const domWidth = span.getBoundingClientRect().width
  document.body.removeChild(span)

  correction = canvasWidth - domWidth
  if (Math.abs(correction) < 0.5) correction = 0
  emojiCorrectionCache.set(font, correction)
  return correction
}

function countEmojiGraphemes(text: string): number {
  let count = 0
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  for (const g of graphemeSegmenter.segment(text)) {
    if (isEmojiGrapheme(g.segment)) count++
  }
  return count
}

function getEmojiCount(seg: string, metrics: SegmentMetrics): number {
  if (metrics.emojiCount === undefined) {
    metrics.emojiCount = countEmojiGraphemes(seg)
  }
  return metrics.emojiCount
}

export function getCorrectedSegmentWidth(seg: string, metrics: SegmentMetrics, emojiCorrection: number): number {
  if (emojiCorrection === 0) return metrics.width
  return metrics.width - getEmojiCount(seg, metrics) * emojiCorrection
}

export function getSegmentGraphemeWidths(
  seg: string,
  cache: Map<string, SegmentMetrics>,
  emojiCorrection: number,
  font: string,
): number[] | null {
  const widths: number[] = []
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  for (const gs of graphemeSegmenter.segment(seg)) {
    const graphemeMetrics = getSegmentMetrics(gs.segment, cache, font)
    widths.push(getCorrectedSegmentWidth(gs.segment, graphemeMetrics, emojiCorrection))
  }

  return widths.length > 1 ? widths : null
}

export function getSegmentBreakableFitAdvances(
  seg: string,
  metrics: SegmentMetrics,
  cache: Map<string, SegmentMetrics>,
  emojiCorrection: number,
  mode: BreakableFitMode,
  font: string,
): number[] | null {
  if (metrics.breakableFitAdvances !== undefined && metrics.breakableFitMode === mode) {
    return metrics.breakableFitAdvances
  }
  metrics.breakableFitMode = mode

  const graphemeSegmenter = getSharedGraphemeSegmenter()
  const graphemes: string[] = []
  for (const gs of graphemeSegmenter.segment(seg)) {
    graphemes.push(gs.segment)
  }
  if (graphemes.length <= 1) {
    metrics.breakableFitAdvances = null
    return metrics.breakableFitAdvances
  }

  if (mode === 'sum-graphemes') {
    const advances: number[] = []
    for (const grapheme of graphemes) {
      const graphemeMetrics = getSegmentMetrics(grapheme, cache, font)
      advances.push(getCorrectedSegmentWidth(grapheme, graphemeMetrics, emojiCorrection))
    }
    metrics.breakableFitAdvances = advances
    return metrics.breakableFitAdvances
  }

  if (mode === 'pair-context' || graphemes.length > MAX_PREFIX_FIT_GRAPHEMES) {
    const advances: number[] = []
    let previousGrapheme: string | null = null
    let previousWidth = 0

    for (const grapheme of graphemes) {
      const graphemeMetrics = getSegmentMetrics(grapheme, cache, font)
      const currentWidth = getCorrectedSegmentWidth(grapheme, graphemeMetrics, emojiCorrection)

      if (previousGrapheme === null) {
        advances.push(currentWidth)
      } else {
        const pair = previousGrapheme + grapheme
        const pairMetrics = getSegmentMetrics(pair, cache, font)
        advances.push(getCorrectedSegmentWidth(pair, pairMetrics, emojiCorrection) - previousWidth)
      }

      previousGrapheme = grapheme
      previousWidth = currentWidth
    }

    metrics.breakableFitAdvances = advances
    return metrics.breakableFitAdvances
  }

  const advances: number[] = []
  let prefix = ''
  let prefixWidth = 0

  for (const grapheme of graphemes) {
    prefix += grapheme
    const prefixMetrics = getSegmentMetrics(prefix, cache, font)
    const nextPrefixWidth = getCorrectedSegmentWidth(prefix, prefixMetrics, emojiCorrection)
    advances.push(nextPrefixWidth - prefixWidth)
    prefixWidth = nextPrefixWidth
  }

  metrics.breakableFitAdvances = advances
  return metrics.breakableFitAdvances
}

export function getFontMeasurementState(font: string, needsEmojiCorrection: boolean): {
  cache: Map<string, SegmentMetrics>
  fontSize: number
  emojiCorrection: number
} {
  const cache = getSegmentMetricCache(font)
  const fontSize = parseFontSize(font)
  const emojiCorrection = needsEmojiCorrection ? getEmojiCorrection(font) : 0
  return { cache, fontSize, emojiCorrection }
}

export function clearMeasurementCaches(): void {
  segmentMetricCaches.clear()
  emojiCorrectionCache.clear()
  sharedGraphemeSegmenter = null
  measureCtxFont = ''
}
