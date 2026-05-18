import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { AuthProvider as DescopeProvider } from '@descope/react-sdk';

// Replace with actual Descope Project ID
const descopeProjectId = import.meta.env.VITE_DESCOPE_PROJECT_ID || 'P2n5yQn2m9sQ9';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DescopeProvider projectId={descopeProjectId}>
      <App />
    </DescopeProvider>
  </StrictMode>,
)
