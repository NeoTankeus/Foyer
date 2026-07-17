// Voyages : liste + création. La valise des trois est générée à la création.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { creerVoyage, utiliserVoyages } from './donnees'
import { differenceInCalendarDays, maintenantLocal } from '@/lib/dates'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranVoyages() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const naviguer = useNavigate()
  const voyages = utiliserVoyages()
  const [creation, setCreation] = useState(false)

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-titre-3 text-encre">Voyages</h2>
        {membre?.role === 'adult' && (
          <Bouton variante="discret" onClick={() => setCreation(true)} etiquette="Nouveau voyage">+</Bouton>
        )}
      </div>

      {(voyages.data?.length ?? 0) === 0 && !voyages.isLoading && (
        <EtatVide
          titre="Aucun voyage prévu"
          message="Crée-le en 10 secondes : les valises de toute la famille se génèrent toutes seules."
        />
      )}

      <ul className="flex flex-col gap-2">
        {(voyages.data ?? []).map((v) => {
          const dans = v.debut
            ? differenceInCalendarDays(new Date(`${v.debut}T12:00:00`), maintenantLocal())
            : null
          return (
            <li key={v.id}>
              <button
                onClick={() => naviguer(`/nous/voyages/${v.id}`)}
                className="w-full rounded-lg bg-fond-eleve p-4 text-left shadow-carte"
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-corps font-[590] text-encre">{v.titre}</p>
                  {dans !== null && dans >= 0 && (
                    <span className="chiffres text-note font-[590] text-ardoise">J-{dans}</span>
                  )}
                </div>
                <p className="text-note text-encre-3">
                  {v.destination ?? ''}
                  {v.debut && v.fin
                    ? ` · du ${new Date(v.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${new Date(v.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                    : ''}
                </p>
              </button>
            </li>
          )
        })}
      </ul>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouveau voyage">
        {foyer && (
          <FormVoyage
            surCreation={async (brouillon) => {
              const id = await creerVoyage(foyer.id, membres, brouillon)
              await clientRequetes.invalidateQueries({ queryKey: ['voyages'] })
              setCreation(false)
              naviguer(`/nous/voyages/${id}`)
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormVoyage({
  surCreation,
}: {
  surCreation: (b: { titre: string; destination: string | null; debut: string | null; fin: string | null }) => Promise<void>
}) {
  const [titre, setTitre] = useState('')
  const [destination, setDestination] = useState('')
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [enCours, setEnCours] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Titre" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Pays basque en août" />
      <ChampTexte etiquette="Destination (ville)" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Biarritz" />
      <div className="flex gap-3">
        <ChampTexte etiquette="Départ" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
        <ChampTexte etiquette="Retour" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
      </div>
      <Bouton
        pleineLargeur
        desactive={enCours}
        onClick={() => {
          if (!titre.trim()) return
          setEnCours(true)
          void surCreation({
            titre: titre.trim(),
            destination: destination.trim() || null,
            debut: debut || null,
            fin: fin || null,
          })
        }}
      >
        {enCours ? 'Préparation des valises…' : 'Créer le voyage'}
      </Bouton>
      <p className="text-legende text-encre-3">
        À la création : une valise par personne (le doudou de Gabriel en tête) et la checklist maison.
      </p>
    </div>
  )
}
