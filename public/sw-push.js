// Réception des notifications push (brief du matin, colis livré, baisse de prix…)
// + pastille rouge sur l'icône StiGa (iOS 16.4+) : chaque push l'incrémente,
// l'app remet le vrai compte à l'ouverture.

const BADGE_DB = 'stiga-badge'

function lireCompteur() {
  return new Promise((resoudre) => {
    try {
      const demande = indexedDB.open(BADGE_DB, 1)
      demande.onupgradeneeded = () => demande.result.createObjectStore('c')
      demande.onsuccess = () => {
        const bd = demande.result
        const lecture = bd.transaction('c', 'readonly').objectStore('c').get('n')
        lecture.onsuccess = () => resoudre(Number(lecture.result) || 0)
        lecture.onerror = () => resoudre(0)
      }
      demande.onerror = () => resoudre(0)
    } catch {
      resoudre(0)
    }
  })
}

function ecrireCompteur(n) {
  return new Promise((resoudre) => {
    try {
      const demande = indexedDB.open(BADGE_DB, 1)
      demande.onupgradeneeded = () => demande.result.createObjectStore('c')
      demande.onsuccess = () => {
        const tx = demande.result.transaction('c', 'readwrite')
        tx.objectStore('c').put(n, 'n')
        tx.oncomplete = () => resoudre(undefined)
        tx.onerror = () => resoudre(undefined)
      }
      demande.onerror = () => resoudre(undefined)
    } catch {
      resoudre(undefined)
    }
  })
}

self.addEventListener('push', (evenement) => {
  let donnees = { titre: 'StiGa', corps: '' }
  try {
    donnees = evenement.data.json()
  } catch {
    donnees.corps = evenement.data ? evenement.data.text() : ''
  }
  evenement.waitUntil(
    (async () => {
      await self.registration.showNotification(donnees.titre || 'StiGa', {
        body: donnees.corps || '',
        icon: '/icones/icone-192.png',
        badge: '/icones/icone-192.png',
        data: { url: donnees.url || '/' },
      })
      // La pastille rouge sur l'icône : +1 par notification reçue.
      try {
        const compte = (await lireCompteur()) + 1
        await ecrireCompteur(compte)
        await self.navigator.setAppBadge?.(compte)
      } catch {
        // badge non supporté : la notification suffit
      }
    })(),
  )
})

// L'app (ouverte) envoie le vrai compte de choses en attente — on aligne.
self.addEventListener('message', (evenement) => {
  const donnees = evenement.data
  if (donnees && donnees.type === 'badge') {
    const n = Number(donnees.n) || 0
    evenement.waitUntil?.(
      (async () => {
        await ecrireCompteur(n)
        try {
          if (n > 0) await self.navigator.setAppBadge?.(n)
          else await self.navigator.clearAppBadge?.()
        } catch {
          // rien
        }
      })(),
    )
  }
})

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close()
  evenement.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      const ouverte = fenetres.find((f) => 'focus' in f)
      if (ouverte) return ouverte.focus()
      return self.clients.openWindow(evenement.notification.data?.url || '/')
    }),
  )
})
