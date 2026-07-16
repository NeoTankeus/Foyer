// Maison : les tâches et les courses, côte à côte.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EcranTaches } from '@/fonctionnalites/taches/EcranTaches'
import { EcranCourses } from '@/fonctionnalites/courses/EcranCourses'

type Volet = 'taches' | 'courses'

export function EcranMaison() {
  const [parametres] = useSearchParams()
  // Le raccourci PWA « Ajouter aux courses » ouvre directement le bon volet.
  const [volet, setVolet] = useState<Volet>(parametres.get('ajout') === 'courses' ? 'courses' : 'taches')

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <h1 className="text-titre-2 text-encre">Maison</h1>
        <div className="mt-2 flex rounded-md bg-fond-sourd p-0.5" role="tablist">
          {(
            [
              ['taches', 'Tâches'],
              ['courses', 'Courses'],
            ] as const
          ).map(([valeur, libelle]) => (
            <button
              key={valeur}
              role="tab"
              aria-selected={volet === valeur}
              onClick={() => setVolet(valeur)}
              className={`min-h-sur-tactile flex-1 rounded-[8px] text-corps-2 font-[590]
                ${volet === valeur ? 'bg-fond-eleve text-encre shadow-carte' : 'text-encre-3'}`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </header>
      <div className="px-4 pt-3">{volet === 'taches' ? <EcranTaches /> : <EcranCourses />}</div>
    </div>
  )
}
