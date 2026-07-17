// Réception des notifications push (brief du matin, colis livré, baisse de prix…)
self.addEventListener('push', (evenement) => {
  let donnees = { titre: 'FOYER', corps: '' }
  try {
    donnees = evenement.data.json()
  } catch {
    donnees.corps = evenement.data ? evenement.data.text() : ''
  }
  evenement.waitUntil(
    self.registration.showNotification(donnees.titre || 'FOYER', {
      body: donnees.corps || '',
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
      data: { url: donnees.url || '/' },
    }),
  )
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
