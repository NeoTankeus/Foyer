// Le Débrief : la semaine écoulée en 2 minutes — qui a fait quoi, ce qui
// s'est passé, ce qui arrive. Façon récap d'année, mais chaque dimanche.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { utiliserEvenementsPeriode, utiliserTachesFaites } from '@/lib/requetes'
import { addDays, bornesJourneeLocale, formatHeure, maintenantLocal } from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { Carte } from '@/design/composants/Carte'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranDebrief() {
  const { membres } = utiliserSession()

  // La semaine en cours : du lundi au dimanche soir.
  const maintenant = maintenantLocal()
  const decalage = (maintenant.getDay() + 6) % 7
  const lundi = addDays(new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()), -decalage)
  const debutSemaine = bornesJourneeLocale(lundi).debut
  const finSemaine = bornesJourneeLocale(addDays(lundi, 6)).fin
  const finSemaineProchaine = bornesJourneeLocale(addDays(lundi, 13)).fin

  const faites = utiliserTachesFaites()
  const passes = utiliserEvenementsPeriode(debutSemaine, finSemaine)
  const prochains = utiliserEvenementsPeriode(finSemaine, finSemaineProchaine)

  const souvenirs = useQuery({
    queryKey: ['souvenirs', 'semaine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('souvenirs').select('id' as '*').gte('cree_le', debutSemaine)
      if (error) return 0
      return data.length
    },
  })
  const mur = useQuery({
    queryKey: ['mur', 'semaine'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mur').select('*').gte('cree_le', debutSemaine)
      if (error) return 0
      return (data ?? []).length
    },
  })

  const faitesSemaine = (faites.data ?? []).filter((t) => (t.faite_le ?? '') >= debutSemaine)
  const parPersonne = membres
    .filter((m) => m.role === 'adult')
    .map((m) => {
      const siennes = faitesSemaine.filter((t) => t.faite_par === m.id)
      return { membre: m, nombre: siennes.length, minutes: siennes.reduce((s, t) => s + t.effort_minutes, 0) }
    })
  const totalMinutes = parPersonne.reduce((s, p) => s + p.minutes, 0)

  const semaineProchaine = (prochains.data ?? []).filter((e) => !e.journee_entiere).slice(0, 6)

  return (
    <div className="px-5 pb-6 pt-3">
      <BarreRetour vers="/nous" />
      <h2 className="pb-1 text-titre-3 text-encre">📊 Le Débrief</h2>
      <p className="pb-3 text-note text-encre-3">
        Semaine du{' '}
        {lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} — la vie du foyer, en 2 minutes.
      </p>

      <div className="flex flex-col gap-3">
        <Carte>
          <h3 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">⚖️ Qui a fait quoi</h3>
          {faitesSemaine.length === 0 ? (
            <p className="text-corps-2 text-encre-3">Rien de coché cette semaine (encore).</p>
          ) : (
            parPersonne.map(({ membre: m, nombre, minutes }) => (
              <div key={m.id} className="flex items-center gap-2 py-1">
                <PastilleMembre membre={m} taille={26} />
                <span className="w-20 text-corps-2 text-encre">{m.prenom}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-fond-sourd">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0}%`,
                      background: couleurMembre(m.couleur),
                    }}
                  />
                </div>
                <span className="chiffres w-24 text-right text-legende text-encre-3">
                  {nombre} tâche{nombre > 1 ? 's' : ''} · {minutes} min
                </span>
              </div>
            ))
          )}
        </Carte>

        <Carte>
          <h3 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">✨ La semaine en chiffres</h3>
          <p className="text-corps-2 text-encre-2">
            📅 {(passes.data ?? []).length} événement{(passes.data ?? []).length > 1 ? 's' : ''} ·{' '}
            ✅ {faitesSemaine.length} tâche{faitesSemaine.length > 1 ? 's' : ''} faite{faitesSemaine.length > 1 ? 's' : ''} ·{' '}
            📷 {souvenirs.data ?? 0} souvenir{(souvenirs.data ?? 0) > 1 ? 's' : ''} ·{' '}
            🧲 {mur.data ?? 0} mot{(mur.data ?? 0) > 1 ? 's' : ''} sur le Mur
          </p>
        </Carte>

        <Carte>
          <h3 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🔜 La semaine qui vient</h3>
          {semaineProchaine.length === 0 ? (
            <p className="text-corps-2 text-encre-3">Rien de posé pour l’instant — semaine à écrire.</p>
          ) : (
            semaineProchaine.map((e) => (
              <p key={e.id} className="py-0.5 text-corps-2 text-encre">
                <span className="capitalize">
                  {new Date(e.debut_a).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                </span>{' '}
                · {formatHeure(e.debut_a)} — {e.titre}
              </p>
            ))
          )}
        </Carte>
      </div>
    </div>
  )
}
