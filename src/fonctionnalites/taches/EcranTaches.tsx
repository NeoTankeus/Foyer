// Tâches : récurrences RRULE, rotation automatique, effort en minutes.
// La charge invisible (« penser à », « prendre RDV ») est une tâche comme une autre.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { muter } from '@/lib/sync'
import { completerTache, creerTache, utiliserTachesOuvertes } from '@/lib/requetes'
import { RECURRENCES_PROPOSEES } from '@/lib/recurrence'
import { dateIsoJour, maintenantLocal } from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'
import type { LigneTache } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Coche } from '@/design/composants/Coche'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranTaches() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const taches = utiliserTachesOuvertes()
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [confirmeSuppr, setConfirmeSuppr] = useState<string | null>(null)

  const aujourdHui = dateIsoJour(maintenantLocal())

  const completer = (tache: LigneTache) => {
    if (!membre) return
    void completerTache(tache, membre.id, membres).then(() =>
      clientRequetes.invalidateQueries({ queryKey: ['taches'] }),
    )
  }

  const groupes: { titre: string; filtre: (t: LigneTache) => boolean }[] = [
    { titre: 'En retard', filtre: (t) => t.echeance !== null && t.echeance < aujourdHui },
    { titre: 'Aujourd’hui', filtre: (t) => t.echeance === aujourdHui },
    { titre: 'À venir', filtre: (t) => t.echeance !== null && t.echeance > aujourdHui },
    { titre: 'Un jour', filtre: (t) => t.echeance === null },
  ]

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <h2 className="text-titre-3 text-encre">Tâches</h2>
        {membre?.role === 'adult' && (
          <Bouton variante="discret" onClick={() => setCreationOuverte(true)} etiquette="Nouvelle tâche">
            +
          </Bouton>
        )}
      </div>

      {(taches.data?.length ?? 0) === 0 && !taches.isLoading && (
        <EtatVide titre="Rien à faire" message="Ajoute une tâche — elle peut revenir toute seule chaque semaine." />
      )}

      {groupes.map((groupe) => {
        const lignes = (taches.data ?? []).filter(groupe.filtre)
        if (lignes.length === 0) return null
        return (
          <section key={groupe.titre} className="mb-4">
            <h3 className="mb-1 px-1 text-note font-[590] uppercase tracking-wide text-encre-3">
              {groupe.titre}
            </h3>
            <ul className="flex flex-col gap-1">
              {lignes.map((tache) => {
                const assignee = membres.find((m) => m.id === tache.assignee_id)
                return (
                  <li
                    key={tache.id}
                    className="flex items-center gap-2 rounded-md bg-fond-eleve px-2 py-1 shadow-carte"
                  >
                    <Coche
                      cochee={false}
                      onBascule={() => completer(tache)}
                      etiquette={`Marquer « ${tache.titre} » comme faite`}
                      couleur={assignee ? couleurMembre(assignee.couleur) : undefined}
                    />
                    <div className="flex-1">
                      <p className="text-corps text-encre">{tache.titre}</p>
                      <p className="chiffres text-legende text-encre-3">
                        {tache.effort_minutes} min
                        {tache.rrule ? ' · récurrente' : ''}
                        {tache.groupe_rotation ? ' · en rotation' : ''}
                      </p>
                    </div>
                    {assignee && <PastilleMembre membre={assignee} taille={22} />}
                    <button
                      onClick={() => {
                        if (confirmeSuppr === tache.id) {
                          setConfirmeSuppr(null)
                          void muter({ table: 'taches', type: 'delete', cible_id: tache.id, charge: {} }).then(() =>
                            clientRequetes.invalidateQueries({ queryKey: ['taches'] }),
                          )
                        } else {
                          navigator.vibrate?.(4)
                          setConfirmeSuppr(tache.id)
                        }
                      }}
                      aria-label={`Supprimer « ${tache.titre} »`}
                      className={`flex min-h-sur-tactile items-center justify-center rounded-md px-2 text-note
                        ${confirmeSuppr === tache.id ? 'bg-urgent font-[700] text-white' : 'text-encre-3'}`}
                    >
                      {confirmeSuppr === tache.id ? 'Sûr ?' : '🗑'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {foyer && membre && (
        <FeuilleNouvelleTache
          ouverte={creationOuverte}
          onFermer={() => setCreationOuverte(false)}
          onCreer={async (brouillon) => {
            await creerTache(foyer.id, membre.id, brouillon)
            await clientRequetes.invalidateQueries({ queryKey: ['taches'] })
            setCreationOuverte(false)
          }}
        />
      )}
    </div>
  )
}

interface PropsCreation {
  ouverte: boolean
  onFermer: () => void
  onCreer: (brouillon: {
    titre: string
    assignee_id: string | null
    echeance: string | null
    rrule: string | null
    effort_minutes: number
    groupe_rotation: string | null
    points: number
  }) => Promise<void>
}

function FeuilleNouvelleTache({ ouverte, onFermer, onCreer }: PropsCreation) {
  const { membres } = utiliserSession()
  const [titre, setTitre] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [echeance, setEcheance] = useState('')
  const [regle, setRegle] = useState<string | null>(null)
  const [effort, setEffort] = useState(10)
  const [rotation, setRotation] = useState(false)
  const [points, setPoints] = useState(0)

  const assigneEstEnfant = membres.find((m) => m.id === assignee)?.role === 'child'

  const valider = async () => {
    if (!titre.trim()) return
    await onCreer({
      titre: titre.trim(),
      assignee_id: assignee,
      echeance: echeance || null,
      rrule: regle,
      effort_minutes: effort,
      groupe_rotation: rotation && regle ? titre.trim().toLowerCase() : null,
      points: assigneEstEnfant ? points : 0,
    })
    setTitre('')
    setEcheance('')
    setRegle(null)
    setRotation(false)
    setPoints(0)
  }

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Nouvelle tâche">
      <div className="flex flex-col gap-3">
        <ChampTexte
          etiquette="Titre"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Sortir les poubelles, prendre RDV…"
        />
        <div>
          <span className="mb-1 block text-note font-[500] text-encre-2">Pour qui ?</span>
          <div className="flex gap-1">
            {membres
              .filter((m) => m.role !== 'guest')
              .map((m) => (
                <PastilleMembre
                  key={m.id}
                  membre={m}
                  taille={34}
                  estompee={assignee !== null && assignee !== m.id}
                  onClick={() => setAssignee(assignee === m.id ? null : m.id)}
                />
              ))}
          </div>
        </div>
        <ChampTexte
          etiquette="Échéance (facultatif)"
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-note font-[500] text-encre-2">Répétition</span>
          <select
            value={regle ?? ''}
            onChange={(e) => setRegle(e.target.value || null)}
            className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps text-encre"
          >
            {RECURRENCES_PROPOSEES.map((option) => (
              <option key={option.libelle} value={option.regle ?? ''}>
                {option.libelle}
              </option>
            ))}
          </select>
        </label>
        {regle && (
          <label className="flex min-h-sur-tactile items-center justify-between">
            <span className="text-corps-2 text-encre">Alterner entre les adultes</span>
            <input
              type="checkbox"
              checked={rotation}
              onChange={(e) => setRotation(e.target.checked)}
              className="h-6 w-6"
            />
          </label>
        )}
        {assigneEstEnfant && (
          <label className="block">
            <span className="mb-1 block text-note font-[500] text-encre-2">
              Mission : points gagnés à la complétion
            </span>
            <select
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps text-encre"
            >
              <option value={0}>Sans points</option>
              <option value={5}>5 points</option>
              <option value={10}>10 points</option>
              <option value={20}>20 points</option>
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-note font-[500] text-encre-2">
            Effort estimé — la charge invisible compte aussi
          </span>
          <select
            value={effort}
            onChange={(e) => setEffort(Number(e.target.value))}
            className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps text-encre"
          >
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={20}>20 min</option>
            <option value={45}>45 min</option>
            <option value={90}>1 h 30</option>
          </select>
        </label>
        <Bouton pleineLargeur onClick={() => void valider()}>
          Ajouter
        </Bouton>
      </div>
    </Feuille>
  )
}
