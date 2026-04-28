<template>
  <Page>
    <ActionBar title="Bubble Shrinkwrap">
      <NavigationButton text="Back" />
    </ActionBar>
    <GridLayout rows="auto, auto, *">
      <!-- Stats bar -->
      <StackLayout row="0" class="stats-bar">
        <Label :text="`Chat width: ${chatWidth}px`" class="stats-label" />
        <Label :text="`CSS wasted pixels: ${cssWasteFormatted}`" class="stats-label" />
        <Label :text="`Shrink-wrapped waste: 0`" class="stats-label" />
      </StackLayout>

      <!-- Width slider -->
      <GridLayout row="1" columns="auto, *, auto" class="slider-row">
        <Label col="0" :text="`${minWidth}`" class="slider-bound" />
        <Slider col="1" v-model="chatWidth" :minValue="minWidth" :maxValue="maxWidth" />
        <Label col="2" :text="`${maxWidth}`" class="slider-bound" />
      </GridLayout>

      <!-- Bubble list -->
      <ScrollView row="2">
        <StackLayout class="bubble-list">
          <GridLayout
            v-for="(bubble, index) in renderedBubbles"
            :key="index"
            columns="*"
            class="bubble-row"
            :class="bubble.role === 'user' ? 'bubble-row--user' : 'bubble-row--ai'"
          >
            <Label
              :text="bubble.text"
              textWrap="true"
              class="bubble-label"
              :class="bubble.role === 'user' ? 'bubble-label--user' : 'bubble-label--ai'"
              :style="{ width: bubble.tightWidth + 'px' }"
            />
          </GridLayout>
        </StackLayout>
      </ScrollView>
    </GridLayout>
  </Page>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'nativescript-vue'
import { Screen } from '@nativescript/core'
import { layout, prepareWithSegments, walkLineRanges, type PreparedTextWithSegments } from '@pretext/layout'

// --- constants (mirrors bubbles-shared.ts) ---
const FONT = '15px "Helvetica Neue", Helvetica, Arial, sans-serif'
const LINE_HEIGHT = 20
const PADDING_H = 12
const BUBBLE_MAX_RATIO = 0.8

const minWidth = 200

type BubbleMessage = { role: 'user' | 'ai'; text: string }

const MESSAGES: BubbleMessage[] = [
  { role: 'user', text: 'Can we use the rich-text inline helper as a real primitive?' },
  { role: 'ai', text: 'Short answer: yes, inside a bounded corridor. It already handles rich-text inline flow, code, and links while keeping pills and badges atomic.' },
  { role: 'user', text: 'Right. My side is usually short, but your side has Beijing 北京, Arabic مرحبا, emoji 👩‍🚀, and long URLs.' },
  { role: 'ai', text: 'Mixed-script sample: English for the framing, 日本語 for compact line breaks, العربية for punctuation clusters, and emoji like 🧪📐 to keep the grapheme path honest.' },
  { role: 'user', text: 'Then let\'s stress it with real markdown: nested emphasis, deletions, inline code, and links.' },
  { role: 'ai', text: 'If we know the exact height in advance, virtualization is no longer guesswork. It becomes geometry. That is the whole reason to keep the primitive low-level and composable.' },
  { role: 'user', text: 'Okay, but the design matters too.' },
  { role: 'ai', text: 'The strongest signal so far is that assistant messages want a different presentation contract from user messages. The human side reads well as compact bubbles. The assistant side reads better as content on a surface with room to breathe.' },
  { role: 'user', text: 'What about images or chips? Even if they are fake, I want to know the primitive can hold an atomic thing.' },
  { role: 'ai', text: 'It can. Something like an inline chip behaves more like an inline chip than a splittable word, which is exactly the right stress case.' },
  { role: 'user', text: 'cool. also make sure the scroll still feels stable when widths change' },
  { role: 'ai', text: 'That is one of the better parts of the demo right now: width changes rebuild the frame, preserve relative scroll intent, and remount only the visible window.' },
]

type PreparedBubble = { prepared: PreparedTextWithSegments; role: 'user' | 'ai'; text: string }
type RenderedBubble = { text: string; role: 'user' | 'ai'; tightWidth: number }

// Prepare all texts once — this is the expensive step.
const preparedBubbles: PreparedBubble[] = MESSAGES.map(msg => ({
  prepared: prepareWithSegments(msg.text, FONT),
  role: msg.role,
  text: msg.text,
}))

const chatWidth = ref(320)
const maxWidth = ref(500)

onMounted(() => {
  // Use screen width to compute a sensible default and max.
  const screenWidth = Screen.mainScreen.widthDIPs
  maxWidth.value = Math.floor(screenWidth - 32)
  chatWidth.value = Math.floor(screenWidth * 0.7)
})

function collectMaxLineWidth(prepared: PreparedTextWithSegments, maxW: number): number {
  let maxLineWidth = 0
  walkLineRanges(prepared, maxW, line => {
    if (line.width > maxLineWidth) maxLineWidth = line.width
  })
  return maxLineWidth
}

function findTightWidth(prepared: PreparedTextWithSegments, maxW: number): number {
  const initialLineCount = layout(prepared, maxW, LINE_HEIGHT).lineCount
  let lo = 1
  let hi = Math.max(1, Math.ceil(maxW))
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (layout(prepared, mid, LINE_HEIGHT).lineCount <= initialLineCount) hi = mid
    else lo = mid + 1
  }
  return Math.ceil(collectMaxLineWidth(prepared, lo)) + PADDING_H * 2
}

const renderedBubbles = computed<RenderedBubble[]>(() => {
  const bubbleMaxWidth = Math.floor(chatWidth.value * BUBBLE_MAX_RATIO)
  const contentMax = bubbleMaxWidth - PADDING_H * 2
  return preparedBubbles.map(b => ({
    text: b.text,
    role: b.role,
    tightWidth: findTightWidth(b.prepared, contentMax),
  }))
})

const cssWasteFormatted = computed(() => {
  const bubbleMaxWidth = Math.floor(chatWidth.value * BUBBLE_MAX_RATIO)
  const contentMax = bubbleMaxWidth - PADDING_H * 2
  let waste = 0
  for (const b of preparedBubbles) {
    const cssMaxLineWidth = collectMaxLineWidth(b.prepared, contentMax)
    const tightMaxLineWidth = collectMaxLineWidth(b.prepared, findTightWidth(b.prepared, contentMax) - PADDING_H * 2)
    const cssWidth = Math.ceil(cssMaxLineWidth) + PADDING_H * 2
    const tightW = Math.ceil(tightMaxLineWidth) + PADDING_H * 2
    const lineCount = layout(b.prepared, contentMax, LINE_HEIGHT).lineCount
    waste += Math.max(0, cssWidth - tightW) * (lineCount * LINE_HEIGHT + 16)
  }
  return Math.round(waste).toLocaleString()
})
</script>

<style scoped>
.stats-bar {
  padding: 10 16;
  background-color: #f3f4f6;
  border-bottom-width: 1;
  border-bottom-color: #d1d5db;
}
.stats-label {
  font-size: 12;
  color: #6b7280;
  margin-bottom: 2;
}
.slider-row {
  padding: 8 16;
  background-color: white;
}
.slider-bound {
  font-size: 11;
  color: #9ca3af;
  vertical-align: center;
}
.bubble-list {
  padding: 12;
}
.bubble-row {
  margin-bottom: 8;
}
.bubble-row--user {
  horizontal-align: right;
}
.bubble-row--ai {
  horizontal-align: left;
}
.bubble-label {
  padding: 10 12;
  border-radius: 16;
  font-size: 15;
  line-height: 20;
}
.bubble-label--user {
  background-color: #3b82f6;
  color: white;
}
.bubble-label--ai {
  background-color: #f1f5f9;
  color: #1e293b;
}
</style>
