<template>
  <Page>
    <ActionBar title="Dynamic Layout">
      <NavigationButton text="Back" />
    </ActionBar>
    <GridLayout rows="auto, auto, *">
      <!-- Stats -->
      <StackLayout row="0" class="stats-bar">
        <Label :text="`Column width: ${columnWidth}px   Lines: left=${leftLineCount} right=${rightLineCount}`" class="stats-label" />
        <Label :text="`Body body: ${BODY_FONT_DISPLAY}   LineHeight: ${BODY_LINE_HEIGHT}px`" class="stats-label" />
      </StackLayout>

      <!-- Width slider -->
      <GridLayout row="1" columns="auto, *, auto" class="slider-row">
        <Label col="0" :text="`${MIN_WIDTH}`" class="slider-bound" />
        <Slider col="1" v-model="totalWidth" :minValue="MIN_WIDTH" :maxValue="maxWidth" />
        <Label col="2" :text="`${maxWidth}`" class="slider-bound" />
      </GridLayout>

      <!-- Two-column layout -->
      <ScrollView row="2">
        <GridLayout :columns="`${columnWidth}, ${COLUMN_GAP}, ${columnWidth}`" class="spread">
          <!-- Headline spanning both columns -->
          <Label
            col="0"
            colSpan="3"
            text="SITUATIONAL AWARENESS: THE DECADE AHEAD"
            textWrap="true"
            class="headline"
            :style="{ width: (columnWidth * 2 + COLUMN_GAP) + 'px' }"
          />

          <!-- Left column -->
          <Label
            col="0"
            :text="leftColumnText"
            textWrap="true"
            class="body-text"
            :style="{ width: columnWidth + 'px' }"
          />

          <!-- Column gap -->
          <StackLayout col="1" />

          <!-- Right column -->
          <Label
            col="2"
            :text="rightColumnText"
            textWrap="true"
            class="body-text"
            :style="{ width: columnWidth + 'px' }"
          />
        </GridLayout>
      </ScrollView>
    </GridLayout>
  </Page>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'nativescript-vue'
import { Screen } from '@nativescript/core'
import { layout, layoutWithLines, prepareWithSegments } from '@pretext/layout'

// --- body copy (excerpt from dynamic-layout-text.ts) ---
const BODY_COPY = `You can see the future first in San Francisco. Over the past year, the talk of the town has shifted from $10 billion compute clusters to $100 billion clusters to trillion-dollar clusters. Every six months another zero is added to the boardroom plans. Behind the scenes, there's a fierce scramble to secure every power contract still available for the rest of the decade, every voltage transformer that can possibly be procured. American big business is gearing up to pour trillions of dollars into a long-unseen mobilization of American industrial might. By the end of the decade, American electricity production will have grown tens of percent; from the shale fields of Pennsylvania to the solar farms of Nevada, hundreds of millions of GPUs will hum.

The AGI race has begun. We are building machines that can think and reason. By 2025 and 2026, these machines will outpace college graduates. By the end of the decade, they will be smarter than you or I; we will have superintelligence, in the true sense of the word. Along the way, national security forces not seen in half a century will be unleashed, and before long, The Project will be on.

We have machines now that we can basically talk to like humans. It's a remarkable testament to the human capacity to adjust that this seems normal, that we've become inured to the pace of progress. But it's worth stepping back and looking at the progress of just the last few years.

GPT-2, circa 2019, was like a preschooler: "Wow, it can string together a few plausible sentences." GPT-3, circa 2020, was like an elementary schooler: "Wow, with just some few-shot examples it can do some simple useful tasks." GPT-4, circa 2023, was like a smart high schooler: "Wow, it can write pretty sophisticated code and iteratively debug, it can write intelligently and sophisticatedly about complicated subjects."

The pace of deep learning progress in the last decade has simply been extraordinary. A mere decade ago it was revolutionary for a deep learning system to identify simple images. Today, we keep trying to come up with novel, ever harder tests, and yet each new benchmark is quickly cracked.

The magic of deep learning is that it just works—and the trendlines have been astonishingly consistent, despite naysayers at every turn. With each order of magnitude of effective compute, models predictably, reliably get better. If we can count the orders of magnitude, we can roughly, qualitatively extrapolate capability improvements.`

const BODY_FONT = '20px Georgia, "Times New Roman", serif'
const BODY_LINE_HEIGHT = 32
const BODY_FONT_DISPLAY = '20px Georgia'
export const MIN_WIDTH = 300
export const COLUMN_GAP = 20

// Prepare the body text once
const prepared = prepareWithSegments(BODY_COPY, BODY_FONT)

const totalWidth = ref(640)
const maxWidth = ref(800)

onMounted(() => {
  const screenWidth = Screen.mainScreen.widthDIPs
  maxWidth.value = Math.floor(screenWidth - 32)
  totalWidth.value = Math.min(maxWidth.value, 640)
})

const columnWidth = computed(() =>
  Math.max(100, Math.floor((totalWidth.value - COLUMN_GAP) / 2)),
)

// Split the prepared text across two columns.
// Left column takes as many lines as fit in a reasonable height (half screen),
// right column continues from where left left off.
const MAX_LEFT_LINES = 14

const leftColumnText = computed(() => {
  const lines = layoutWithLines(prepared, columnWidth.value, BODY_LINE_HEIGHT)
  return lines.lines.slice(0, MAX_LEFT_LINES).map(l => l.text).join('\n')
})

const rightColumnText = computed(() => {
  const lines = layoutWithLines(prepared, columnWidth.value, BODY_LINE_HEIGHT)
  return lines.lines.slice(MAX_LEFT_LINES).map(l => l.text).join('\n')
})

const leftLineCount = computed(() => {
  const lineCount = layout(prepared, columnWidth.value, BODY_LINE_HEIGHT).lineCount
  return Math.min(lineCount, MAX_LEFT_LINES)
})

const rightLineCount = computed(() => {
  const lineCount = layout(prepared, columnWidth.value, BODY_LINE_HEIGHT).lineCount
  return Math.max(0, lineCount - MAX_LEFT_LINES)
})
</script>

<style scoped>
.stats-bar {
  padding: 10 16;
  background-color: #fafaf9;
  border-bottom-width: 1;
  border-bottom-color: #e7e5e4;
}
.stats-label { font-size: 12; color: #78716c; margin-bottom: 2; }
.slider-row { padding: 8 16; background-color: white; }
.slider-bound { font-size: 11; color: #a8a29e; vertical-align: center; }

.spread {
  padding: 16;
  background-color: #fafaf9;
}
.headline {
  font-size: 22;
  font-weight: 700;
  font-family: Georgia, "Times New Roman", serif;
  color: #1c1917;
  margin-bottom: 20;
  letter-spacing: 1;
}
.body-text {
  font-size: 17;
  line-height: 28;
  font-family: Georgia, "Times New Roman", serif;
  color: #292524;
}
</style>
