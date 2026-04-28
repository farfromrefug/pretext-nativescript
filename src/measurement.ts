import { Paint } from '@nativescript-community/ui-canvas'
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

// NativeScript Paint instance used for text measurement (replaces DOM canvas context).
let measurePaint: Paint | null = null
// Track the last font applied to the shared paint so we avoid redundant font updates.
let measurePaintFont = ''
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

// --- font string parsers ---

// Parse a CSS font shorthand string into its components.
// Format: [style] [variant] [weight] [size[/line-height]] [family, ...]
// We first locate the size token (the first `\d+px` substring) to split
// the string into a before (weight/style keywords) and after (families) part.
// This avoids lookaheads and the associated ReDoS risk.
type ParsedFont = { size: number; weight: string; style: string; family: string }

function parseFont(font: string): ParsedFont {
  const sizeMatch = /(\d+(?:\.\d+)?)(\/\S+)?px/.exec(font)
  if (!sizeMatch) return { size: 16, weight: 'normal', style: 'normal', family: 'sans-serif' }

  const before = font.slice(0, sizeMatch.index).toLowerCase()
  const after = font.slice(sizeMatch.index + sizeMatch[0].length).trim()

  // Derive weight: look for a numeric weight or the keyword "bold" in 'before'.
  // 'before' is small (a few tokens at most), so a simple search is fine.
  let weight = 'normal'
  for (const token of before.split(/\s+/)) {
    if (token === 'bold') { weight = 'bold'; break }
    const n = Number(token)
    if (Number.isFinite(n) && n >= 1 && n <= 1000) { weight = String(Math.round(n)); break }
  }

  // Derive style.
  const style = before.includes('italic') || before.includes('oblique') ? 'italic' : 'normal'

  // Derive family: first entry in the comma-separated family list.
  const rawFamily = after.split(',')[0]!.trim().replace(/^["']|["']$/g, '').trim()
  const family = rawFamily || 'sans-serif'

  return { size: parseFloat(sizeMatch[1]!), weight, style, family }
}

// Apply a CSS font shorthand string to an existing Paint instance.
function applyFontToPaint(paint: Paint, font: string): void {
  const parsed = parseFont(font)
  paint.setTextSize(parsed.size)
  paint.setFontFamily(parsed.family)
  paint.setFontWeight(parsed.weight as Parameters<Paint['setFontWeight']>[0])
  paint.setFontStyle(parsed.style as Parameters<Paint['setFontStyle']>[0])
}

export function parseFontSize(font: string): number {
  return parseFont(font).size
}

// Return the shared Paint configured for the given font string.
// This is the NativeScript equivalent of getMeasureContext() + ctx.font = font.
export function getMeasurePaint(font: string): Paint {
  if (measurePaint === null) {
    measurePaint = new Paint()
    measurePaint.setAntiAlias(true)
    measurePaintFont = ''
  }
  if (font !== measurePaintFont) {
    applyFontToPaint(measurePaint, font)
    measurePaintFont = font
  }
  return measurePaint
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
    const paint = getMeasurePaint(font)
    metrics = {
      width: paint.measureText(seg),
      containsCJK: isCJK(seg),
    }
    cache.set(seg, metrics)
  }
  return metrics
}

export function getEngineProfile(): EngineProfile {
  if (cachedEngineProfile !== null) return cachedEngineProfile

  // NativeScript runs on Android (Chromium-based text engine) and iOS (WebKit-based).
  // Default to the Android/Chromium profile; callers can override via setEngineProfile().
  cachedEngineProfile = {
    lineFitEpsilon: 0.005,
    carryCJKAfterClosingQuote: true,
    breakKeepAllAfterPunctuation: true,
    preferPrefixWidthsForBreakableRuns: false,
    preferEarlySoftHyphenBreak: false,
  }
  return cachedEngineProfile
}

// Allow callers to inject a platform-specific profile (e.g. iOS/Safari-like values).
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

// On NativeScript, Paint.measureText is already accurate for emoji — no DOM span
// calibration is needed, so emoji correction is always 0.
function getEmojiCorrection(_font: string, _fontSize: number): number {
  return 0
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
  // Ensure the shared paint is configured for this font so subsequent measureText calls are correct.
  getMeasurePaint(font)
  const cache = getSegmentMetricCache(font)
  const fontSize = parseFontSize(font)
  const emojiCorrection = needsEmojiCorrection ? getEmojiCorrection(font, fontSize) : 0
  return { cache, fontSize, emojiCorrection }
}

export function clearMeasurementCaches(): void {
  segmentMetricCaches.clear()
  sharedGraphemeSegmenter = null
  // Reset the font string so the next getMeasurePaint call re-applies font settings,
  // but keep the Paint instance alive (it may be a test mock injected from outside).
  measurePaintFont = ''
}

/**
 * Inject a pre-built Paint-like object for deterministic unit tests.
 * The injected object only needs to implement `measureText(text: string): number`.
 * Call `clearMeasurementCaches()` to remove the override after the test suite.
 */
export function setMeasurePaintForTesting(fakePaint: Pick<Paint, 'measureText'>): void {
  measurePaint = fakePaint as Paint
  measurePaintFont = ''
}
