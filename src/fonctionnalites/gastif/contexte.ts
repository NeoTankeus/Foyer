// Le contexte de Gastif : TOUT l'état réel du foyer, assemblé à chaque question.
// Deux exclusions absolues, même pour les adultes : les idées cadeaux et les
// célébrations « magie » — un enfant peut lire par-dessus l'épaule.
import { supabase } from '@/lib/supabase'
import { bornesJourneeLocale, maintenantLocal, addDays, dateIsoJour, formatHeure } from '@/lib/dates'
import type { LigneFoyer, LigneMembre } from '@/lib/basedonnees.types'

function jourCourt(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export async function assemblerContexte(
  membres: LigneMembre[],
  foyer: LigneFoyer | null,
): Promise<string> {
  const maintenant = maintenantLocal()
  const lignes: string[] = []

  // La mémoire longue : ce que la famille a appris à Gastif, relu à chaque question.
  const memoire = typeof foyer?.reglages['memoire'] === 'string' ? (foyer.reglages['memoire'] as string) : ''
  if (memoire.trim()) {
    lignes.push(`Mémoire du foyer (habitudes et préférences durables) :\n${memoire.trim()}`)
  }

  lignes.push(
    `Date et heure : ${maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${maintenant.getHours()}h${String(maintenant.getMinutes()).padStart(2, '0')} (Europe/Paris).`,
  )
  lignes.push(
    `Membres : ${membres
      .filter((m) => m.role !== 'guest')
      .map((m) => `${m.prenom} (${m.role === 'child' ? `enfant, ${m.points} points` : 'adulte'})`)
      .join(', ')}.`,
  )

  const debut = bornesJourneeLocale(addDays(maintenant, -3)).debut
  const fin = bornesJourneeLocale(addDays(maintenant, 14)).fin
  const ilYA30j = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const [
    evenements, taches, tachesFaites, courses, repas, recettes,
    voyages, reservations, valises, documents, colis, celebrations,
    souvenirs, mur, routines, recompenses, concerts,
  ] = await Promise.all([
    supabase.from('evenements').select('*').gt('fin_a', debut).lt('debut_a', fin).order('debut_a'),
    supabase.from('taches').select('*').eq('statut', 'a_faire').order('echeance'),
    supabase.from('taches').select('*').eq('statut', 'faite').gte('faite_le', ilYA30j),
    supabase.from('articles').select('*').eq('coche', false),
    supabase.from('repas').select('*').gte('date', dateIsoJour(maintenant)).lte('date', dateIsoJour(addDays(maintenant, 7))),
    supabase.from('recettes').select('*'),
    supabase.from('voyages').select('*').order('debut'),
    supabase.from('reservations').select('*'),
    supabase.from('valise').select('*'),
    supabase.from('documents').select('*'),
    supabase.from('colis').select('*').neq('statut', 'archive'),
    supabase.from('celebrations').select('*'),
    supabase.from('souvenirs').select('id, voyage_id, dossier, commentaire, lieu, pris_le, favori' as '*'),
    supabase.from('mur').select('*').order('cree_le', { ascending: false }).limit(15),
    supabase.from('routines').select('*').eq('active', true),
    supabase.from('recompenses').select('*').eq('active', true),
    supabase.from('concerts').select('*'),
  ])

  const prenom = (id: string | null) => membres.find((m) => m.id === id)?.prenom ?? '?'

  // Agenda
  if (evenements.data && evenements.data.length > 0) {
    lignes.push('Agenda (J-3 à J+14) :')
    for (const e of evenements.data.slice(0, 30)) {
      const qui = e.participants.length === 0 ? 'toute la famille' : e.participants.map(prenom).join(' + ')
      lignes.push(`- ${jourCourt(e.debut_a)} ${e.journee_entiere ? '(journée)' : formatHeure(e.debut_a)} : ${e.titre} (${qui})${e.lieu ? ` à ${e.lieu}` : ''}`)
    }
  } else lignes.push('Agenda : rien de posé sur la période.')

  // Tâches
  if (taches.data && taches.data.length > 0) {
    lignes.push('Tâches ouvertes :')
    for (const t of taches.data.slice(0, 20))
      lignes.push(`- ${t.titre} (${prenom(t.assignee_id)}${t.echeance ? `, échéance ${t.echeance}` : ''}, ~${t.effort_minutes} min${t.points > 0 ? `, mission à ${t.points} pts` : ''})`)
  }

  // Équilibre 30 j
  if (tachesFaites.data && tachesFaites.data.length > 0) {
    const minutes = new Map<string, number>()
    for (const t of tachesFaites.data)
      if (t.faite_par) minutes.set(t.faite_par, (minutes.get(t.faite_par) ?? 0) + t.effort_minutes)
    lignes.push(`Équilibre des 30 derniers jours : ${[...minutes.entries()].map(([id, m]) => `${prenom(id)} ${m} min`).join(', ')}.`)
  }

  // Courses & repas & recettes
  if (courses.data && courses.data.length > 0)
    lignes.push(`Courses à acheter (${courses.data.length}) : ${courses.data.map((a) => a.libelle).join(', ')}.`)
  if (repas.data && repas.data.length > 0)
    lignes.push('Menus posés : ' + repas.data.map((r) => `${r.date} ${r.creneau}${r.notes ? ` (${r.notes})` : ''}`).join(', ') + '.')
  if (recettes.data && recettes.data.length > 0)
    lignes.push(`Recettes du foyer : ${recettes.data.map((r) => r.titre).join(', ')}.`)

  // Voyages, réservations, valises
  for (const v of voyages.data ?? []) {
    const resas = (reservations.data ?? []).filter((r) => r.voyage_id === v.id)
    const affaires = (valises.data ?? []).filter((va) => va.voyage_id === v.id)
    const restantes = affaires.filter((a) => !a.coche).length
    lignes.push(
      `Voyage « ${v.titre} » (${v.statut})${v.destination ? ` à ${v.destination}` : ''}${v.debut ? `, du ${v.debut} au ${v.fin ?? '?'}` : ''} — ` +
      `${resas.length} réservation(s)${resas.length ? ` [${resas.map((r) => `${r.type} ${r.fournisseur ?? ''}`).join(', ')}]` : ''}, ` +
      `valises : ${affaires.length - restantes}/${affaires.length} prêtes.`,
    )
  }

  // Souvenirs (métadonnées seulement — jamais les images)
  const listeSouvenirs = souvenirs.data as { dossier: string | null; commentaire: string | null; lieu: string | null; pris_le: string; favori: boolean }[] | null
  if (listeSouvenirs && listeSouvenirs.length > 0) {
    const dossiers = [...new Set(listeSouvenirs.map((s) => s.dossier).filter(Boolean))]
    lignes.push(`Souvenirs : ${listeSouvenirs.length} photo(s)${dossiers.length ? `, dossiers : ${dossiers.join(', ')}` : ''}.`)
    const commentees = listeSouvenirs.filter((s) => s.commentaire).slice(0, 10)
    for (const s of commentees) lignes.push(`- photo du ${jourCourt(s.pris_le)} : « ${s.commentaire} »${s.lieu ? ` (${s.lieu})` : ''}`)
  }

  // Documents (Le Coffre) — visibles des adultes uniquement (RLS fait le tri)
  if (documents.data && documents.data.length > 0) {
    lignes.push('Documents du Coffre :')
    for (const d of documents.data.slice(0, 15))
      lignes.push(`- ${d.titre} (${d.type}${d.expire_le ? `, expire le ${d.expire_le}` : ''})`)
  }

  // Colis — adultes uniquement (RLS)
  if (colis.data && colis.data.length > 0)
    lignes.push(`Colis : ${colis.data.map((c) => `${c.libelle ?? c.numero} (${c.statut})`).join(', ')}.`)

  // Célébrations — jamais les « magie », jamais les idées cadeaux
  const fetes = (celebrations.data ?? []).filter((c) => !c.magie)
  if (fetes.length > 0)
    lignes.push(`Célébrations connues : ${fetes.map((c) => `${c.nom} (${c.date.slice(5)})`).join(', ')}.`)

  // Le Mur
  const notes = (mur.data ?? []).filter((n) => n.contenu)
  if (notes.length > 0)
    lignes.push(`Derniers mots sur le Mur : ${notes.slice(0, 8).map((n) => `« ${n.contenu?.slice(0, 60)} » (${prenom(n.auteur_id)})`).join(' · ')}.`)

  // Concerts & sorties
  const sorties = (concerts.data ?? []) as { titre: string; lieu: string | null; date_evenement: string | null }[]
  if (sorties.length > 0)
    lignes.push(`Concerts et sorties : ${sorties.map((s) => `${s.titre}${s.lieu ? ` à ${s.lieu}` : ''}${s.date_evenement ? ` le ${jourCourt(s.date_evenement)}` : ''}`).join(' · ')}.`)

  // Routines & récompenses
  for (const r of routines.data ?? [])
    lignes.push(`Routine « ${r.nom} » (${prenom(r.membre_id)}, ${r.moment}) : ${r.etapes.map((e) => e.libelle).join(' → ')}.`)
  if (recompenses.data && recompenses.data.length > 0)
    lignes.push(`Catalogue de récompenses : ${recompenses.data.map((r) => `${r.libelle} (${r.cout_points} pts)`).join(', ')}.`)

  return lignes.join('\n')
}
