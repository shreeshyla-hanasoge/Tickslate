import { createApp } from 'vue'
// Register every element once, before the first render, and load the theme tokens.
import 'tickslate/elements'
import 'tickslate/tokens.css'
import App from './App.vue'

createApp(App).mount('#app')
