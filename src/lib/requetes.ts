// Lectures : réseau d'abord, cache Dexie en secours (mode avion).
// Écritures : via muter() (optimiste + file d'attente hors ligne).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { baseLocale } from './dexie'
import { muter } from './sync'
import { bornesJourneeLocale, dateIsoJour, maintenantLocal, addDays } from './dates'
import type {
  LigneArticle,
  LigneCelebration,
  LigneEvenement,
  LigneListe,
  LigneMembre,
  LigneTache,
} from './basedonnees.types'
import { prochaineOccurrence } from './recurrence'
import { notifierCoursesAvecReserve, notifierLesAutres } from './notifications'

async function prenomDe(membreId: string | null): Promise<string> {
  if (!membreId) return 'Quelqu’un'
  const m = await baseLocale.membres.get(membreId)
  return m?.prenom ?? 'Quelqu’un'
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export function utiliserEvenementsPeriode(debutIso: string, finIso: string) {
  return useQuery({
    queryKey: ['evenements', debutIso, finIso],
    queryFn: async (): Promise<LigneEvenement[]> => {
      try {
        const { data, error } = await supabase
          .from('evenements')
          .select('*')
          .lt('debut_a', finIso)
          .gt('fin_a', debutIso)
          .order('debut_a')
        if (error) throw error
        await baseLocale.evenements.bulkPut(data)
        return data
      } catch {
        return baseLocale.evenements
          .where('debut_a')
          .below(finIso)
          .filter((e) => e.fin_a > debutIso)
          .sortBy('debut_a')
      }
    },
  })
}

export function utiliserEvenementsDuJour() {
  const { debut, fin } = bornesJourneeLocale()
  return utiliserEvenementsPeriode(debut, fin)
}

export interface NouvelEvenement {
  titre: string
  debut_a: string
  fin_a: string
  lieu: string | null
  participants: string[]
  journee_entiere: boolean
}

export async function creerEvenement(foyerId: string, membreId: string, brouillon: NouvelEvenement) {
  const id = crypto.randomUUID()
  await muter({
    table: 'evenements',
    type: 'insert',
    cible_id: id,
    charge: {
      id,
      foyer_id: foyerId,
      cree_par: membreId,
      visible_enfant: true,
      source: 'foyer',
      notes: null,
      categorie: null,
      ...brouillon,
    },
  })
  const prenom = await prenomDe(membreId)
  const quand = brouillon.journee_entiere
    ? new Date(brouillon.debut_a).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : new Date(brouillon.debut_a).toLocaleString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
  notifierLesAutres('📅 Nouvel événement', `${prenom} a ajouté « ${brouillon.titre} » — ${quand}.`, '/agenda')
}

export async function supprimerEvenement(id: string) {
  await muter({ table: 'evenements', type: 'delete', cible_id: id, charge: {} })
}

// ---------------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------------

export function utiliserTachesOuvertes() {
  return useQuery({
    queryKey: ['taches', 'ouvertes'],
    queryFn: async (): Promise<LigneTache[]> => {
      try {
        const { data, error } = await supabase
          .from('taches')
          .select('*')
          .eq('statut', 'a_faire')
          .order('echeance', { ascending: true, nullsFirst: false })
        if (error) throw error
        await baseLocale.taches.bulkPut(data)
        return data
      } catch {
        return baseLocale.taches.where('statut').equals('a_faire').sortBy('echeance')
      }
    },
  })
}

export interface NouvelleTache {
  titre: string
  assignee_id: string | null
  echeance: string | null
  rrule: string | null
  effort_minutes: number
  groupe_rotation: string | null
  points?: number
}

export async function creerTache(foyerId: string, membreId: string, brouillon: NouvelleTache) {
  const id = crypto.randomUUID()
  await muter({
    table: 'taches',
    type: 'insert',
    cible_id: id,
    charge: {
      id,
      foyer_id: foyerId,
      cree_par: membreId,
      statut: 'a_faire',
      categorie: null,
      points: 0,
      ...brouillon,
    },
  })
  const [prenom, assignee] = await Promise.all([prenomDe(membreId), prenomDe(brouillon.assignee_id)])
  notifierLesAutres(
    '✅ Nouvelle tâche',
    `${prenom} a ajouté « ${brouillon.titre} »${brouillon.assignee_id ? ` pour ${assignee}` : ''}${
      brouillon.echeance ? ` (échéance ${new Date(`${brouillon.echeance}T12:00:00`).toLocaleDateString('fr-FR')})` : ''
    }.`,
    '/maison',
  )
}

/**
 * Compléter une tâche : on la marque faite, et si elle est récurrente (RRULE)
 * on crée l'occurrence suivante — assignée au membre suivant si la tâche
 * appartient à un groupe de rotation (les poubelles alternent toutes seules).
 */
export async function completerTache(
  tache: LigneTache,
  faitePar: string,
  membres: LigneMembre[],
) {
  const adultes = membres.filter((m) => m.role === 'adult')
  await muter({
    table: 'taches',
    type: 'update',
    cible_id: tache.id,
    charge: { statut: 'faite', faite_par: faitePar, faite_le: new Date().toISOString() },
  })

  // Mission d'enfant : les points tombent à la complétion.
  const assignee = membres.find((m) => m.id === tache.assignee_id)
  if (assignee?.role === 'child' && tache.points > 0) {
    await muter({
      table: 'membres',
      type: 'update',
      cible_id: assignee.id,
      charge: { points: assignee.points + tache.points },
    })
  }

  if (!tache.rrule) return
  const base = tache.echeance ? new Date(`${tache.echeance}T12:00:00`) : maintenantLocal()
  const suivante = await prochaineOccurrence(tache.rrule, base)
  if (!suivante) return

  let prochainAssignee = tache.assignee_id
  if (tache.groupe_rotation && adultes.length > 1) {
    const ordre = [...adultes].sort((a, b) => a.prenom.localeCompare(b.prenom))
    const indexActuel = ordre.findIndex((m) => m.id === tache.assignee_id)
    prochainAssignee = ordre[(indexActuel + 1) % ordre.length]?.id ?? tache.assignee_id
  }

  const id = crypto.randomUUID()
  await muter({
    table: 'taches',
    type: 'insert',
    cible_id: id,
    charge: {
      id,
      foyer_id: tache.foyer_id,
      titre: tache.titre,
      assignee_id: prochainAssignee,
      echeance: dateIsoJour(suivante),
      rrule: tache.rrule,
      statut: 'a_faire',
      categorie: tache.categorie,
      effort_minutes: tache.effort_minutes,
      points: tache.points,
      groupe_rotation: tache.groupe_rotation,
      cree_par: tache.cree_par,
    },
  })
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export function utiliserListeCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: async (): Promise<{ liste: LigneListe | null; articles: LigneArticle[] }> => {
      try {
        const { data: listes, error } = await supabase
          .from('listes')
          .select('*')
          .eq('type', 'courses')
          .limit(1)
        if (error) throw error
        const liste = listes[0] ?? null
        if (!liste) return { liste: null, articles: [] }
        const { data: articles, error: erreurArticles } = await supabase
          .from('articles')
          .select('*')
          .eq('liste_id', liste.id)
          .order('position')
        if (erreurArticles) throw erreurArticles
        await baseLocale.listes.bulkPut(listes)
        await baseLocale.articles.bulkPut(articles)
        return { liste, articles }
      } catch {
        const listes = await baseLocale.listes.toArray()
        const liste = listes.find((l) => l.type === 'courses') ?? null
        const articles = liste
          ? await baseLocale.articles.where('liste_id').equals(liste.id).sortBy('position')
          : []
        return { liste, articles }
      }
    },
  })
}

export async function ajouterArticle(
  listeId: string,
  membreId: string,
  libelle: string,
  rayon: string,
) {
  const id = crypto.randomUUID()
  await muter({
    table: 'articles',
    type: 'insert',
    cible_id: id,
    charge: {
      id,
      liste_id: listeId,
      libelle,
      rayon,
      coche: false,
      position: Date.now() % 1000000,
      ajoute_par: membreId,
      quantite: null,
      unite: null,
    },
  })
  notifierCoursesAvecReserve(await prenomDe(membreId))
}

export async function basculerArticle(article: LigneArticle, membreId: string) {
  await muter({
    table: 'articles',
    type: 'update',
    cible_id: article.id,
    charge: { coche: !article.coche, coche_par: article.coche ? null : membreId },
  })
}

export async function supprimerArticlesCoches(articles: LigneArticle[]) {
  for (const article of articles.filter((a) => a.coche)) {
    await muter({ table: 'articles', type: 'delete', cible_id: article.id, charge: {} })
  }
}

/** Historique des libellés du foyer, pour l'autocomplétion (< 3 s). */
export async function historiqueLibelles(): Promise<string[]> {
  const articles = await baseLocale.articles.toArray()
  const vus = new Set<string>()
  for (const article of articles) vus.add(article.libelle.trim())
  return [...vus].sort((a, b) => a.localeCompare(b))
}

// ---------------------------------------------------------------------------
// Célébrations (pour les cartes du jour : anniversaire à J-7)
// ---------------------------------------------------------------------------

export function utiliserCelebrationsProches(jours = 7) {
  return useQuery({
    queryKey: ['celebrations', jours],
    queryFn: async (): Promise<LigneCelebration[]> => {
      let toutes: LigneCelebration[]
      try {
        const { data, error } = await supabase.from('celebrations').select('*')
        if (error) throw error
        await baseLocale.celebrations.bulkPut(data)
        toutes = data
      } catch {
        toutes = await baseLocale.celebrations.toArray()
      }
      const aujourdHui = maintenantLocal()
      const limite = addDays(aujourdHui, jours)
      return toutes.filter((c) => {
        const date = new Date(c.date)
        const anniversaire = new Date(aujourdHui.getFullYear(), date.getMonth(), date.getDate())
        if (anniversaire < new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate())) {
          anniversaire.setFullYear(anniversaire.getFullYear() + 1)
        }
        return anniversaire <= limite
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Realtime : plusieurs personnes cochent en même temps (mode magasin)
// ---------------------------------------------------------------------------

export function utiliserRealtimeCourses() {
  const clientRequetes = useQueryClient()
  return {
    demarrer: () => {
      const canal = supabase
        .channel('courses-temps-reel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'articles' },
          () => void clientRequetes.invalidateQueries({ queryKey: ['courses'] }),
        )
        .subscribe()
      return () => {
        void supabase.removeChannel(canal)
      }
    },
  }
}
