// 🔄 Les Corvées équitables : STG regarde qui a VRAIMENT fait quoi sur 30
// jours (en minutes) et répartit les tâches ouvertes pour rééquilibrer —
// avec la mauvaise foi en moins et l'humour en plus.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { muter } from '@/lib/sync'
import { utiliserSession } from '@/etat/session'
import { utiliserTachesOuvertes, utiliserTachesFaites } from '@/lib/requetes'
import { couleurMembre } from '@/lib/couleurs'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranCorvees() {
  const { membres } = utiliserSession()
  const clientRequetes = useQueryClient()
  const ouvertes = utiliserTachesOuvertes()
  const faites = utiliserTachesFaites()
  const [reparti, setReparti] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const adultes = membres.filter((m) => m.role === 'adult')

  // Les minutes RÉELLES des 30 derniers jours, par adulte.
  const minutes = new Map<string, number>(adultes.map((a) => [a.id, 0]))
  for (const t of faites.data ?? []) {
    if (t.faite_par && minutes.has(t.faite_par)) {
      minutes.set(t.faite_par, (minutes.get(t.faite_par) ?? 0) + t.effort_minutes)
    }
  }
  const totalMinutes = [...minutes.values()].reduce((s, m) => s + m, 0)

  const nonAssignees = (ouvertes.data ?? []).filter((t) => t.assignee_id === null)

  const repartir = async () => {
    if (adultes.length < 2 || nonAssignees.length === 0) return
    setEnCours(true)
    try {
      // Chaque tâche va à l'adulte le moins chargé (minutes réelles + minutes
      // déjà attribuées dans cette répartition) — simple, juste, incontestable.
      const charge = new Map<string, number>(adultes.map((a) => [a.id, minutes.get(a.id) ?? 0]))
      const attribution: { tache: string; a: string }[] = []
      const triees = [...nonAssignees].sort((a, b) => b.effort_minutes - a.effort_minutes)
      for (const t of triees) {
        const [moinsCharge] = [...charge.entries()].sort((a, b) => a[1] - b[1])
        if (!moinsCharge) continue
        await muter({ table: 'taches', type: 'update', cible_id: t.id, charge: { assignee_id: moinsCharge[0] } })
        charge.set(moinsCharge[0], moinsCharge[1] + t.effort_minutes)
        attribution.push({ tache: t.titre, a: adultes.find((x) => x.id === moinsCharge[0])?.prenom ?? '?' })
      }
      await clientRequetes.invalidateQueries({ queryKey: ['taches'] })
      const parPrenom = new Map<string, number>()
      for (const x of attribution) parPrenom.set(x.a, (parPrenom.get(x.a) ?? 0) + 1)
      setReparti(
        `⚖️ ${attribution.length} tâche${attribution.length > 1 ? 's' : ''} réparties : ` +
          [...parPrenom.entries()].map(([p, n]) => `${p} en prend ${n}`).join(', ') +
          '. La balance a parlé.',
      )
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🔄 Corvées équitables</h1>
        <p className="text-legende text-encre-3">La balance des 30 derniers jours ne ment pas.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Carte>
          <p className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">⚖️ Qui a fait quoi (30 j)</p>
          {adultes.map((a) => {
            const m = minutes.get(a.id) ?? 0
            const pct = totalMinutes > 0 ? Math.round((m / totalMinutes) * 100) : 50
            return (
              <div key={a.id} className="flex items-center gap-3 py-1.5">
                <PastilleMembre membre={a} taille={30} />
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-fond-sourd">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(4, pct)}%`, background: couleurMembre(a.couleur) }}
                  />
                </div>
                <span className="chiffres w-24 text-right text-legende text-encre-2">{m} min · {pct} %</span>
              </div>
            )
          })}
          {totalMinutes === 0 && (
            <p className="text-legende text-encre-3">Aucune tâche cochée sur 30 jours — la balance démarre à zéro.</p>
          )}
        </Carte>

        {nonAssignees.length === 0 ? (
          <EtatVide
            titre="Tout est déjà attribué"
            message="Aucune tâche ouverte sans responsable. Crée des tâches sans les assigner, et STG les répartira équitablement ici."
          />
        ) : (
          <>
            <p className="text-corps-2 text-encre-2">
              {nonAssignees.length} tâche{nonAssignees.length > 1 ? 's' : ''} sans responsable :{' '}
              {nonAssignees.slice(0, 6).map((t) => t.titre).join(', ')}{nonAssignees.length > 6 ? '…' : ''}
            </p>
            <Bouton pleineLargeur variante="primaire" desactive={enCours || adultes.length < 2} onClick={() => void repartir()}>
              {enCours ? 'La balance pèse…' : '⚖️ STG, répartis équitablement !'}
            </Bouton>
          </>
        )}

        {reparti && <p className="rounded-lg bg-sauge/15 px-3 py-2 text-corps-2 text-encre">{reparti}</p>}

        <p className="text-legende text-encre-3">
          La règle : chaque tâche va à l'adulte le moins chargé en minutes réelles (les grosses d'abord).
          Personne ne peut discuter avec des minutes. 😄
        </p>
      </div>
    </div>
  )
}
