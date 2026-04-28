<template>
  <Page>
    <ActionBar title="Pretext NS Demos" />
    <StackLayout>
      <Label
        v-for="demo in demos"
        :key="demo.label"
        :text="demo.label"
        class="demo-item"
        @tap="navigate(demo.component)"
      />
    </StackLayout>
  </Page>
</template>

<script lang="ts" setup>
import { $navigateTo } from 'nativescript-vue'
import BubblesView from './BubblesView.vue'
import RichNoteView from './RichNoteView.vue'
import MarkdownChatView from './MarkdownChatView.vue'
import DynamicLayoutView from './DynamicLayoutView.vue'

type Demo = { label: string; component: object }

const demos: Demo[] = [
  { label: '💬  Bubble Shrinkwrap', component: BubblesView },
  { label: '📝  Rich Inline Note', component: RichNoteView },
  { label: '🤖  Markdown Chat', component: MarkdownChatView },
  { label: '📰  Dynamic Layout (two-column)', component: DynamicLayoutView },
]

function navigate(component: object): void {
  void $navigateTo(component, { transition: { name: 'slide' } })
}
</script>

<style scoped>
.demo-item {
  font-size: 18;
  padding: 18 20;
  border-bottom-width: 1;
  border-bottom-color: #e5e7eb;
  background-color: white;
}
</style>
