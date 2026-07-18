import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { demarrerSyncAuRetourDuReseau } from './lib/sync'
import { retenirEnregistrementSw } from './lib/maj'
import './design/tokens.css'

// Mise à jour SANS réinstaller : on revérifie la version à chaque retour au
// premier plan (et toutes les 15 min) — dès qu'une nouvelle version est là,
// l'app se recharge toute seule. Plus jamais besoin de supprimer le raccourci.
registerSW({
  immediate: true,
  onRegisteredSW(_url, enregistrement) {
    if (!enregistrement) return
    retenirEnregistrementSw(enregistrement)
    const verifier = () => void enregistrement.update().catch(() => undefined)
    setInterval(verifier, 15 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verifier()
    })
  },
})

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
