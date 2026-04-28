<template>
  <Page>
    <ActionBar title="Markdown Chat">
      <NavigationButton text="Back" />
    </ActionBar>
    <GridLayout rows="auto, auto, *">
      <!-- Stats -->
      <StackLayout row="0" class="stats-bar">
        <Label :text="`Width: ${chatWidth}px   Messages: ${messages.length}`" class="stats-label" />
        <Label :text="`Total height: ${totalHeight}px (exact, no DOM reads)`" class="stats-label" />
      </StackLayout>

      <!-- Width slider -->
      <GridLayout row="1" columns="auto, *, auto" class="slider-row">
        <Label col="0" :text="`${MIN_CHAT_WIDTH}`" class="slider-bound" />
        <Slider col="1" v-model="chatWidth" :minValue="MIN_CHAT_WIDTH" :maxValue="maxChatWidth" />
        <Label col="2" :text="`${maxChatWidth}`" class="slider-bound" />
      </GridLayout>

      <!-- Chat messages -->
      <ListView row="2" :items="renderedMessages" @itemTap="() => {}">
        <template #default="{ item }">
          <GridLayout
            columns="*"
            class="message-row"
            :class="item.role === 'user' ? 'message-row--user' : 'message-row--ai'"
          >
            <!-- User message: simple bubble -->
            <StackLayout
              v-if="item.role === 'user'"
              class="bubble bubble--user"
              :style="{ maxWidth: bubbleMaxWidth + 'px' }"
            >
              <Label
                v-for="(block, bi) in item.blocks"
                :key="bi"
                :text="block.text"
                textWrap="true"
                class="bubble-text"
              />
            </StackLayout>

            <!-- AI message: prose blocks -->
            <StackLayout v-else class="message-ai" :style="{ maxWidth: bubbleMaxWidth + 'px' }">
              <StackLayout
                v-for="(block, bi) in item.blocks"
                :key="bi"
                class="ai-block"
                :class="`ai-block--${block.kind}`"
              >
                <Label
                  :text="block.text"
                  textWrap="true"
                  :class="blockLabelClass(block)"
                />
              </StackLayout>
            </StackLayout>
          </GridLayout>
        </template>
      </ListView>
    </GridLayout>
  </Page>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'nativescript-vue'
import { Screen } from '@nativescript/core'
import { layout, prepareWithSegments } from '@pretext/layout'

// --- chat constants ---
export const MIN_CHAT_WIDTH = 280
const DEFAULT_CHAT_WIDTH = 360
const BUBBLE_MAX_RATIO = 0.78
const BODY_FONT = '500 15px -apple-system, sans-serif'
const CODE_FONT = '600 13px "SF Mono", Menlo, monospace'
const HEADING1_FONT = '700 18px -apple-system, sans-serif'
const HEADING2_FONT = '600 16px -apple-system, sans-serif'
const BODY_LINE_HEIGHT = 22
const CODE_LINE_HEIGHT = 18
const HEADING1_LINE_HEIGHT = 28
const HEADING2_LINE_HEIGHT = 25

type BlockKind = 'paragraph' | 'heading1' | 'heading2' | 'code' | 'bullet' | 'blockquote' | 'rule'

type MessageBlock = {
  kind: BlockKind
  text: string
}

type ChatMessage = {
  role: 'user' | 'assistant'
  blocks: MessageBlock[]
}

// Raw seed data (same as markdown-chat.data.ts)
const SEED_MESSAGES: ChatMessage[] = [
  { role: 'user', blocks: [{ kind: 'paragraph', text: 'Can we treat the rich-text inline flow helper (rich-inline) as a real primitive, or is it only good for one tiny demo?\n\nI mostly care about:\n- exact bubble heights\n- virtualization without DOM reads\n- markdown-ish inline styling' }] },
  { role: 'assistant', blocks: [
    { kind: 'paragraph', text: 'Short answer: yes, inside a bounded corridor.' },
    { kind: 'paragraph', text: 'It already handles rich-text inline flow, code, and links like Pretext, while keeping pills and badges atomic. The real pressure starts once a chat bubble stops being one paragraph.' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: "Right. My side is usually short, but your side has Beijing 北京, Arabic مرحبا, emoji 👩‍🚀, and long URLs like https://example.com/reports/q3?lang=ar&mode=full" }] },
  { role: 'assistant', blocks: [
    { kind: 'heading2', text: 'What a chat renderer actually needs' },
    { kind: 'bullet', text: '1. Parse markdown somewhere else.' },
    { kind: 'bullet', text: '2. Normalize it into blocks and inline runs.' },
    { kind: 'bullet', text: '3. Use the rich-text inline flow helper for paragraph-ish content.' },
    { kind: 'bullet', text: '4. Use the pre-wrap path for fenced code.' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: "Then let's stress it with real markdown: nested emphasis, deletions, inline code, links, and a couple messages that are obviously richer on the AI side than on mine." }] },
  { role: 'assistant', blocks: [
    { kind: 'blockquote', text: 'If we know the exact height in advance, then virtualization is no longer guesswork.' },
    { kind: 'blockquote', text: 'It becomes geometry.' },
    { kind: 'paragraph', text: 'That is the whole reason to keep the primitive low-level and composable.' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: 'Okay, but the design matters too. The left side should feel lighter and more editorial, while my side can stay bubble-y.' }] },
  { role: 'assistant', blocks: [
    { kind: 'code', text: 'const frame = buildConversationFrame(templates, width)\nconst visible = findVisibleRange(frame, scrollTop, viewportHeight, topMask, bottomMask)\nrenderMessages(frame, visible.start, visible.end)' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: "I also want code fences, quotes, and lists to show up often enough that the 10k-thread run actually teaches us something." }] },
  { role: 'assistant', blocks: [
    { kind: 'paragraph', text: 'That part is important.' },
    { kind: 'bullet', text: 'paragraph layout is one leaf' },
    { kind: 'bullet', text: 'code fences are another leaf' },
    { kind: 'bullet', text: 'the chat message is the block-level container above both' },
    { kind: 'paragraph', text: 'The assistant side is the real stress test because it keeps hitting headings, bullets, quotes, code fences, and occasional long explanations.' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: 'Try a checklist too. A product chat is full of little status updates.' }] },
  { role: 'assistant', blocks: [
    { kind: 'paragraph', text: 'Current polish pass:' },
    { kind: 'bullet', text: 'lighter body copy is in' },
    { kind: 'bullet', text: 'the assistant lane is bubble-less' },
    { kind: 'bullet', text: 'exact height prediction is wired up' },
    { kind: 'bullet', text: 'mobile screenshot smoke tests still remain' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: 'Can we keep top-level bullets flush? I do not want them shoved way in from the left like an old email client.' }] },
  { role: 'assistant', blocks: [
    { kind: 'paragraph', text: 'Yes. The top-level list should read almost like paragraph rhythm with markers, not like a nested document outline.' },
    { kind: 'paragraph', text: 'Nested lists can still step in when they actually nest.' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: "What about images or chips? Even if they are fake, I want to know the primitive can hold an atomic thing." }] },
  { role: 'assistant', blocks: [
    { kind: 'paragraph', text: 'It can. Something like a diagram chip behaves more like an inline chip than a splittable word, which is exactly the right stress case.' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: 'cool. also make sure the scroll still feels stable when widths change' }] },
  { role: 'assistant', blocks: [
    { kind: 'paragraph', text: 'That is one of the better parts of the demo right now: width changes rebuild the frame, preserve relative scroll intent, and remount only the visible window.' },
  ]},
  { role: 'user', blocks: [{ kind: 'paragraph', text: "One last thing: mention the hypothesis space. I still care a lot about not painting ourselves into a corner." }] },
  { role: 'assistant', blocks: [
    { kind: 'paragraph', text: 'The good version of this alpha API is not "we solved rich text." It is "we found a low-level paragraph leaf that keeps the hypothesis space open for a richer block model above it."' },
  ]},
]

// --- pre-computed layout heights ---
type PreparedBlock = {
  kind: BlockKind
  text: string
  font: string
  lineHeight: number
}

type PreparedMessage = {
  role: 'user' | 'assistant'
  blocks: PreparedBlock[]
}

function fontForBlock(kind: BlockKind): string {
  if (kind === 'code') return CODE_FONT
  if (kind === 'heading1') return HEADING1_FONT
  if (kind === 'heading2') return HEADING2_FONT
  return BODY_FONT
}

function lineHeightForBlock(kind: BlockKind): number {
  if (kind === 'code') return CODE_LINE_HEIGHT
  if (kind === 'heading1') return HEADING1_LINE_HEIGHT
  if (kind === 'heading2') return HEADING2_LINE_HEIGHT
  return BODY_LINE_HEIGHT
}

// Prepare texts once at module level
const preparedMessages: PreparedMessage[] = SEED_MESSAGES.map(msg => ({
  role: msg.role,
  blocks: msg.blocks.map(block => ({
    kind: block.kind,
    text: block.text,
    font: fontForBlock(block.kind),
    lineHeight: lineHeightForBlock(block.kind),
  })),
}))

// ---

const chatWidth = ref(DEFAULT_CHAT_WIDTH)
const maxChatWidth = ref(600)

onMounted(() => {
  const screenWidth = Screen.mainScreen.widthDIPs
  maxChatWidth.value = Math.floor(screenWidth - 32)
  chatWidth.value = Math.min(maxChatWidth.value, DEFAULT_CHAT_WIDTH)
})

const bubbleMaxWidth = computed(() => Math.floor(chatWidth.value * BUBBLE_MAX_RATIO))

type RenderedBlock = { kind: BlockKind; text: string; height: number }
type RenderedMessage = {
  role: 'user' | 'assistant'
  blocks: RenderedBlock[]
  totalHeight: number
}

const renderedMessages = computed<RenderedMessage[]>(() => {
  const maxW = bubbleMaxWidth.value - 32 // account for padding
  return preparedMessages.map(msg => {
    const blocks: RenderedBlock[] = msg.blocks.map(block => {
      const prepared = prepareWithSegments(block.text, block.font)
      const result = layout(prepared, maxW, block.lineHeight)
      return {
        kind: block.kind,
        text: block.text,
        height: result.height,
      }
    })
    return {
      role: msg.role,
      blocks,
      totalHeight: blocks.reduce((sum, b) => sum + b.height + 4, 0) + 20,
    }
  })
})

// Use a flat array for the ListView
const messages = computed(() => renderedMessages.value)

const totalHeight = computed(() =>
  renderedMessages.value.reduce((sum, msg) => sum + msg.totalHeight + 12, 0),
)

function blockLabelClass(block: RenderedBlock): string {
  return `ai-text ai-text--${block.kind}`
}
</script>

<style scoped>
.stats-bar {
  padding: 10 16;
  background-color: #f3f4f6;
  border-bottom-width: 1;
  border-bottom-color: #d1d5db;
}
.stats-label { font-size: 12; color: #6b7280; margin-bottom: 2; }
.slider-row { padding: 8 16; background-color: white; }
.slider-bound { font-size: 11; color: #9ca3af; vertical-align: center; }

.message-row { padding: 6 16; }
.message-row--user { horizontal-align: right; }
.message-row--ai { horizontal-align: left; }

.bubble {
  padding: 10 14;
  border-radius: 18;
  margin-bottom: 2;
}
.bubble--user {
  background-color: #3b82f6;
}
.bubble-text {
  color: white;
  font-size: 15;
  line-height: 22;
}

.message-ai { padding: 4 0; }
.ai-block { margin-bottom: 4; }
.ai-block--code {
  background-color: #1e293b;
  border-radius: 8;
  padding: 10 12;
}
.ai-block--blockquote {
  border-left-width: 3;
  border-left-color: #94a3b8;
  padding-left: 12;
  margin-left: 4;
}

.ai-text { color: #1e293b; }
.ai-text--paragraph { font-size: 15; line-height: 22; }
.ai-text--heading1 { font-size: 18; font-weight: 700; line-height: 28; }
.ai-text--heading2 { font-size: 16; font-weight: 600; line-height: 25; }
.ai-text--bullet { font-size: 15; line-height: 22; margin-left: 8; }
.ai-text--blockquote { font-size: 15; line-height: 22; color: #64748b; }
.ai-text--code { font-family: "SF Mono", Menlo, monospace; font-size: 13; line-height: 18; color: #e2e8f0; }
.ai-text--rule { color: #94a3b8; }
</style>
