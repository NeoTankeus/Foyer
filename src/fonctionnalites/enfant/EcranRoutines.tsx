// Routines matin/soir de Gabriel : étapes chronométrées, une à la fois, plein écran.
// Ça résout un vrai problème à 7 h 30.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { dateIsoJour, maintenantLocal } from '@/lib/dates'
import type { LigneRoutine } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { ExecutionRoutine } from './ExecutionRoutine'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranRoutines() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [creation, setCreation] = useState(false)
  const [enCours, setEnCours] = useState<LigneRoutine | null>(null)

  const enfants = membres.filter((m) => m.role === 'child')

  const routines = useQuery({
    queryKey: ['routines'],
    queryFn: () =>
      lireAvecRepli<LigneRoutine>('routines', async () => {
        const { data, error } = await supabase.from('routines').select('*').eq('active', true)
        if (error) throw error
        return data
      }),
  })

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">Routines</h2>
        {membre?.role === 'adult' && (
          <Bouton variante="discret" onClick={() => setCreation(true)} etiquette="Nouvelle routine">+</Bouton>
        )}
      </div>
      <p className="mb-3 text-note text-encre-3">
        Étapes chronométrées, une à la fois, plein écran. Tends le téléphone à Gabriel et lance.
      </p>

      {(routines.data?.length ?? 0) === 0 && !routines.isLoading && (
        <EtatVide
          titre="Aucune routine"
          message="Se lever → habillage → petit-déj → dents → cartable. Crée-la une fois, elle sert tous les matins."
        />
      )}

      <ul className="flex flex-col gap-2">
        {(routines.data ?? []).map((r) => {
          const proprietaire = membres.find((m) => m.id === r.membre_id)
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-md bg-fond-eleve p-3 shadow-carte">
              <div className="flex-1">
                <p className="text-corps text-encre">{r.nom}</p>
                <p className="text-legende text-encre-3">
                  {proprietaire?.prenom} · {r.moment === 'matin' ? 'matin' : 'soir'} · {r.etapes.length} étapes
                </p>
              </div>
              <Bouton onClick={() => setEnCours(r)}>Lancer</Bouton>
            </li>
          )
        })}
      </ul>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouvelle routine">
        {foyer && enfants.length > 0 && (
          <FormRoutine
            surCreation={async (b) => {
              const id = crypto.randomUUID()
              await muter({
                table: 'routines', type: 'insert', cible_id: id,
                charge: { id, foyer_id: foyer.id, active: true, ...b },
              })
              await clientRequetes.invalidateQueries({ queryKey: ['routines'] })
              setCreation(false)
            }}
            enfantId={enfants[0]?.id ?? ''}
          />
        )}
      </Feuille>

      {enCours && (
        <ExecutionRoutine
          routine={enCours}
          onTerminer={async () => {
            const id = crypto.randomUUID()
            await muter({
              table: 'routine_executions', type: 'insert', cible_id: id,
              charge: {
                id, routine_id: enCours.id, date: dateIsoJour(maintenantLocal()),
                etapes_faites: enCours.etapes.map((_, i) => i),
                terminee_le: new Date().toISOString(),
              },
            })
            setEnCours(null)
          }}
          onFermer={() => setEnCours(null)}
        />
      )}
    </div>
  )
}

const ICONES = ['🌞', '👕', '🥣', '🪥', '🎒', '🛁', '📚', '🌙', '🧸', '🧦']

function FormRoutine({
  surCreation,
  enfantId,
}: {
  surCreation: (b: {
    membre_id: string
    nom: string
    moment: 'matin' | 'soir'
    etapes: { libelle: string; icone: string; duree_secondes: number }[]
  }) => Promise<void>
  enfantId: string
}) {
  const [nom, setNom] = useState('')
  const [moment, setMoment] = useState<'matin' | 'soir'>('matin')
  const [etapes, setEtapes] = useState<{ libelle: string; icone: string; duree_secondes: number }[]>([])
  const [libelle, setLibelle] = useState('')
  const [icone, setIcone] = useState('🌞')
  const [minutes, setMinutes] = useState(5)

  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Le matin d’école" />
      <div className="flex rounded-md bg-fond-sourd p-0.5">
        {(['matin', 'soir'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMoment(m)}
            aria-pressed={moment === m}
            className={`min-h-sur-tactile flex-1 rounded-[8px] text-corps-2 font-[590]
              ${moment === m ? 'bg-fond-eleve text-encre shadow-carte' : 'text-encre-3'}`}
          >
            {m === 'matin' ? 'Matin' : 'Soir'}
          </button>
        ))}
      </div>

      {etapes.length > 0 && (
        <ol className="flex flex-col gap-1">
          {etapes.map((e, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-fond-sourd px-3 py-2 text-corps-2">
              <span>{e.icone}</span>
              <span className="flex-1">{e.libelle}</span>
              <span className="chiffres text-note text-encre-3">{Math.round(e.duree_secondes / 60)} min</span>
              <button
                onClick={() => setEtapes(etapes.filter((_, j) => j !== i))}
                aria-label={`Retirer ${e.libelle}`}
                className="min-h-[32px] min-w-[32px] text-encre-3"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-md border border-trait p-3">
        <div className="mb-2 flex gap-1 overflow-x-auto">
          {ICONES.map((i) => (
            <button
              key={i}
              onClick={() => setIcone(i)}
              aria-pressed={icone === i}
              className={`min-h-sur-tactile min-w-sur-tactile rounded-md text-titre-3
                ${icone === i ? 'bg-fond-sourd' : ''}`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="S’habiller"
            aria-label="Étape"
            className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
          />
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            aria-label="Durée"
            className="min-h-sur-tactile rounded-md border border-trait bg-fond-eleve px-2 text-corps-2"
          >
            {[2, 3, 5, 10, 15].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
          <Bouton
            variante="discret"
            onClick={() => {
              if (!libelle.trim()) return
              setEtapes([...etapes, { libelle: libelle.trim(), icone, duree_secondes: minutes * 60 }])
              setLibelle('')
            }}
          >
            +
          </Bouton>
        </div>
      </div>

      <Bouton
        pleineLargeur
        onClick={() => {
          if (nom.trim() && etapes.length > 0)
            void surCreation({ membre_id: enfantId, nom: nom.trim(), moment, etapes })
        }}
      >
        Créer la routine
      </Bouton>
    </div>
  )
}
