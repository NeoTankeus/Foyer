// L'accueil : un tableau de bord. Le rouge n'apparaît que quand ça urge,
// chaque bloc se coche, se tape, se personnalise. Le Fil est un bloc optionnel.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import {
  basculerArticle,
  completerTache,
  utiliserCelebrationsProches,
  utiliserEvenementsDuJour,
  utiliserEvenementsPeriode,
  utiliserListeCourses,
  utiliserTachesOuvertes,
} from '@/lib/requetes'
import {
  addDays,
  bornesJourneeLocale,
  dateIsoJour,
  differenceInCalendarDays,
  formatHeure,
  formatJourLong,
  maintenantLocal,
} from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'
import { Reorder, useDragControls } from 'framer-motion'
import type { LigneIdeeCadeau, LigneNotification, LigneTache } from '@/lib/basedonnees.types'
import { ChronologieJour } from './ChronologieJour'
import { BriefGastif } from './BriefGastif'
import { Coche } from '@/design/composants/Coche'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonMiseAJour } from '@/design/composants/BoutonMiseAJour'
import { importerAgendaSiBesoin } from '@/lib/synchro-agenda'
import { choisirVille, iconeMeteo, meteoDuJourPasse, previsions, previsionsHoraires, previsionsMarines, villeMeteo, type HeureMeteo, type JourMeteo, type MerHeure } from '@/lib/meteo'

// L'échelle de vent façon Windfinder : couleur par force (en nœuds).
const couleurVent = (noeuds: number) =>
  noeuds < 4 ? '#dfe8ee' : noeuds < 8 ? '#a9d9f2' : noeuds < 11 ? '#93d693' : noeuds < 14 ? '#cbe371'
    : noeuds < 17 ? '#f5d455' : noeuds < 21 ? '#f7a73e' : noeuds < 25 ? '#f2722d' : noeuds < 30 ? '#e6402f' : '#b3268f'
const enNoeuds = (kmh: number) => Math.round(kmh / 1.852)
// L'échelle des vagues (m) et le libellé UV.
const couleurVagues = (m: number) =>
  m < 0.3 ? '#dfe8ee' : m < 0.6 ? '#a9d9f2' : m < 1 ? '#93d693' : m < 1.5 ? '#f5d455' : m < 2.5 ? '#f7a73e' : '#e6402f'
const libelleUv = (uv: number) => (uv >= 11 ? 'extrême' : uv >= 8 ? 'très fort' : uv >= 6 ? 'fort' : uv >= 3 ? 'modéré' : 'faible')
import { prochainesVacances, type Vacances } from '@/lib/scolaire'
import { prochainFerie } from '@/lib/feries'
import { Gerard } from './Gerard'
import { majBadgeIcone } from '@/lib/badge'

type CleBloc =
  | 'urgent' | 'brief' | 'pilote' | 'meteo' | 'prix' | 'agenda' | 'taches'
  | 'penser' | 'courses' | 'menus' | 'mur' | 'vacances' | 'fil' | 'ilyaunan' | 'gerard' | 'garde'

const BLOCS: { cle: CleBloc; libelle: string }[] = [
  { cle: 'urgent', libelle: '🔴 Relances urgentes' },
  { cle: 'brief', libelle: 'ILY Le brief de STG' },
  { cle: 'pilote', libelle: '🤖 Le Pilote (suggestions)' },
  { cle: 'meteo', libelle: '🌤 Météo' },
  { cle: 'vacances', libelle: '🎒 Vacances scolaires (zone B)' },
  { cle: 'prix', libelle: '💸 Baisses de prix (cadeaux)' },
  { cle: 'garde', libelle: '🎒 La Garde de Gabriel' },
  { cle: 'agenda', libelle: '📅 La journée' },
  { cle: 'taches', libelle: '✅ À faire' },
  { cle: 'penser', libelle: '💡 À penser' },
  { cle: 'courses', libelle: '🛒 Courses' },
  { cle: 'menus', libelle: '🍽️ Ce soir on mange' },
  { cle: 'ilyaunan', libelle: '🕰 Il y a un an jour pour jour' },
  { cle: 'gerard', libelle: '🐸 Gérard (l’humeur de la maison)' },
  { cle: 'mur', libelle: '🧲 Le Mur (mots de la famille)' },
  { cle: 'fil', libelle: '🕐 Chronologie du jour' },
]

const DEFAUT: Record<CleBloc, boolean> = {
  urgent: true, brief: true, pilote: true, meteo: true, vacances: true,
  prix: true, agenda: true, taches: true,
  penser: true, courses: true, menus: true, mur: true, fil: false, ilyaunan: true, gerard: true, garde: true,
}

const ORDRE_DEFAUT: CleBloc[] = BLOCS.map((b) => b.cle)

/** Une date lisible en français, ou un repli — jamais « Invalid Date » à l'écran. */
function dateLisible(
  valeur: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  repli = 'date inconnue',
): string {
  if (!valeur) return repli
  const d = new Date(valeur)
  return Number.isNaN(d.getTime()) ? repli : d.toLocaleDateString('fr-FR', options)
}

/**
 * Le prochain passage d'une date anniversaire (jour/mois), ou null si la date
 * stockée est illisible — sans quoi l'accueil affichait « J-NaN ».
 */
function prochainAnniversaire(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const maintenant = maintenantLocal()
  const prochaine = new Date(maintenant.getFullYear(), date.getMonth(), date.getDate())
  if (prochaine < new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())) {
    prochaine.setFullYear(prochaine.getFullYear() + 1)
  }
  return prochaine
}

function chargerBlocs(): Record<CleBloc, boolean> {
  try {
    const brut = localStorage.getItem('foyer-blocs')
    if (!brut) return DEFAUT
    const stocke = JSON.parse(brut) as unknown
    if (!stocke || typeof stocke !== 'object' || Array.isArray(stocke)) return DEFAUT
    // On ne reprend du stockage que des booléens sur des clés connues : une
    // valeur corrompue ne doit pas décider de l'affichage d'un bloc.
    const retenus: Partial<Record<CleBloc, boolean>> = {}
    for (const cle of ORDRE_DEFAUT) {
      const valeur = (stocke as Record<string, unknown>)[cle]
      if (typeof valeur === 'boolean') retenus[cle] = valeur
    }
    return { ...DEFAUT, ...retenus }
  } catch {
    return DEFAUT
  }
}

function chargerOrdre(): CleBloc[] {
  try {
    const brut = JSON.parse(localStorage.getItem('foyer-blocs-ordre') ?? '[]') as unknown
    if (!Array.isArray(brut)) return ORDRE_DEFAUT
    const connus = (brut as CleBloc[]).filter((c) => ORDRE_DEFAUT.includes(c))
    // les blocs apparus depuis viennent se ranger à la fin, jamais perdus
    return [...connus, ...ORDRE_DEFAUT.filter((c) => !connus.includes(c))]
  } catch {
    return ORDRE_DEFAUT
  }
}

export function EcranAujourdhui() {
  const { membre, membres, foyer } = utiliserSession()

  // 🎒 La garde de Gabriel aujourd'hui : qui dépose, qui récupère (adultes).
  const gardeJour = useQuery({
    queryKey: ['garde'],
    enabled: !!foyer && membre?.role === 'adult',
    staleTime: 15 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('foyers').select('reglages').eq('id', foyer?.id ?? '').single()
      const reglages = (data?.reglages as Record<string, unknown> | null) ?? {}
      return {
        plan: (reglages['garde'] ?? {}) as Record<
          string,
          { matin?: { qui: string | null; lieu: string; heure: string }; soir?: { qui: string | null; lieu: string; heure: string } }
        >,
        gardiens: Array.isArray(reglages['garde_gardiens']) ? (reglages['garde_gardiens'] as string[]) : [],
      }
    },
  })
  const clientRequetes = useQueryClient()
  const naviguer = useNavigate()
  const evenements = utiliserEvenementsDuJour()
  const taches = utiliserTachesOuvertes()
  const celebrations = utiliserCelebrationsProches(365)
  const courses = utiliserListeCourses()
  const aujourdHui = dateIsoJour(maintenantLocal())
  // Le prochain événement à venir (14 jours), pour qu'une entrée future se voie
  // tout de suite. ⚠️ Ces deux bornes servent de queryKey : calculées sur
  // l'instant courant, elles changeaient à CHAQUE rendu — nouvelle clé, nouvelle
  // entrée de cache, requête relancée en boucle. On les cale sur des bornes de
  // journée, stables tant qu'on est le même jour.
  const { debutAVenir, finAVenir } = useMemo(
    () => ({
      debutAVenir: bornesJourneeLocale().fin,
      finAVenir: bornesJourneeLocale(addDays(maintenantLocal(), 14)).fin,
    }),
    [aujourdHui],
  )
  const evenementsAVenir = utiliserEvenementsPeriode(debutAVenir, finAVenir)
  const [blocs, setBlocs] = useState(chargerBlocs)
  const [ordre, setOrdre] = useState<CleBloc[]>(chargerOrdre)
  const [personnaliser, setPersonnaliser] = useState(false)
  const [meteoDetail, setMeteoDetail] = useState(false)
  const [vacancesDetail, setVacancesDetail] = useState(false)

  const enregistrerOrdre = (suivant: CleBloc[]) => {
    setOrdre(suivant)
    // Navigation privée / quota plein : le stockage jette. L'ordre reste
    // appliqué à l'écran, il ne survivra simplement pas au redémarrage.
    try {
      localStorage.setItem('foyer-blocs-ordre', JSON.stringify(suivant))
    } catch {
      // réglage non mémorisé : sans gravité
    }
  }
  // Un bloc absent de l'ordre mémorisé partirait en `order: -1`, donc tout en
  // haut : on le renvoie à sa place par défaut.
  const position = (cle: CleBloc) => {
    const index = ordre.indexOf(cle)
    return index === -1 ? ORDRE_DEFAUT.indexOf(cle) : index
  }

  const estAdulte = membre?.role === 'adult'

  // Les calendriers Apple se resynchronisent tout seuls à l'ouverture
  // (au plus toutes les 4 h — la tournée de 7h complète le dispositif).
  useEffect(() => {
    importerAgendaSiBesoin(clientRequetes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🎉 Le prochain jour férié (calendrier officiel) — pour le bloc vacances.
  const ferie = useQuery({ queryKey: ['ferie'], staleTime: 24 * 3600 * 1000, queryFn: prochainFerie })

  // 🕰 La capsule météo souvenir : quel temps il faisait il y a un an.
  const dateUnAnAvant = (() => {
    const [a = '', m = '', j = ''] = aujourdHui.split('-')
    // Le 29 février n'existe pas l'année précédente : on retombe sur le 28,
    // sinon la requête partait sur une date impossible et ne rendait rien.
    const jour = m === '02' && j === '29' ? '28' : j
    return `${Number(a) - 1}-${m}-${jour}`
  })()
  const meteoUnAn = useQuery({
    queryKey: ['meteo-archive', dateUnAnAvant],
    staleTime: 24 * 3600 * 1000,
    enabled: villeMeteo() !== null,
    queryFn: () => meteoDuJourPasse(dateUnAnAvant),
  })

  // 🕰 Les photos du même jour, l'année dernière.
  const souvenirsUnAn = useQuery({
    queryKey: ['ilyaunan', dateUnAnAvant],
    staleTime: 3600 * 1000,
    queryFn: async () => {
      // Même date que la capsule météo (29 février compris).
      const jourPasse = dateUnAnAvant
      const { data } = await supabase
        .from('souvenirs')
        .select('id,titre,image_donnees')
        .gte('pris_le', `${jourPasse}T00:00:00`)
        .lte('pris_le', `${jourPasse}T23:59:59`)
        .limit(6)
      return (data ?? []) as { id: string; titre: string | null; image_donnees: string }[]
    },
  })

  const documents = useQuery({
    queryKey: ['documents', 'expirants'],
    queryFn: async () => {
      const limite = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('documents').select('*')
        .not('expire_le', 'is', null).lte('expire_le', limite).order('expire_le')
      if (error) return []
      return data
    },
    enabled: estAdulte,
  })

  // 💸 Les cadeaux suivis dont le prix est sous leur plus haut relevé.
  const baissesPrix = useQuery({
    queryKey: ['idees', 'baisses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('idees_cadeaux').select('*').eq('offert', false).not('url', 'is', null)
      if (error) return []
      const bonsPlans: { idee: LigneIdeeCadeau; plusHaut: number }[] = []
      for (const i of data ?? []) {
        // `historique_prix` est une colonne JSON : ni tableau ni nombres garantis.
        const valeurs = (Array.isArray(i.historique_prix) ? i.historique_prix : [])
          .map((h) => Number(h?.prix))
          .filter((p) => Number.isFinite(p) && p > 0)
        if (valeurs.length === 0 || i.prix === null || !Number.isFinite(i.prix)) continue
        const plusHaut = Math.max(...valeurs)
        if (plusHaut - i.prix > 0.01) bonsPlans.push({ idee: i, plusHaut })
      }
      return bonsPlans.sort(
        (a, b) => (b.plusHaut - (b.idee.prix ?? 0)) - (a.plusHaut - (a.idee.prix ?? 0)),
      )
    },
    enabled: estAdulte,
  })

  const colis = useQuery({
    queryKey: ['colis', 'en-cours'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('colis').select('*').in('statut', ['attendu', 'en_transit'])
      if (error) return []
      return data
    },
    enabled: estAdulte,
  })

  const repasDuJour = useQuery({
    queryKey: ['repas', 'du-jour'],
    queryFn: async (): Promise<{ creneau: string; texte: string }[]> => {
      const { data, error } = await supabase.from('repas').select('*').eq('date', aujourdHui)
      if (error || data.length === 0) return []
      const resultats: { creneau: string; texte: string }[] = []
      for (const ligne of data) {
        let texte = ligne.notes ?? ''
        if (!texte && ligne.recette_id) {
          const { data: recettes } = await supabase.from('recettes').select('*').eq('id', ligne.recette_id)
          texte = recettes?.[0]?.titre ?? 'Recette prévue'
        }
        if (texte) resultats.push({ creneau: ligne.creneau, texte })
      }
      // Un créneau inconnu renvoyait -1 et passait AVANT le petit-déjeuner :
      // on l'envoie en fin de liste.
      const ordre = ['matin', 'midi', 'gouter', 'soir']
      const rang = (creneau: string) => {
        const i = ordre.indexOf(creneau)
        return i === -1 ? ordre.length : i
      }
      return resultats.sort((a, b) => rang(a.creneau) - rang(b.creneau))
    },
  })

  // 🧲 Le Mur : dernier mot + compteur de non-lus (mots des autres, depuis ma dernière visite).
  const mur = useQuery({
    queryKey: ['mur', 'accueil'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mur').select('*').order('cree_le', { ascending: false }).limit(5)
      if (error) return []
      return data
    },
  })
  const murVuLe = (() => {
    try { return localStorage.getItem('foyer-mur-vu') ?? '' } catch { return '' }
  })()
  const murNonVus = (mur.data ?? []).filter((m) => m.cree_le > murVuLe && m.auteur_id !== membre?.id).length
  const dernierMot = mur.data?.[0]

  // 🔔 La boîte à notifications : les non-lues qui me sont destinées.
  const [clocheOuverte, setClocheOuverte] = useState(false)
  const boite = useQuery({
    queryKey: ['notifications', membre?.id ?? ''],
    queryFn: async (): Promise<LigneNotification[]> => {
      if (!membre) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .contains('cibles', [membre.id])
        .order('cree_le', { ascending: false })
        .limit(30)
      if (error) return []
      return data
    },
    enabled: membre !== null,
  })
  // `lu_par` peut arriver nul de la base : `.includes()` faisait tomber l'accueil.
  const lecteursDe = (n: LigneNotification) => (Array.isArray(n.lu_par) ? n.lu_par : [])
  const nonLues = (boite.data ?? []).filter((n) => !lecteursDe(n).includes(membre?.id ?? ''))

  const ouvrirNotification = async (n: LigneNotification) => {
    if (!membre) return
    setClocheOuverte(false)
    // Marquée lue → elle disparaît de la cloche.
    void supabase
      .from('notifications')
      .update({ lu_par: [...lecteursDe(n), membre.id] })
      .eq('id', n.id)
      .then(() => clientRequetes.invalidateQueries({ queryKey: ['notifications'] }))
    naviguer(n.url || '/')
  }

  const toutMarquerLu = async () => {
    if (!membre) return
    // Une notification qui résiste ne doit pas bloquer les suivantes, et la
    // liste doit être rafraîchie dans tous les cas.
    for (const n of nonLues) {
      try {
        await supabase.from('notifications').update({ lu_par: [...lecteursDe(n), membre.id] }).eq('id', n.id)
      } catch {
        // on continue : la cloche sera simplement encore là au prochain passage
      }
    }
    await clientRequetes.invalidateQueries({ queryKey: ['notifications'] })
  }

  const celebrationsTriees = useMemo(
    () =>
      (celebrations.data ?? [])
        .flatMap((c) => {
          const prochaine = prochainAnniversaire(c.date)
          // Une date illisible est écartée plutôt qu'affichée en « J-NaN ».
          return prochaine ? [{ c, dans: differenceInCalendarDays(prochaine, maintenantLocal()) }] : []
        })
        .sort((a, b) => a.dans - b.dans),
    [celebrations.data],
  )

  // 🌤 Météo (ville mémorisée sur ce téléphone) + 🎒 vacances zone B.
  const [ville, setVille] = useState(villeMeteo())

  // 🧺 Séchage du linge : radiation solaire, chargée quand on ouvre le détail météo.
  const sechage = useQuery({
    queryKey: ['sechage', ville?.nom ?? ''],
    enabled: meteoDetail && ville !== null,
    staleTime: 2 * 3600 * 1000,
    queryFn: async (): Promise<Record<string, number>> => {
      // Réseau coupé : on rend une carte vide plutôt que de laisser la requête
      // en erreur (le verdict séchage restait bloqué sur « … »).
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${ville?.latitude}&longitude=${ville?.longitude}` +
            `&daily=shortwave_radiation_sum&timezone=Europe%2FParis&forecast_days=4`,
        )
        if (!r.ok) return {}
        const d = (await r.json()) as { daily?: { time?: string[]; shortwave_radiation_sum?: number[] } }
        const carte: Record<string, number> = {}
        const jours = Array.isArray(d.daily?.time) ? d.daily.time : []
        for (const [i, date] of jours.entries()) carte[date] = d.daily?.shortwave_radiation_sum?.[i] ?? 0
        return carte
      } catch {
        return {}
      }
    },
  })
  const [saisieVille, setSaisieVille] = useState('')
  // null = rien à dire, 'en-cours' = recherche, sinon le message d'échec.
  const [rechercheVille, setRechercheVille] = useState<string | null>(null)
  // ⛵ Le tableau heure par heure (vent compris), façon Windfinder.
  const [jourDeplie, setJourDeplie] = useState<string | null>(null)
  const heures = useQuery<HeureMeteo[]>({
    queryKey: ['meteo-heures', ville?.nom ?? ''],
    queryFn: previsionsHoraires,
    enabled: meteoDetail && ville !== null,
    staleTime: 30 * 60 * 1000,
  })
  // 🌊 La mer (vagues, houle, eau) — vide loin des côtes.
  const mer = useQuery<MerHeure[]>({
    queryKey: ['meteo-mer', ville?.nom ?? ''],
    queryFn: previsionsMarines,
    enabled: meteoDetail && ville !== null,
    staleTime: 30 * 60 * 1000,
  })
  const meteo = useQuery<JourMeteo[]>({
    queryKey: ['meteo', ville?.nom ?? ''],
    queryFn: previsions,
    enabled: ville !== null,
    staleTime: 30 * 60 * 1000,
  })
  const vacances = useQuery<Vacances[]>({
    queryKey: ['vacances-zone-b'],
    queryFn: prochainesVacances,
    staleTime: 12 * 3600 * 1000,
  })

  // 🧊 Inventaire : les DLC qui pressent (pour le Pilote).
  const inventaire = useQuery({
    queryKey: ['inventaire', 'dlc'],
    queryFn: async () => {
      const limite = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('inventaire').select('*').not('dlc', 'is', null).lte('dlc', limite).order('dlc')
      if (error) return []
      return data
    },
  })

  // 🎁 Les célébrations proches sans aucune idée (pour le Pilote, adultes).
  const ideesParCelebration = useQuery({
    queryKey: ['idees', 'compte'],
    queryFn: async () => {
      const { data, error } = await supabase.from('idees_cadeaux').select('celebration_id' as '*')
      if (error) return new Set<string>()
      return new Set((data as { celebration_id: string | null }[]).map((i) => i.celebration_id ?? ''))
    },
    enabled: estAdulte,
  })

  // 🤖 Le Pilote : des suggestions calculées sur les données réelles du foyer.
  const suggestions = useMemo(() => {
    const liste: { id: string; texte: string; vers: string }[] = []
    for (const l of inventaire.data ?? []) {
      const perime = (l.dlc ?? '') < aujourdHui
      liste.push({
        id: `dlc-${l.id}`,
        texte: perime
          ? `⚠️ ${l.libelle} est périmé — à sortir du stock.`
          : `🧊 DLC proche : ${l.libelle} (${dateLisible(l.dlc ? `${l.dlc}T12:00:00` : null, { weekday: 'long' }, 'bientôt')}) — mets-le au menu.`,
        vers: '/nous/inventaire',
      })
    }
    if (estAdulte && ideesParCelebration.data) {
      for (const { c, dans } of celebrationsTriees) {
        if (dans <= 21 && !ideesParCelebration.data.has(c.id)) {
          liste.push({
            id: `cadeau-${c.id}`,
            texte: `🎁 ${c.nom} dans ${dans} j et le coffre à idées est vide — on s’y met ?`,
            vers: '/nous/celebrations',
          })
        }
      }
    }
    const demain = (meteo.data ?? [])[1]
    if (demain && demain.probaPluie >= 60) {
      const dehors = (evenementsAVenir.data ?? []).find(
        (e) => e.debut_a.slice(0, 10) === demain.date && /parc|piscine|vélo|velo|rando|plage|jardin|foot|match|pique/i.test(e.titre),
      )
      if (dehors) {
        liste.push({
          id: 'pluie-demain',
          texte: `🌧 Pluie probable demain (${demain.probaPluie} %) pour « ${dehors.titre} » — prévois un plan B.`,
          vers: '/agenda',
        })
      }
    }
    if (maintenantLocal().getDay() === 0) {
      liste.push({ id: 'debrief', texte: '📊 C’est dimanche : le Débrief de la semaine est prêt.', vers: '/nous/debrief' })
    }
    return liste.slice(0, 4)
  }, [inventaire.data, ideesParCelebration.data, celebrationsTriees, meteo.data, evenementsAVenir.data, aujourdHui, estAdulte])

  const enregistrerBlocs = (suivants: Record<CleBloc, boolean>) => {
    setBlocs(suivants)
    try {
      localStorage.setItem('foyer-blocs', JSON.stringify(suivants))
    } catch {
      // réglage non mémorisé : sans gravité
    }
  }

  const completer = (tache: LigneTache) => {
    if (!membre) return
    // En cas d'échec on rafraîchit quand même : la coche revient à son vrai
    // état au lieu de rester cochée à tort.
    void completerTache(tache, membre.id, membres)
      .catch(() => undefined)
      .then(() => clientRequetes.invalidateQueries({ queryKey: ['taches'] }))
  }

  // Les relances : tout ce qui est en retard ou imminent, en rouge, une seule fois.
  const relances = useMemo(() => {
    const liste: { id: string; texte: string; vers: string }[] = []
    for (const t of taches.data ?? []) {
      if (t.echeance !== null && t.echeance < aujourdHui) {
        liste.push({ id: `t-${t.id}`, texte: `En retard : ${t.titre}`, vers: '/maison?volet=taches' })
      }
    }
    for (const d of documents.data ?? []) {
      if (!d.expire_le) continue
      const expiration = new Date(`${d.expire_le}T12:00:00`)
      if (Number.isNaN(expiration.getTime())) continue // date de coffre illisible
      const dans = differenceInCalendarDays(expiration, maintenantLocal())
      if (dans < 0) liste.push({ id: `d-${d.id}`, texte: `Expiré : ${d.titre}`, vers: '/nous/coffre' })
      else if (dans <= 15) liste.push({ id: `d-${d.id}`, texte: `${d.titre} expire dans ${dans} j`, vers: '/nous/coffre' })
    }
    for (const c of celebrations.data ?? []) {
      const prochaine = prochainAnniversaire(c.date)
      if (!prochaine) continue
      const dans = differenceInCalendarDays(prochaine, maintenantLocal())
      if (dans <= 1) liste.push({ id: `c-${c.id}`, texte: dans === 0 ? `Aujourd’hui : ${c.nom} 🎂` : `Demain : ${c.nom} 🎂`, vers: '/nous/celebrations' })
    }
    return liste
  }, [taches.data, documents.data, celebrations.data, aujourdHui])

  // La pastille rouge sur l'icône de l'app : notifications non lues + relances.
  useEffect(() => {
    majBadgeIcone(nonLues.length + relances.length)
  }, [nonLues.length, relances.length])

  // TOUT ce qui est ouvert apparaît — pas seulement ce qui est daté d'aujourd'hui.
  const tachesOuvertes = taches.data ?? []
  const articlesRestants = (courses.data?.articles ?? []).filter((a) => !a.coche)
  const articlesCoches = (courses.data?.articles ?? []).filter((a) => a.coche)

  // Un événement « toute la journée » était purement et simplement absent de
  // l'accueil : le bloc annonçait « rien au programme » un jour de vacances.
  // On les met en tête, puis les rendez-vous à l'heure.
  const evenementsDuJour = [
    ...(evenements.data ?? []).filter((e) => e.journee_entiere),
    ...(evenements.data ?? [])
      .filter((e) => !e.journee_entiere)
      .sort((a, b) => a.debut_a.localeCompare(b.debut_a)),
  ]

  return (
    <div>
      <header className="verre verre-clair safe-haut sticky top-0 z-10 flex items-center justify-between px-5 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-titre-2 text-encre">
            {(() => {
              const h = maintenantLocal().getHours()
              const salut = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'
              return `${salut} ${membre?.prenom ?? ''} ✨`
            })()}
          </h1>
          <p className="text-note capitalize text-encre-3">{formatJourLong(maintenantLocal())}</p>
        </div>
        <div className="flex gap-1">
          <BoutonMiseAJour />
          <button
            onClick={() => setClocheOuverte(true)}
            aria-label={`Notifications${nonLues.length > 0 ? ` — ${nonLues.length} non lue${nonLues.length > 1 ? 's' : ''}` : ''}`}
            className="relative flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[17px]"
          >
            🔔
            {nonLues.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-fond bg-urgent px-0.5 text-[10px] font-[700] text-white">
                {nonLues.length > 9 ? '9+' : nonLues.length}
              </span>
            )}
          </button>
          <button
            onClick={() => naviguer('/recherche')}
            aria-label="Recherche globale"
            className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[17px]"
          >
            🔍
          </button>
          <button
            onClick={() => setPersonnaliser(true)}
            aria-label="Personnaliser le tableau de bord"
            className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[17px]"
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-3">
        {/* 🔴 Relances — le seul endroit où le rouge existe */}
        {blocs.urgent && relances.length > 0 && (
          <section
            className="rounded-xl p-4 text-white shadow-carte"
            style={{ background: 'linear-gradient(135deg, #e0705e, var(--urgent))', order: position('urgent') }}
          >
            <h2 className="mb-1 text-note font-[700] uppercase tracking-wide opacity-90">
              🔴 Relances — {relances.length}
            </h2>
            {relances.map((r) => (
              <button key={r.id} onClick={() => naviguer(r.vers)} className="flex w-full items-center justify-between py-0.5 text-left text-corps-2 font-[590]">
                <span>• {r.texte}</span>
                <span aria-hidden="true" className="opacity-80">›</span>
              </button>
            ))}
          </section>
        )}

        {blocs.brief && (
          <button
            onClick={() => naviguer('/agenda')}
            className="rounded-xl bg-fond-eleve p-4 text-left shadow-carte active:bg-fond-sourd"
            style={{ order: position('brief') }}
            aria-label="Ouvrir l'agenda du jour"
          >
            <BriefGastif evenements={evenements.data ?? []} taches={taches.data ?? []} />
          </button>
        )}

        {/* 🤖 Le Pilote — Gastif propose, calculé sur les vraies données du foyer */}
        {blocs.pilote && suggestions.length > 0 && (
          <section
            className="rounded-xl p-4 shadow-carte"
            style={{ background: 'color-mix(in srgb, var(--prune) 12%, var(--fond-eleve))', order: position('pilote') }}
          >
            <h2 className="mb-1 flex items-center gap-2 text-note font-[700] uppercase tracking-wide text-encre-3">
              <span className="badge-ily h-5 w-8 text-[9px]">ILY</span> Le Pilote
            </h2>
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => naviguer(s.vers)}
                className="block w-full py-1 text-left text-corps-2 leading-snug text-encre"
              >
                {s.texte}
              </button>
            ))}
          </section>
        )}

        {/* 🌤 Météo — Open-Meteo (modèle Météo-France), ville mémorisée */}
        {blocs.meteo && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('meteo') }}>
            <div className="flex items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">
                🌤 Météo{ville ? ` — ${ville.nom}` : ''}
              </h2>
              {ville && (
                <button onClick={() => setVille(null)} className="text-legende text-encre-3 underline">
                  changer
                </button>
              )}
            </div>
            {!ville ? (
              <form
                className="mt-2 flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const demande = saisieVille.trim()
                  if (!demande) return
                  setRechercheVille('en-cours')
                  // Sans retour, une ville introuvable ou une coupure réseau ne
                  // produisait strictement RIEN à l'écran.
                  void choisirVille(demande)
                    .then((v) => {
                      if (v) {
                        setVille(v)
                        setRechercheVille(null)
                      } else {
                        setRechercheVille(`« ${demande} » introuvable — essaie une autre orthographe.`)
                      }
                    })
                    .catch(() => setRechercheVille('Recherche impossible — vérifie le réseau et réessaie.'))
                }}
              >
                <div className="flex gap-2">
                  <input
                    value={saisieVille}
                    onChange={(e) => setSaisieVille(e.target.value)}
                    placeholder="Ta ville (une fois)"
                    aria-label="Ville pour la météo"
                    className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-sourd px-3 text-corps-2"
                  />
                  <Bouton type="submit" variante="valider" desactive={!saisieVille.trim()}>OK</Bouton>
                </div>
                {rechercheVille === 'en-cours' && <p className="text-legende text-encre-3">Recherche de la ville…</p>}
                {rechercheVille !== null && rechercheVille !== 'en-cours' && (
                  <p className="text-legende text-urgent">{rechercheVille}</p>
                )}
              </form>
            ) : meteo.isLoading ? (
              <p className="mt-2 text-corps-2 text-encre-3">Relevé météo en cours…</p>
            ) : (meteo.data ?? []).length === 0 ? (
              // Open-Meteo renvoie une liste vide en cas de panne : on le dit et
              // on offre le seul geste utile, réessayer.
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-corps-2 text-encre-3">Météo indisponible pour l’instant.</p>
                <Bouton variante="discret" onClick={() => void meteo.refetch()}>Réessayer</Bouton>
              </div>
            ) : (
              <button
                onClick={() => setMeteoDetail(true)}
                aria-label="Voir la météo en détail"
                className="mt-2 flex w-full justify-between active:opacity-70"
              >
                {(meteo.data ?? []).map((j, idx) => (
                  <div key={j.date} className="flex flex-col items-center gap-0.5">
                    <span className="text-legende capitalize text-encre-3">
                      {idx === 0 ? 'auj.' : dateLisible(`${j.date}T12:00:00`, { weekday: 'short' }, '—')}
                    </span>
                    <span className="text-[22px]">{iconeMeteo(j.code)}</span>
                    <span className="chiffres text-note text-encre">
                      {j.tMax}° <span className="text-encre-3">{j.tMin}°</span>
                    </span>
                    {j.probaPluie >= 40 && (
                      <span className="chiffres text-legende text-ardoise">☔ {j.probaPluie} %</span>
                    )}
                  </div>
                ))}
              </button>
            )}
          </section>
        )}

        {/* 🎒 Vacances scolaires zone B — calendrier officiel */}
        {blocs.vacances && (vacances.data?.length ?? 0) > 0 && (
          <section
            className="cursor-pointer rounded-xl bg-fond-eleve p-4 shadow-carte active:bg-fond-sourd"
            style={{ order: position('vacances') }}
            onClick={() => setVacancesDetail(true)}
            role="button"
            tabIndex={0}
            aria-label="Voir toutes les vacances scolaires"
          >
            <h2 className="mb-1 flex items-center justify-between text-note font-[700] uppercase tracking-wide text-encre-3">
              <span>🎒 Vacances scolaires — zone B</span>
              <span aria-hidden="true">›</span>
            </h2>
            {(vacances.data ?? []).slice(0, 2).map((v) => {
              const debut = new Date(v.debut)
              // Le calendrier officiel (ou son cache) peut contenir une date
              // illisible : on n'affiche jamais « J-NaN ».
              if (Number.isNaN(debut.getTime())) return null
              const dans = differenceInCalendarDays(debut, maintenantLocal())
              const enCours = dans <= 0
              const court: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
              return (
                <p key={v.debut} className="py-0.5 text-corps-2 text-encre">
                  {v.description}{' '}
                  <span className="chiffres text-encre-3">
                    {enCours
                      ? `— en cours, jusqu’au ${dateLisible(v.fin, court, 'la rentrée')}`
                      : `— J-${dans} (${dateLisible(v.debut, court)} → ${dateLisible(v.fin, court)})`}
                  </span>
                </p>
              )
            })}
          </section>
        )}

        {/* 💸 Baisses de prix — les cadeaux suivis passés sous leur plus haut */}
        {blocs.prix && estAdulte && (baissesPrix.data?.length ?? 0) > 0 && (
          <section
            className="rounded-xl p-4 text-white shadow-carte"
            style={{ background: 'linear-gradient(135deg, var(--sauge), #4f7d5e)', order: position('prix') }}
          >
            <button onClick={() => naviguer('/nous/celebrations')} className="flex w-full items-center justify-between text-left">
              <h2 className="text-note font-[700] uppercase tracking-wide opacity-90">
                💸 Baisses de prix — {baissesPrix.data?.length}
              </h2>
              <span aria-hidden="true">›</span>
            </button>
            {(baissesPrix.data ?? []).slice(0, 4).map(({ idee, plusHaut }) => (
              <button
                key={idee.id}
                onClick={() => naviguer('/nous/celebrations')}
                className="mt-1 block w-full text-left text-corps-2 font-[590]"
              >
                • {idee.libelle}{' '}
                <span className="chiffres opacity-90">
                  <s>{plusHaut.toFixed(2)} €</s> → {(idee.prix ?? 0).toFixed(2)} €
                  {/* plusHaut > 0 est garanti par le filtre : pas de division par zéro. */}
                  {' '}(−{Math.round(((plusHaut - (idee.prix ?? 0)) / plusHaut) * 100)} %)
                </span>
              </button>
            ))}
            {(baissesPrix.data?.length ?? 0) > 4 && (
              <p className="mt-1 text-legende opacity-90">et {(baissesPrix.data?.length ?? 0) - 4} de plus…</p>
            )}
          </section>
        )}

        {blocs.agenda && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('agenda') }}>
            <button onClick={() => naviguer('/agenda')} className="mb-2 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">📅 La journée</h2>
              <span className="text-encre-3">›</span>
            </button>
            {evenements.isLoading ? (
              <p className="text-corps-2 text-encre-3">Chargement de la journée…</p>
            ) : evenementsDuJour.length === 0 ? (
              <p className="text-corps-2 text-encre-3">Rien au programme aujourd’hui.</p>
            ) : (
              evenementsDuJour.map((e) => {
                // `participants` peut arriver nul de la base.
                const participants = Array.isArray(e.participants) ? e.participants : []
                return (
                  <button
                    key={e.id}
                    onClick={() => naviguer('/agenda')}
                    className="flex w-full items-center gap-3 border-b border-trait py-1.5 text-left last:border-0 active:bg-fond-sourd"
                  >
                    <span className="chiffres w-12 text-note font-[590] text-encre-3">
                      {e.journee_entiere ? 'jour' : formatHeure(e.debut_a)}
                    </span>
                    <span className="flex-1 text-corps text-encre">{e.titre}</span>
                    <span className="flex gap-0.5">
                      {(participants.length === 0
                        ? membres.filter((m) => m.role !== 'guest')
                        : membres.filter((m) => participants.includes(m.id))
                      ).map((m) => (
                        <span key={m.id} className="h-2 w-2 rounded-full" style={{ background: couleurMembre(m.couleur) }} />
                      ))}
                    </span>
                  </button>
                )
              })
            )}
            {(() => {
              const prochain = evenementsAVenir.data?.[0]
              if (!prochain) return null
              return (
                <button
                  onClick={() => naviguer('/agenda')}
                  className="mt-1 block w-full border-t border-trait pt-1.5 text-left text-corps-2 text-encre-3 active:bg-fond-sourd"
                >
                  À venir :{' '}
                  <span className="capitalize">
                    {dateLisible(prochain.debut_a, { weekday: 'short', day: 'numeric', month: 'short' }, 'bientôt')}
                  </span>
                  {prochain.journee_entiere ? '' : ` · ${formatHeure(prochain.debut_a)}`} — {prochain.titre}
                </button>
              )
            })()}
          </section>
        )}

        {blocs.taches && tachesOuvertes.length > 0 && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('taches') }}>
            <button onClick={() => naviguer('/maison')} className="mb-1 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">
                ✅ À faire — {tachesOuvertes.length}
              </h2>
              <span className="text-encre-3">›</span>
            </button>
            {tachesOuvertes.slice(0, 8).map((t) => {
              const assignee = membres.find((m) => m.id === t.assignee_id)
              const echeance =
                t.echeance === null
                  ? 'un jour'
                  : t.echeance < aujourdHui
                    ? 'retard'
                    : t.echeance === aujourdHui
                      ? 'aujourd’hui'
                      : new Date(`${t.echeance}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
              return (
                <div key={t.id} className="flex items-center gap-1 border-b border-trait py-0.5 last:border-0">
                  <Coche
                    cochee={false}
                    onBascule={() => completer(t)}
                    etiquette={`Marquer « ${t.titre} » comme faite`}
                    couleur={assignee ? couleurMembre(assignee.couleur) : undefined}
                  />
                  <button onClick={() => naviguer('/maison?volet=taches')} className="flex-1 text-left text-corps text-encre">
                    {t.titre}
                  </button>
                  <span
                    className={`text-legende ${echeance === 'retard' ? 'font-[700] text-urgent' : 'chiffres text-encre-3'}`}
                  >
                    {echeance}
                  </span>
                </div>
              )
            })}
            {tachesOuvertes.length > 8 && (
              <p className="mt-1 text-legende text-encre-3">et {tachesOuvertes.length - 8} de plus…</p>
            )}
          </section>
        )}

        {blocs.penser && (celebrationsTriees.length > 0 || (documents.data?.length ?? 0) > 0 || (colis.data?.length ?? 0) > 0) && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('penser') }}>
            <h2 className="mb-1 text-note font-[700] uppercase tracking-wide text-encre-3">💡 À penser</h2>
            {celebrationsTriees.slice(0, 4).map(({ c, dans }) => (
              <button key={c.id} onClick={() => naviguer('/nous/celebrations')} className="block w-full py-0.5 text-left text-corps-2 text-encre">
                🎂 {c.nom} <span className="chiffres text-encre-3">{dans === 0 ? '— aujourd’hui !' : `— J-${dans}`}</span>
              </button>
            ))}
            {celebrationsTriees.length > 4 && (
              <button onClick={() => naviguer('/nous/celebrations')} className="block w-full py-0.5 text-left text-legende text-encre-3">
                et {celebrationsTriees.length - 4} autre{celebrationsTriees.length - 4 > 1 ? 's' : ''} anniversaire{celebrationsTriees.length - 4 > 1 ? 's' : ''}…
              </button>
            )}
            {(documents.data ?? []).map((d) => (
              <button key={d.id} onClick={() => naviguer('/nous/coffre')} className="block w-full py-0.5 text-left text-corps-2 text-encre">
                🗄️ {d.titre}{' '}
                <span className="chiffres text-encre-3">
                  — expire le {dateLisible(d.expire_le ? `${d.expire_le}T12:00:00` : null, {}, 'date à compléter')}
                </span>
              </button>
            ))}
            {(colis.data ?? []).map((c) => (
              <button key={c.id} onClick={() => naviguer('/nous/colis')} className="block w-full py-0.5 text-left text-corps-2 text-encre">
                📦 {c.libelle ?? c.numero} <span className="text-encre-3">— {c.statut === 'attendu' ? 'attendu' : 'en route'}</span>
              </button>
            ))}
          </section>
        )}

        {blocs.courses && (articlesRestants.length > 0 || articlesCoches.length > 0) && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('courses') }}>
            <button onClick={() => naviguer('/maison?ajout=courses')} className="mb-1 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">
                🛒 Courses — {articlesRestants.length} à prendre
              </h2>
              <span className="text-encre-3">›</span>
            </button>
            {articlesRestants.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center gap-1">
                <Coche
                  cochee={false}
                  onBascule={() => {
                    if (membre)
                      void basculerArticle(a, membre.id)
                        .catch(() => undefined)
                        .then(() => clientRequetes.invalidateQueries({ queryKey: ['courses'] }))
                  }}
                  etiquette={`Cocher ${a.libelle}`}
                />
                <button onClick={() => naviguer('/maison?volet=courses')} className="flex-1 text-left text-corps-2 text-encre">
                  {a.libelle}
                </button>
              </div>
            ))}
            {articlesRestants.length > 8 && (
              <p className="mt-1 text-legende text-encre-3">et {articlesRestants.length - 8} de plus…</p>
            )}
            {articlesCoches.slice(-3).map((a) => (
              <div key={a.id} className="flex items-center gap-1 opacity-60">
                <Coche
                  cochee
                  onBascule={() => {
                    if (membre)
                      void basculerArticle(a, membre.id)
                        .catch(() => undefined)
                        .then(() => clientRequetes.invalidateQueries({ queryKey: ['courses'] }))
                  }}
                  etiquette={`Décocher ${a.libelle}`}
                />
                <span className="text-corps-2 text-encre-3 line-through">{a.libelle}</span>
              </div>
            ))}
          </section>
        )}

        {blocs.menus && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('menus') }}>
            <button onClick={() => naviguer('/maison')} className="flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">🍽️ Aujourd’hui on mange</h2>
              <span className="text-encre-3">›</span>
            </button>
            {(repasDuJour.data?.length ?? 0) === 0 ? (
              <button onClick={() => naviguer('/maison?volet=menus')} className="mt-1 block w-full text-left text-corps text-encre">
                Rien de prévu — tape ici pour poser le menu.
              </button>
            ) : (
              (repasDuJour.data ?? []).map((r) => (
                <button
                  key={r.creneau}
                  onClick={() => naviguer('/maison?volet=menus')}
                  className="mt-1 block w-full text-left text-corps text-encre active:bg-fond-sourd"
                >
                  <span className="text-note font-[590] uppercase text-encre-3">
                    {{ matin: 'Matin', midi: 'Midi', gouter: 'Goûter', soir: 'Soir' }[r.creneau] ?? r.creneau}
                  </span>{' '}
                  — {r.texte}
                </button>
              ))
            )}
          </section>
        )}

        {/* 🕰 Il y a un an jour pour jour — la madeleine de Proust automatique */}
        {blocs.ilyaunan && (souvenirsUnAn.data ?? []).length > 0 && (
          <section
            className="rounded-xl p-4 shadow-carte"
            style={{ background: 'color-mix(in srgb, var(--or) 12%, var(--fond-eleve))', order: position('ilyaunan') }}
          >
            <button onClick={() => naviguer('/nous/journal')} className="flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">🕰 Il y a un an jour pour jour</h2>
              <span className="text-encre-3">›</span>
            </button>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" onClick={() => naviguer('/nous/journal')} role="button" tabIndex={0} aria-label="Ouvrir le Journal">
              {(souvenirsUnAn.data ?? []).map((s) => (
                <img
                  key={s.id}
                  src={s.image_donnees}
                  alt={s.titre ?? 'Souvenir'}
                  loading="lazy"
                  className="h-28 w-28 shrink-0 rounded-lg object-cover shadow-carte"
                />
              ))}
            </div>
            {(souvenirsUnAn.data ?? [])[0]?.titre && (
              <p className="mt-1 text-legende text-encre-3">{(souvenirsUnAn.data ?? [])[0]?.titre}</p>
            )}
            {meteoUnAn.data && (
              <p className="mt-1 text-legende text-encre-3">
                {iconeMeteo(meteoUnAn.data.code)} Ce jour-là, il faisait {meteoUnAn.data.tMax}°.
              </p>
            )}
          </section>
        )}

        {/* 🎒 La Garde de Gabriel — qui s'en occupe AUJOURD'HUI, en un coup d'œil */}
        {blocs.garde && membre?.role === 'adult' && (() => {
          const jour = gardeJour.data?.plan[aujourdHui]
          const creneaux = [
            { icone: '🌅', libelle: 'Dépôt', c: jour?.matin },
            { icone: '🌆', libelle: 'Récupération', c: jour?.soir },
          ]
          const prenomDe = (id: string | null | undefined) =>
            id?.startsWith('perso:') ? id.slice(6) : membres.find((m) => m.id === id)?.prenom
          return (
            <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('garde') }}>
              <button onClick={() => naviguer('/nous/garde')} className="flex w-full items-center justify-between">
                <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">🎒 La Garde de Gabriel</h2>
                <span className="text-encre-3">›</span>
              </button>
              {jour ? (
                <div className="mt-2 flex flex-col gap-1">
                  {creneaux.map((x) => (
                    <p key={x.libelle} className="text-corps-2 text-encre">
                      {x.icone} {x.libelle} —{' '}
                      {x.c && prenomDe(x.c.qui) ? (
                        <>
                          <strong>{prenomDe(x.c.qui)}</strong>
                          {x.c.lieu ? ` · ${x.c.lieu}` : ''}
                          {x.c.heure ? ` · ${x.c.heure}` : ''}
                        </>
                      ) : (
                        <span className="font-[590] text-ambre">à décider</span>
                      )}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-corps-2 text-encre-3">Rien de noté pour aujourd'hui — touche pour planifier.</p>
              )}
            </section>
          )
        })()}

        {/* 🐸 Gérard — l'humeur de la maison, en direct et sans réseau */}
        {blocs.gerard && (
          <section
            className="rounded-xl p-4 shadow-carte"
            style={{ background: 'color-mix(in srgb, var(--sauge) 12%, var(--fond-eleve))', order: position('gerard') }}
          >
            <Gerard
              retards={tachesOuvertes.filter((t) => t.echeance !== null && t.echeance < aujourdHui).length}
              aFaire={tachesOuvertes.length}
              nonLus={murNonVus}
              courses={articlesRestants.length}
            />
          </section>
        )}

        {/* 🧲 Le Mur — le frigo de la famille, avec pastille rouge des non-lus */}
        {blocs.mur && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('mur') }}>
            <button onClick={() => naviguer('/maison?volet=mur')} className="flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">🧲 Le Mur</h2>
              <span className="flex items-center gap-2 text-encre-3">
                {murNonVus > 0 && (
                  <span
                    aria-label={`${murNonVus} nouveau${murNonVus > 1 ? 'x' : ''} message${murNonVus > 1 ? 's' : ''}`}
                    className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-urgent px-1.5 text-legende font-[700] text-white"
                  >
                    {murNonVus}
                  </span>
                )}
                ›
              </span>
            </button>
            {dernierMot ? (
              <button onClick={() => naviguer('/maison?volet=mur')} className="mt-1 block w-full text-left">
                <p className="text-corps text-encre">« {dernierMot.contenu || '📷 Photo'} »</p>
                <p className="text-legende text-encre-3">
                  {membres.find((m) => m.id === dernierMot.auteur_id)?.prenom ?? 'quelqu’un'} ·{' '}
                  {dateLisible(dernierMot.cree_le, { day: 'numeric', month: 'short' }, 'récemment')}
                </p>
              </button>
            ) : (
              <p className="mt-1 text-corps-2 text-encre-3">Laisse un mot sur le frigo de la famille.</p>
            )}
          </section>
        )}

        {blocs.fil && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte" style={{ order: position('fil') }}>
            <button onClick={() => naviguer('/agenda')} className="mb-2 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">🕐 Chronologie du jour</h2>
              <span className="text-encre-3">›</span>
            </button>
            <ChronologieJour membres={membres} evenements={evenements.data ?? []} />
          </section>
        )}
      </div>

      <Feuille ouverte={clocheOuverte} onFermer={() => setClocheOuverte(false)} titre="🔔 Notifications">
        <div className="flex flex-col gap-2">
          {nonLues.length === 0 ? (
            <p className="py-6 text-center text-corps-2 text-encre-3">Tout est lu — rien ne t’attend. ✨</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {nonLues.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => void ouvrirNotification(n)}
                      className="flex w-full items-start gap-2 rounded-md bg-fond-sourd px-3 py-2.5 text-left"
                    >
                      <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-urgent" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-corps-2 font-[590] text-encre">{n.titre}</span>
                        {n.corps && <span className="block text-corps-2 leading-snug text-encre-2">{n.corps}</span>}
                        <span className="block text-legende text-encre-3">
                          {dateLisible(
                            n.cree_le,
                            { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
                            'à l’instant',
                          )}
                        </span>
                      </span>
                      <span aria-hidden="true" className="mt-1 text-encre-3">›</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Bouton pleineLargeur variante="discret" onClick={() => void toutMarquerLu()}>
                Tout marquer comme lu
              </Bouton>
            </>
          )}
          <p className="text-legende text-encre-3">
            Touche une notification : elle s’ouvre au bon endroit et disparaît d’ici.
          </p>
        </div>
      </Feuille>

      <Feuille ouverte={personnaliser} onFermer={() => setPersonnaliser(false)} titre="Personnaliser l’accueil">
        <div className="flex flex-col gap-1">
          <Reorder.Group
            axis="y"
            values={ordre}
            onReorder={(suivant) => enregistrerOrdre(suivant as CleBloc[])}
            className="flex list-none flex-col gap-1"
          >
            {ordre.map((cle) => {
              const bloc = BLOCS.find((b) => b.cle === cle)
              if (!bloc) return null
              return (
                <LigneBlocOrdre
                  key={cle}
                  valeur={cle}
                  libelle={bloc.libelle}
                  active={blocs[cle]}
                  onBascule={(actif) => enregistrerBlocs({ ...blocs, [cle]: actif })}
                />
              )
            })}
          </Reorder.Group>
          <p className="mt-2 text-legende text-encre-3">
            Glisse ☰ pour changer l’ordre — l’accueil suit immédiatement. La coche affiche ou masque.
            Chaque téléphone garde son propre réglage ; un bloc vide ne s’affiche pas, même activé.
          </p>
          <Bouton pleineLargeur variante="valider" onClick={() => setPersonnaliser(false)}>
            C’est réglé
          </Bouton>
        </div>
      </Feuille>

      {/* 🌤 La météo en détail — chaque jour développé */}
      <Feuille ouverte={meteoDetail} onFermer={() => setMeteoDetail(false)} titre={`🌤 Météo — ${ville?.nom ?? ''}`}>
        <div className="flex flex-col gap-2">
          {(meteo.data ?? []).map((j, idx) => (
            <div key={j.date} className="rounded-xl bg-fond-sourd px-3 py-2.5">
            <button
              onClick={() => setJourDeplie((d) => (d === j.date ? null : j.date))}
              aria-expanded={jourDeplie === j.date}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="text-[30px]" aria-hidden="true">{iconeMeteo(j.code)}</span>
              <div className="flex-1">
                <p className="text-corps-2 font-[590] capitalize text-encre">
                  {idx === 0
                    ? 'Aujourd’hui'
                    : dateLisible(`${j.date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' }, 'jour suivant')}
                </p>
                <p className="text-legende text-encre-3">
                  {j.pluieMm >= 1
                    ? `🌧 ${Math.round(j.pluieMm)} mm de pluie attendus (${j.probaPluie} % de risque)`
                    : j.probaPluie >= 20
                      ? `☔ ${j.probaPluie} % de risque de pluie`
                      : '☀️ pas de pluie prévue'}
                </p>
                {(j.lever || j.uvMax > 0) && (
                  <p className="text-legende text-encre-3">
                    {j.lever && <>🌅 {j.lever} → {j.coucher}</>}
                    {j.uvMax > 0 && <> · UV {j.uvMax} ({libelleUv(j.uvMax)}{j.uvMax >= 6 ? ' — crème pour Gabriel !' : ''})</>}
                  </p>
                )}
                <p className="text-legende text-encre-3">
                  {/* Le verdict séchage regarde la PLUIE (mm, risque, orage) AVANT le soleil. */}
                  🧺 Séchage dehors :{' '}
                  {j.pluieMm >= 1 || j.probaPluie >= 50 || j.code >= 95 || (j.code >= 61 && j.code <= 67) || (j.code >= 80 && j.code <= 82)
                    ? '🚫 pluie prévue — linge dedans'
                    : j.pluieMm > 0 || j.probaPluie >= 25 || (j.code >= 51 && j.code <= 57)
                      ? '⚠️ risque d’averse — surveille le ciel'
                      : sechage.data?.[j.date] === undefined
                        ? sechage.isFetching
                          ? '…'
                          : '— ensoleillement non mesuré'
                        : (sechage.data[j.date] ?? 0) >= 14
                          ? '👍 soleil au rendez-vous'
                          : (sechage.data[j.date] ?? 0) >= 8
                            ? '🤏 ça peut le faire'
                            : '👎 pas assez de soleil'}
                </p>
              </div>
              <p className="chiffres text-corps font-[700] text-encre">
                {j.tMax}° <span className="font-[400] text-encre-3">{j.tMin}°</span>
              </p>
              <span aria-hidden="true" className="text-encre-3">{jourDeplie === j.date ? '▴' : '▾'}</span>
            </button>

            {/* ⛵ L'heure par heure façon Windfinder : vent en nœuds, rafales,
                direction — les cases se colorent avec la force du vent. */}
            {jourDeplie === j.date && (
              <div className="mt-2">
                {heures.isLoading && <p className="py-2 text-center text-legende text-encre-3">⛵ Relevé du vent…</p>}
                {/* Un jour déplié sans donnée restait totalement muet. */}
                {!heures.isLoading &&
                  (heures.data ?? []).filter((h) => h.quand.startsWith(j.date)).length === 0 && (
                    <p className="py-2 text-center text-legende text-encre-3">
                      Détail heure par heure indisponible pour ce jour.
                    </p>
                  )}
                {(heures.data ?? []).filter((h) => h.quand.startsWith(j.date) && [6, 8, 10, 12, 14, 16, 18, 20, 22].includes(Number(h.quand.slice(11, 13)))).length > 0 && (
                  <div className="overflow-hidden rounded-lg">
                    <div className="grid grid-cols-6 gap-px bg-trait text-center text-legende">
                      {['h', '', '°C', 'vent (nds)', 'rafales', 'pluie'].map((t, i) => (
                        <span key={i} className="bg-fond-eleve py-1 font-[590] text-encre-3">{t}</span>
                      ))}
                      {(heures.data ?? [])
                        .filter((h) => h.quand.startsWith(j.date) && [6, 8, 10, 12, 14, 16, 18, 20, 22].includes(Number(h.quand.slice(11, 13))))
                        .map((h) => (
                          <Fragment key={h.quand}>
                            <span className="chiffres bg-fond-eleve py-1.5 text-encre">{Number(h.quand.slice(11, 13))}h</span>
                            <span className="bg-fond-eleve py-1.5">{iconeMeteo(h.code)}</span>
                            <span className="chiffres bg-fond-eleve py-1.5 text-encre">{h.t}°</span>
                            <span
                              className="chiffres flex items-center justify-center gap-1 py-1.5 font-[700] text-[#1c2430]"
                              style={{ background: couleurVent(enNoeuds(h.vent)) }}
                            >
                              {enNoeuds(h.vent)}
                              <span aria-hidden="true" style={{ display: 'inline-block', transform: `rotate(${h.direction + 180}deg)` }}>↑</span>
                            </span>
                            <span
                              className="chiffres py-1.5 font-[590] text-[#1c2430]"
                              style={{ background: couleurVent(enNoeuds(h.rafales)) }}
                            >
                              {enNoeuds(h.rafales)}
                            </span>
                            <span className="chiffres bg-fond-eleve py-1.5 text-encre-2">
                              {h.pluie >= 0.1 ? `${h.pluie.toFixed(1).replace('.', ',')}` : '—'}
                            </span>
                          </Fragment>
                        ))}
                    </div>
                    <p className="bg-fond-eleve px-2 py-1 text-legende text-encre-3">
                      Vent et rafales en nœuds, flèche = direction du vent · pluie en mm/h.
                    </p>
                  </div>
                )}

                {/* 🌊 La MER du jour (si on est près des côtes) : vagues, houle, eau. */}
                {(() => {
                  const merJour = (mer.data ?? []).filter(
                    (m) =>
                      m.quand.startsWith(j.date) &&
                      [6, 9, 12, 15, 18, 21].includes(Number(m.quand.slice(11, 13))) &&
                      m.vagues !== null,
                  )
                  if (merJour.length === 0) return null
                  return (
                    <div className="mt-2 overflow-hidden rounded-lg">
                      <div className="grid grid-cols-4 gap-px bg-trait text-center text-legende">
                        {['🌊 h', 'vagues (m)', 'houle (s)', 'eau (°C)'].map((t, i) => (
                          <span key={i} className="bg-fond-eleve py-1 font-[590] text-encre-3">{t}</span>
                        ))}
                        {merJour.map((m) => (
                          <Fragment key={m.quand}>
                            <span className="chiffres bg-fond-eleve py-1.5 text-encre">{Number(m.quand.slice(11, 13))}h</span>
                            <span
                              className="chiffres py-1.5 font-[700] text-[#1c2430]"
                              style={{ background: couleurVagues(m.vagues ?? 0) }}
                            >
                              {(m.vagues ?? 0).toFixed(1).replace('.', ',')}
                            </span>
                            <span className="chiffres bg-fond-eleve py-1.5 text-encre-2">
                              {m.periode !== null ? Math.round(m.periode) : '—'}
                            </span>
                            <span className="chiffres bg-fond-eleve py-1.5 text-encre">
                              {m.eau !== null ? Math.round(m.eau) : '—'}
                            </span>
                          </Fragment>
                        ))}
                      </div>
                      <p className="bg-fond-eleve px-2 py-1 text-legende text-encre-3">
                        Hauteur des vagues colorée (calme → forte) · houle = période entre deux vagues.
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}
            </div>
          ))}
          <Bouton
            pleineLargeur
            variante="discret"
            onClick={() => {
              setMeteoDetail(false)
              setVille(null)
            }}
          >
            ✏️ Changer de ville
          </Bouton>
          <p className="text-legende text-encre-3">
            Consensus de 2 modèles (Météo-France + modèle local, via Open-Meteo), actualisé toutes les 2 h — la pluie
            n'est annoncée que si les deux sont d'accord.
          </p>
        </div>
      </Feuille>

      {/* 🎒 Toutes les vacances scolaires à venir */}
      <Feuille ouverte={vacancesDetail} onFermer={() => setVacancesDetail(false)} titre="🎒 Vacances scolaires — zone B">
        <div className="flex flex-col gap-2">
          {ferie.data && (
            <div className="rounded-xl bg-ambre/15 px-3 py-2.5">
              <p className="text-corps-2 font-[590] text-encre">
                🎉 Prochain jour férié : {ferie.data.nom}
              </p>
              <p className="text-legende text-encre-3">
                {dateLisible(`${ferie.data.date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}
                {' '}— {ferie.data.dans === 0 ? "c'est aujourd'hui !" : ferie.data.dans === 1 ? 'demain !' : `dans ${ferie.data.dans} jours`}
                {' '}(calendrier officiel)
              </p>
            </div>
          )}
          {(vacances.data ?? []).map((v) => {
            const debut = new Date(v.debut)
            const fin = new Date(v.fin)
            if (Number.isNaN(debut.getTime())) return null
            const dans = differenceInCalendarDays(debut, maintenantLocal())
            const duree = Number.isNaN(fin.getTime()) ? null : differenceInCalendarDays(fin, debut)
            const long: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
            return (
              <div key={v.debut} className="rounded-xl bg-fond-sourd px-3 py-2.5">
                <p className="text-corps-2 font-[590] text-encre">{v.description}</p>
                <p className="text-legende text-encre-3">
                  {dateLisible(v.debut, long)} → {dateLisible(v.fin, long)}
                  {duree !== null ? ` · ${duree} jours` : ''}
                  {' '}· {dans <= 0 ? 'EN COURS 🎉' : `dans ${dans} jour${dans > 1 ? 's' : ''}`}
                </p>
              </div>
            )
          })}
          <p className="text-legende text-encre-3">Calendrier officiel de l'Éducation nationale, zone B.</p>
        </div>
      </Feuille>
    </div>
  )
}

/** Une ligne du panneau de personnalisation : poignée ☰ pour glisser, coche pour afficher. */
function LigneBlocOrdre({
  valeur,
  libelle,
  active,
  onBascule,
}: {
  valeur: string
  libelle: string
  active: boolean
  onBascule: (actif: boolean) => void
}) {
  const poignee = useDragControls()
  return (
    <Reorder.Item
      value={valeur}
      dragListener={false}
      dragControls={poignee}
      className="flex min-h-sur-tactile items-center gap-1 rounded-md bg-fond-sourd px-1"
    >
      <button
        aria-label={`Déplacer « ${libelle} »`}
        onPointerDown={(e) => {
          e.preventDefault()
          poignee.start(e)
        }}
        style={{ touchAction: 'none' }}
        className="cursor-grab px-3 py-3 text-[17px] text-encre-3"
      >
        ☰
      </button>
      <span className="flex-1 text-corps text-encre">{libelle}</span>
      <input
        type="checkbox"
        checked={active}
        onChange={(e) => onBascule(e.target.checked)}
        aria-label={`Afficher « ${libelle} »`}
        className="mr-2 h-6 w-6 accent-[#6e9b7a]"
      />
    </Reorder.Item>
  )
}
