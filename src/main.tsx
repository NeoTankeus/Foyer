import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { demarrerSyncAuRetourDuReseau } from './lib/sync'
import { detecterMajEnLigne, retenirEnregistrementSw } from './lib/maj'
import './design/tokens.css'

// Mise à jour SANS réinstaller : on revérifie la version à chaque retour au
// premier plan (et toutes les 15 min) — dès qu'une nouvelle version est là,
// l'app se recharge toute seule. Plus jamais besoin de supprimer le raccourci.
registerSW({
  immediate: true,
  onRegisteredSW(_url, enregistrement) {
    if (!enregistrement) return
    retenirEnregistrementSw(enregistrement)
    const verifier = () => {
      void enregistrement.update().catch(() => undefined)
      void detecterMajEnLigne() // comparaison de version directe → pastille rouge
    }
    verifier()
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
      gcTime: 24 * 3600 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// FLUIDITÉ : le dernier état connu est mémorisé sur le téléphone — à
// l'ouverture, l'app s'affiche IMMÉDIATEMENT avec ses données, puis se
// rafraîchit en arrière-plan. Le cache saute à chaque nouvelle version.
const persistant = createSyncStoragePersister({ storage: window.localStorage, key: 'gastif-cache' })

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
    <PersistQueryClientProvider
      client={clientRequetes}
      persistOptions={{ persister: persistant, maxAge: 24 * 3600 * 1000, buster: __DATE_VERSION__ }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)

// L'écran « Coucou Gastif ! » s'efface en douceur une fois l'app montée.
window.setTimeout(() => {
  const splash = document.getElementById('coucou-gastif')
  if (!splash) return
  splash.classList.add('cg-sortie')
  window.setTimeout(() => splash.remove(), 600)
}, 500)
