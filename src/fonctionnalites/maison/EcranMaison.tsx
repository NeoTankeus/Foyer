// Maison : les tâches et les courses, côte à côte.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EcranTaches } from '@/fonctionnalites/taches/EcranTaches'
import { EcranCourses } from '@/fonctionnalites/courses/EcranCourses'
import { EcranMenus } from '@/fonctionnalites/repas/EcranMenus'
import { EcranMur } from '@/fonctionnalites/mur/EcranMur'

type Volet = 'taches' | 'courses' | 'menus' | 'mur'

export function EcranMaison() {
  const [parametres] = useSearchParams()
  // Le raccourci PWA « Ajouter aux courses » ouvre directement le bon volet.
  const [volet, setVolet] = useState<Volet>(() => {
    const demande = parametres.get('volet')
    if (demande === 'mur' || demande === 'menus' || demande === 'courses' || demande === 'taches') return demande
    return parametres.get('ajout') === 'courses' ? 'courses' : 'taches'
  })

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <h1 className="text-titre-2 text-encre">Maison</h1>
        <div className="mt-2 flex gap-1 rounded-2xl bg-fond-sourd p-1" role="tablist">
          {(
            [
              ['taches', '✅ Tâches', 'var(--ardoise)'],
              ['courses', '🛒 Courses', 'var(--sauge)'],
              ['menus', '🍽️ Menus', 'var(--ambre)'],
              ['mur', '📌 Le Mur', 'var(--prune)'],
            ] as const
          ).map(([valeur, libelle, couleur]) => (
            <button
              key={valeur}
              role="tab"
              aria-selected={volet === valeur}
              onClick={() => {
                navigator.vibrate?.(4)
                setVolet(valeur)
              }}
              className={`min-h-sur-tactile flex-1 rounded-xl text-note font-[590] transition-colors
                ${volet === valeur ? 'bg-fond-eleve shadow-carte' : 'text-encre-3'}`}
              style={volet === valeur ? { color: couleur } : undefined}
            >
              {libelle}
            </button>
          ))}
        </div>
      </header>
      <div className="px-4 pt-3">
        {volet === 'taches' && <EcranTaches />}
        {volet === 'courses' && <EcranCourses />}
        {volet === 'menus' && <EcranMenus />}
        {volet === 'mur' && <EcranMur />}
      </div>
    </div>
  )
}
