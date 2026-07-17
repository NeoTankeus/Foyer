// Le contexte de Gastif : l'état réel du foyer, assemblé à chaque question.
// Jamais d'idées cadeaux ni de contenu « magie » — même pour les adultes,
// Gastif n'en a pas besoin pour répondre, et un enfant peut lire par-dessus l'épaule.
import { supabase } from '@/lib/supabase'
import { bornesJourneeLocale, formatHeure, maintenantLocal, addDays, dateIsoJour } from '@/lib/dates'
import type { LigneMembre } from '@/lib/basedonnees.types'

export async function assemblerContexte(membres: LigneMembre[]): Promise<string> {
  const maintenant = maintenantLocal()
  const lignes: string[] = []

  lignes.push(
    `Date et heure : ${maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${maintenant.getHours()}h${String(maintenant.getMinutes()).padStart(2, '0')} (Europe/Paris).`,
  )
  lignes.push(
    `Membres : ${membres
      .filter((m) => m.role !== 'guest')
      .map((m) => `${m.prenom} (${m.role === 'child' ? 'enfant' : 'adulte'})`)
      .join(', ')}.`,
  )

  const debut = bornesJourneeLocale(addDays(maintenant, -3)).debut
  const fin = bornesJourneeLocale(addDays(maintenant, 14)).fin

  const [evenements, taches, courses, repas] = await Promise.all([
    supabase.from('evenements').select('*').gt('fin_a', debut).lt('debut_a', fin).order('debut_a'),
    supabase.from('taches').select('*').eq('statut', 'a_faire').order('echeance'),
    supabase.from('articles').select('*').eq('coche', false),
    supabase.from('repas').select('*').gte('date', dateIsoJour(maintenant)).lte('date', dateIsoJour(addDays(maintenant, 7))),
  ])

  if (evenements.data && evenements.data.length > 0) {
    lignes.push('Agenda (J-3 à J+14) :')
    for (const e of evenements.data.slice(0, 30)) {
      const qui =
        e.participants.length === 0
          ? 'toute la famille'
          : e.participants
              .map((p: string) => membres.find((m) => m.id === p)?.prenom ?? '?')
              .join(' + ')
      lignes.push(
        `- ${new Date(e.debut_a).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${e.journee_entiere ? '(journée)' : formatHeure(e.debut_a)} : ${e.titre} (${qui})${e.lieu ? ` à ${e.lieu}` : ''}`,
      )
    }
  } else {
    lignes.push('Agenda : rien de posé sur la période.')
  }

  if (taches.data && taches.data.length > 0) {
    lignes.push('Tâches ouvertes :')
    for (const t of taches.data.slice(0, 20)) {
      const assignee = membres.find((m) => m.id === t.assignee_id)?.prenom ?? 'personne'
      lignes.push(`- ${t.titre} (${assignee}${t.echeance ? `, échéance ${t.echeance}` : ''}, ~${t.effort_minutes} min)`)
    }
  }

  if (courses.data && courses.data.length > 0) {
    lignes.push(`Courses à acheter : ${courses.data.map((a) => a.libelle).join(', ')}.`)
  }

  if (repas.data && repas.data.length > 0) {
    lignes.push('Menus posés : ' + repas.data.map((r) => `${r.date} ${r.creneau}${r.notes ? ` (${r.notes})` : ''}`).join(', ') + '.')
  }

  return lignes.join('\n')
}
