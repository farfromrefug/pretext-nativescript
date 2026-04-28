// Must be first — registers the NativeScript canvas Vue plugin before any UI is created.
import CanvasPlugin from './canvas-install'

import { createApp } from 'nativescript-vue'
import App from './App.vue'

const app = createApp(App)
app.use(CanvasPlugin)
app.mount()
