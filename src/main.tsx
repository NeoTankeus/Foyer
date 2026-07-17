import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { demarrerSyncAuRetourDuReseau } from './lib/sync'
import './design/tokens.css'

const clientRequetes = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

demarrerSyncAuRetourDuReseau()

// Après un déploiement, un ancien onglet peut charger un morceau d'app périmé :
// au lieu d'une page blanche, on recharge proprement la nouvelle version.
window.addEventListener('vite:preloadError', (evenement) => {
  evenement.preventDefault()
  window.location.reload()
})

const racine = document.getElementById('racine')
if (!racine) throw new Error('Élément racine introuvable')

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={clientRequetes}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
