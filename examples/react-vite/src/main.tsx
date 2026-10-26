import { createRoot } from 'react-dom/client'
// Register every element once, before the first render, and load the theme tokens.
import 'tickslate/elements'
import 'tickslate/tokens.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
