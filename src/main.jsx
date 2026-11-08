import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)
