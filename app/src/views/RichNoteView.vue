<template>
  <Page>
    <ActionBar title="Rich Inline Note">
      <NavigationButton text="Back" />
    </ActionBar>
    <GridLayout rows="auto, auto, *">
      <!-- Stats -->
      <StackLayout row="0" class="stats-bar">
        <Label :text="`Width: ${bodyWidth}px   Lines: ${lineCount}`" class="stats-label" />
      </StackLayout>

      <!-- Width slider -->
      <GridLayout row="1" columns="auto, *, auto" class="slider-row">
        <Label col="0" :text="`${BODY_MIN_WIDTH}`" class="slider-bound" />
        <Slider col="1" v-model="bodyWidth" :minValue="BODY_MIN_WIDTH" :maxValue="maxBodyWidth" />
        <Label col="2" :text="`${maxBodyWidth}`" class="slider-bound" />
      </GridLayout>

      <!-- Rendered lines -->
      <ScrollView row="2">
        <StackLayout class="note-container" :style="{ width: bodyWidth + 'px' }">
          <!--
            Each "line" from the rich-inline layout engine is rendered as a row of
            horizontally-arranged Label/border spans.  NativeScript does not support
            arbitrary inline layout, so we use a WrapLayout-per-line with each
            fragment as a child Label.
          -->
          <GridLayout
            v-for="(line, li) in lines"
            :key="li"
            columns="*"
            class="line-row"
          >
            <WrapLayout orientation="horizontal">
              <Label
                v-for="(frag, fi) in line.fragments"
                :key="fi"
                :text="frag.text"
                class="frag"
                :class="frag.className"
                :style="frag.leadingGap > 0 ? { marginLeft: frag.leadingGap + 'px' } : {}"
              />
            </WrapLayout>
          </GridLayout>
        </StackLayout>
      </ScrollView>
    </GridLayout>
  </Page>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'nativescript-vue'
import { Screen } from '@nativescript/core'
import {
  materializeRichInlineLineRange,
  prepareRichInline,
  walkRichInlineLineRanges,
} from '@pretext/rich-inline'

// --- mirrors rich-note.model.ts constants ---
const BODY_FONT = '500 17px "Helvetica Neue", Helvetica, Arial, sans-serif'
const LINK_FONT = '600 17px "Helvetica Neue", Helvetica, Arial, sans-serif'
const CODE_FONT = '600 14px "SF Mono", ui-monospace, Menlo, Monaco, monospace'
const CHIP_FONT = '700 12px "Helvetica Neue", Helvetica, Arial, sans-serif'
const CHIP_CHROME_WIDTH = 22
export const BODY_MIN_WIDTH = 220
const BODY_DEFAULT_WIDTH = 320

type TextStyleName = 'body' | 'link' | 'code'
type ChipTone = 'mention' | 'status' | 'priority' | 'time' | 'count'

type RichInlineSpec =
  | { kind: 'text'; text: string; style: TextStyleName }
  | { kind: 'chip'; label: string; tone: ChipTone }

const TEXT_STYLES: Record<TextStyleName, { className: string; extraWidth: number; font: string }> = {
  body: { className: 'frag--body', extraWidth: 0, font: BODY_FONT },
  code: { className: 'frag--code', extraWidth: 14, font: CODE_FONT },
  link: { className: 'frag--link', extraWidth: 0, font: LINK_FONT },
}

const CHIP_CLASS_NAMES: Record<ChipTone, string> = {
  count: 'chip chip--count',
  mention: 'chip chip--mention',
  priority: 'chip chip--priority',
  status: 'chip chip--status',
  time: 'chip chip--time',
}

const SPECS: RichInlineSpec[] = [
  { kind: 'text', text: 'Ship ', style: 'body' },
  { kind: 'chip', label: '@maya', tone: 'mention' },
  { kind: 'text', text: "'s ", style: 'body' },
  { kind: 'text', text: 'rich-note', style: 'code' },
  { kind: 'text', text: ' card once ', style: 'body' },
  { kind: 'text', text: 'pre-wrap', style: 'code' },
  { kind: 'text', text: ' lands. Status ', style: 'body' },
  { kind: 'chip', label: 'blocked', tone: 'status' },
  { kind: 'text', text: ' by ', style: 'body' },
  { kind: 'text', text: 'vertical text', style: 'link' },
  { kind: 'text', text: ' research, but 北京 copy and Arabic QA are both green ✅. Keep ', style: 'body' },
  { kind: 'chip', label: 'جاهز', tone: 'status' },
  { kind: 'text', text: ' for ', style: 'body' },
  { kind: 'text', text: 'Cmd+K', style: 'code' },
  { kind: 'text', text: ' docs; the review bundle now includes 中文 labels, عربي fallback, and one more launch pass 🚀 for ', style: 'body' },
  { kind: 'chip', label: 'Fri 2:30 PM', tone: 'time' },
  { kind: 'text', text: '. Keep ', style: 'body' },
  { kind: 'text', text: 'layoutNextLine()', style: 'code' },
  { kind: 'text', text: ' public, tag this ', style: 'body' },
  { kind: 'chip', label: 'P1', tone: 'priority' },
  { kind: 'text', text: ', keep ', style: 'body' },
  { kind: 'chip', label: '3 reviewers', tone: 'count' },
  { kind: 'text', text: ', and route feedback to ', style: 'body' },
  { kind: 'text', text: 'design sync', style: 'link' },
  { kind: 'text', text: '.', style: 'body' },
]

const classNames = SPECS.map(spec =>
  spec.kind === 'chip' ? CHIP_CLASS_NAMES[spec.tone] : TEXT_STYLES[spec.style].className,
)

// Prepare once (expensive text analysis + measurement happens here)
const flow = prepareRichInline(
  SPECS.map(spec => {
    if (spec.kind === 'chip') {
      return { text: spec.label, font: CHIP_FONT, break: 'never' as const, extraWidth: CHIP_CHROME_WIDTH }
    }
    const style = TEXT_STYLES[spec.style]
    return { text: spec.text, font: style.font, extraWidth: style.extraWidth }
  }),
)

const bodyWidth = ref(BODY_DEFAULT_WIDTH)
const maxBodyWidth = ref(500)

onMounted(() => {
  const screenWidth = Screen.mainScreen.widthDIPs
  maxBodyWidth.value = Math.max(BODY_MIN_WIDTH, Math.floor(screenWidth - 40))
  bodyWidth.value = Math.min(maxBodyWidth.value, BODY_DEFAULT_WIDTH)
})

type LineFragment = { className: string; leadingGap: number; text: string }
type RichLine = { fragments: LineFragment[] }

const lines = computed<RichLine[]>(() => {
  const result: RichLine[] = []
  walkRichInlineLineRanges(flow, bodyWidth.value, range => {
    const line = materializeRichInlineLineRange(flow, range)
    result.push({
      fragments: line.fragments.map(frag => ({
        className: classNames[frag.itemIndex]!,
        leadingGap: frag.gapBefore,
        text: frag.text,
      })),
    })
  })
  return result
})

const lineCount = computed(() => lines.value.length)
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
.note-container {
  padding: 16;
  background-color: white;
}
.line-row {
  margin-bottom: 2;
}
.frag {
  font-size: 17;
}
.frag--body {
  color: #1e293b;
}
.frag--link {
  color: #3b82f6;
  font-weight: 600;
}
.frag--code {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 14;
  background-color: #f1f5f9;
  color: #0f172a;
  border-radius: 4;
  padding: 0 4;
}
.chip {
  border-radius: 10;
  padding: 2 8;
  font-size: 12;
  font-weight: 700;
  margin: 0 2;
}
.chip--mention { background-color: #dbeafe; color: #1d4ed8; }
.chip--status  { background-color: #fef3c7; color: #92400e; }
.chip--priority{ background-color: #fee2e2; color: #991b1b; }
.chip--time    { background-color: #d1fae5; color: #065f46; }
.chip--count   { background-color: #f3f4f6; color: #374151; }
</style>
