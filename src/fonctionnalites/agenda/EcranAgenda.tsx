// Agenda — présentation calendrier classique : le mois en grille, la journée
// choisie en dessous. Pastilles de couleur par membre, tap pour isoler.
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import {
  creerEvenement,
  creerSerieEvenements,
  modifierEvenement,
  serieDe,
  supprimerEvenement,
  supprimerSerieEvenements,
  utiliserEvenementsPeriode,
} from '@/lib/requetes'
import {
  addDays,
  bornesJourneeLocale,
  dateIsoJour,
  formatHeure,
  isSameDay,
  maintenantLocal,
  versLocal,
  versUtc,
} from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'
import type { LigneEvenement } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { PastilleMembre } from '@/design/composants/PastilleMembre'

const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// Répétitions proposées : générées sur 6 mois, à heure fixe (heure de Paris).
const RECURRENCES_EVENEMENT: { libelle: string; jours?: number; mois?: number; cap: number }[] = [
  { libelle: 'Une seule fois', cap: 1 },
  { libelle: 'Tous les jours', jours: 1, cap: 60 },
  { libelle: 'Toutes les semaines', jours: 7, cap: 26 },
  { libelle: 'Toutes les 2 semaines', jours: 14, cap: 13 },
  { libelle: 'Tous les mois', mois: 1, cap: 6 },
]

export function EcranAgenda() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [mois, setMois] = useState(() => {
    const m = maintenantLocal()
    return new Date(m.getFullYear(), m.getMonth(), 1)
  })
  const [jourChoisi, setJourChoisi] = useState(() => maintenantLocal())
  const [filtreMembre, setFiltreMembre] = useState<string | null>(null)
  const [enEdition, setEnEdition] = useState<LigneEvenement | 'nouveau' | null>(null)
  const [evenementOuvert, setEvenementOuvert] = useState<LigneEvenement | null>(null)
  const [erreurAction, setErreurAction] = useState<string | null>(null)

  // La grille couvre du lundi avant le 1er au dimanche après le dernier jour.
  const grille = useMemo(() => {
    const premier = new Date(mois.getFullYear(), mois.getMonth(), 1)
    const decalage = (premier.getDay() + 6) % 7 // lundi = 0
    const debut = addDays(premier, -decalage)
    const cellules: Date[] = []
    for (let i = 0; i < 42; i++) cellules.push(addDays(debut, i))
    // on coupe la dernière semaine si elle est entièrement hors mois
    // on coupe la 6e semaine si elle est entièrement hors mois
    const derniereUtile = cellules.slice(35).some((d) => d.getMonth() === mois.getMonth())
    return derniereUtile ? cellules : cellules.slice(0, 35)
  }, [mois])

  const debutPeriode = bornesJourneeLocale(grille[0] ?? mois).debut
  const finPeriode = bornesJourneeLocale(grille[grille.length - 1] ?? mois).fin
  const evenements = utiliserEvenementsPeriode(debutPeriode, finPeriode)

  // `participants` vient de la base : on ne suppose jamais que c'est un tableau.
  const participantsDe = (e: LigneEvenement) => (Array.isArray(e.participants) ? e.participants : [])

  const filtres = useMemo(
    () =>
      (evenements.data ?? []).filter(
        (e) =>
          filtreMembre === null ||
          participantsDe(e).length === 0 ||
          participantsDe(e).includes(filtreMembre),
      ),
    [evenements.data, filtreMembre],
  )

  // La grille appelle ce filtre 35 à 42 fois par rendu : on indexe une fois par
  // jour local plutôt que de reparcourir toute la période à chaque cellule.
  const parJour = useMemo(() => {
    const carte = new Map<string, LigneEvenement[]>()
    for (const e of filtres) {
      const debut = versLocal(e.debut_a)
      if (Number.isNaN(debut.getTime())) continue // date illisible : on l'ignore
      const cle = dateIsoJour(debut)
      carte.set(cle, [...(carte.get(cle) ?? []), e])
    }
    return carte
  }, [filtres])

  const evenementsPour = (jour: Date) => parJour.get(dateIsoJour(jour)) ?? []
  const duJour = [...evenementsPour(jourChoisi)].sort((a, b) => (a.debut_a ?? '').localeCompare(b.debut_a ?? ''))
  const aujourdHui = maintenantLocal()

  const couleursDe = (e: LigneEvenement) =>
    (participantsDe(e).length === 0
      ? membres.filter((m) => m.role !== 'guest')
      : membres.filter((m) => participantsDe(e).includes(m.id))
    ).map((m) => couleurMembre(m.couleur))

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="min-w-0 flex-1 truncate text-titre-2 capitalize text-encre">
            {mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}
              aria-label="Mois précédent"
              className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full text-titre-3 text-ardoise"
            >
              ‹
            </button>
            <button
              onClick={() => {
                const m = maintenantLocal()
                setMois(new Date(m.getFullYear(), m.getMonth(), 1))
                setJourChoisi(m)
              }}
              className="min-h-sur-tactile rounded-full bg-fond-sourd px-3 text-note font-[590] text-encre-2"
            >
              Aujourd’hui
            </button>
            <button
              onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}
              aria-label="Mois suivant"
              className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full text-titre-3 text-ardoise"
            >
              ›
            </button>
            {membre?.role === 'adult' && (
              <button
                onClick={() => {
                  navigator.vibrate?.(4)
                  setEnEdition('nouveau')
                }}
                aria-label="Nouvel événement"
                className="flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center
                  rounded-full bg-fond-sourd text-titre-3 font-[590] text-encre"
              >
                +
              </button>
            )}
          </div>
        </div>

        {/* La grille du mois */}
        <div className="mt-1 grid grid-cols-7 text-center">
          {JOURS_SEMAINE.map((j, i) => (
            <span key={i} className="pb-1 text-legende font-[590] text-encre-3">{j}</span>
          ))}
          {grille.map((jour) => {
            const horsMois = jour.getMonth() !== mois.getMonth()
            const estAujourdHui = isSameDay(jour, aujourdHui)
            const estChoisi = isSameDay(jour, jourChoisi)
            const couleurs = [...new Set(evenementsPour(jour).flatMap(couleursDe))].slice(0, 3)
            return (
              <button
                key={dateIsoJour(jour)}
                onClick={() => {
                  navigator.vibrate?.(4)
                  setJourChoisi(jour)
                  if (horsMois) setMois(new Date(jour.getFullYear(), jour.getMonth(), 1))
                }}
                aria-label={jour.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                aria-pressed={estChoisi}
                className="flex min-h-[44px] flex-col items-center justify-center"
              >
                <span
                  className={`chiffres flex h-8 w-8 items-center justify-center rounded-full text-corps-2
                    ${estChoisi ? 'font-[700] text-white' : estAujourdHui ? 'font-[700] text-corail' : horsMois ? 'text-encre-3 opacity-40' : 'text-encre'}`}
                  style={estChoisi ? { background: 'var(--ardoise)' } : undefined}
                >
                  {jour.getDate()}
                </span>
                <span className="flex h-1.5 gap-0.5">
                  {couleurs.map((c, i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-1 flex gap-1">
          {membres
            .filter((m) => m.role !== 'guest')
            .map((m) => (
              <PastilleMembre
                key={m.id}
                membre={m}
                estompee={filtreMembre !== null && filtreMembre !== m.id}
                onClick={() => setFiltreMembre(filtreMembre === m.id ? null : m.id)}
              />
            ))}
        </div>
      </header>

      {/* La journée choisie */}
      <div className="px-5 pt-3">
        <h2 className="mb-2 text-corps font-[700] capitalize text-encre">
          {jourChoisi.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        {erreurAction && <p className="mb-2 text-legende text-urgent">{erreurAction}</p>}
        {evenements.isLoading ? (
          // « Rien ce jour-là » pendant le chargement faisait croire à un agenda vide.
          <p className="py-6 text-center text-corps-2 text-encre-3">Chargement de l’agenda…</p>
        ) : duJour.length === 0 ? (
          <p className="py-6 text-center text-corps-2 text-encre-3">Rien ce jour-là.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {duJour.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setEvenementOuvert(e)}
                  className="flex min-h-sur-tactile w-full items-center gap-3 rounded-xl bg-fond-eleve px-3 py-2 text-left shadow-carte"
                >
                  <span className="flex w-1 self-stretch rounded-full" style={{ background: couleursDe(e)[0] }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-corps text-encre">{e.titre}</p>
                    <p className="chiffres text-note text-encre-3">
                      {e.journee_entiere ? 'Toute la journée' : `${formatHeure(e.debut_a)} – ${formatHeure(e.fin_a)}`}
                      {e.lieu ? ` · ${e.lieu}` : ''}
                      {serieDe(e) ? ' · 🔁' : ''}
                      {e.source === 'ics' ? ' ·  iCloud' : ''}
                    </p>
                  </div>
                  <span className="flex gap-0.5">
                    {couleursDe(e).map((c, i) => (
                      <span key={i} className="h-2 w-2 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Détail / modification / suppression */}
      <Feuille ouverte={evenementOuvert !== null} onFermer={() => setEvenementOuvert(null)} titre={evenementOuvert?.titre ?? ''}>
        {evenementOuvert && (
          <div className="flex flex-col gap-3">
            <p className="chiffres text-corps text-encre-2">
              {evenementOuvert.journee_entiere
                ? 'Toute la journée'
                : `${formatHeure(evenementOuvert.debut_a)} – ${formatHeure(evenementOuvert.fin_a)}`}
              {evenementOuvert.lieu ? ` · ${evenementOuvert.lieu}` : ''}
            </p>
            {evenementOuvert.notes && <p className="text-corps-2 text-encre-3">{evenementOuvert.notes}</p>}
            {serieDe(evenementOuvert) && (
              <p className="text-note text-encre-3">🔁 Ce rendez-vous fait partie d’une série récurrente.</p>
            )}
            {evenementOuvert.source === 'ics' && (
              <p className="text-note text-encre-3">
                 Importé de ton calendrier Apple — il reviendra à la prochaine synchronisation si tu le
                supprimes ici sans le supprimer dans Calendrier.
              </p>
            )}
            {membre?.role === 'adult' && (
              <Bouton
                variante="discret"
                pleineLargeur
                onClick={() => {
                  setEnEdition(evenementOuvert)
                  setEvenementOuvert(null)
                }}
              >
                Modifier
              </Bouton>
            )}
            {membre?.role === 'adult' && (
              <Bouton
                variante="urgent"
                pleineLargeur
                onClick={() => {
                  setErreurAction(null)
                  void supprimerEvenement(evenementOuvert.id)
                    .then(() => clientRequetes.invalidateQueries({ queryKey: ['evenements'] }))
                    .catch(() => setErreurAction('Suppression impossible — vérifie le réseau et réessaie.'))
                  setEvenementOuvert(null)
                }}
              >
                {serieDe(evenementOuvert) ? 'Supprimer cette occurrence' : 'Supprimer cet événement'}
              </Bouton>
            )}
            {membre?.role === 'adult' && serieDe(evenementOuvert) && (
              <Bouton
                variante="discret"
                pleineLargeur
                onClick={() => {
                  const serie = serieDe(evenementOuvert)
                  if (!serie) return
                  setErreurAction(null)
                  // La suppression de série exige le réseau : si elle échoue,
                  // il faut le dire (avant, la feuille se fermait en silence).
                  void supprimerSerieEvenements(serie)
                    .then(async (ok) => {
                      await clientRequetes.invalidateQueries({ queryKey: ['evenements'] })
                      if (!ok) setErreurAction('La série n’a pas pu être supprimée — reconnecte-toi et réessaie.')
                    })
                    .catch(() => setErreurAction('La série n’a pas pu être supprimée — vérifie le réseau.'))
                  setEvenementOuvert(null)
                }}
              >
                🔁 Supprimer toute la série
              </Bouton>
            )}
          </div>
        )}
      </Feuille>

      {foyer && membre && (
        <FeuilleCreation
          key={enEdition !== null && enEdition !== 'nouveau' ? enEdition.id : 'nouveau'}
          ouverte={enEdition !== null}
          jourParDefaut={jourChoisi}
          initiale={enEdition !== null && enEdition !== 'nouveau' ? enEdition : null}
          onFermer={() => setEnEdition(null)}
          onCreer={async (brouillon, serie) => {
            if (enEdition !== null && enEdition !== 'nouveau') {
              await modifierEvenement(enEdition.id, brouillon)
            } else if (serie) {
              const { debut_a, fin_a, ...base } = brouillon
              void debut_a
              void fin_a
              await creerSerieEvenements(foyer.id, membre.id, base, serie.occurrences, serie.libelle)
            } else {
              await creerEvenement(foyer.id, membre.id, brouillon)
            }
            await clientRequetes.invalidateQueries({ queryKey: ['evenements'] })
            setEnEdition(null)
          }}
        />
      )}
    </div>
  )
}

interface PropsCreation {
  ouverte: boolean
  jourParDefaut: Date
  initiale: LigneEvenement | null
  onFermer: () => void
  onCreer: (
    brouillon: {
      titre: string
      debut_a: string
      fin_a: string
      lieu: string | null
      participants: string[]
      journee_entiere: boolean
    },
    serie?: { occurrences: { debut_a: string; fin_a: string }[]; libelle: string },
  ) => Promise<void>
}

function FeuilleCreation({ ouverte, jourParDefaut, initiale, onFermer, onCreer }: PropsCreation) {
  const { membres } = utiliserSession()
  const [titre, setTitre] = useState(initiale?.titre ?? '')
  const [date, setDate] = useState(initiale ? dateIsoJour(versLocal(initiale.debut_a)) : dateIsoJour(jourParDefaut))
  const [heure, setHeure] = useState(initiale ? formatHeure(initiale.debut_a) : '18:00')
  const [duree, setDuree] = useState(() => {
    if (!initiale) return 60
    // Une fin illisible donnait NaN, puis une date invalide au moment
    // d'enregistrer (l'écran tombait). On retombe sur 1 h.
    const ecart = (new Date(initiale.fin_a).getTime() - new Date(initiale.debut_a).getTime()) / 60_000
    return Number.isFinite(ecart) && ecart >= 1 ? Math.round(ecart) : 60
  })
  const [lieu, setLieu] = useState(initiale?.lieu ?? '')
  const [participants, setParticipants] = useState<string[]>(
    Array.isArray(initiale?.participants) ? initiale.participants : [],
  )
  const [recurrence, setRecurrence] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)

  const valider = async () => {
    if (!titre.trim()) return
    // Sur iOS le champ date/heure peut être vidé : `new Date('T:00')` est
    // invalide et `versUtc()` jetait alors une RangeError (écran blanc).
    const debutLocal = new Date(`${date}T${heure}:00`)
    if (Number.isNaN(debutLocal.getTime())) {
      setErreur('Date ou heure incomplète — vérifie les deux champs.')
      return
    }
    setErreur(null)
    const finLocal = new Date(debutLocal.getTime() + duree * 60_000)
    const brouillon = {
      titre: titre.trim(),
      debut_a: versUtc(debutLocal),
      fin_a: versUtc(finLocal),
      lieu: lieu.trim() || null,
      participants,
      journee_entiere: initiale?.journee_entiere ?? false,
    }
    const regle = RECURRENCES_EVENEMENT[recurrence]
    try {
      if (regle && (regle.jours || regle.mois)) {
        // On génère les occurrences à heure de mur constante (18h reste 18h,
        // même après un changement d'heure été/hiver).
        const annee = debutLocal.getFullYear()
        const moisIndex = debutLocal.getMonth()
        const jourNum = debutLocal.getDate()
        const hh = debutLocal.getHours()
        const mm = debutLocal.getMinutes()
        const occurrences: { debut_a: string; fin_a: string }[] = []
        const limite = debutLocal.getTime() + 183 * 24 * 3600 * 1000
        for (let i = 0; i < regle.cap; i++) {
          let debutOcc: Date
          if (regle.mois) {
            // Le 31 d'un mois n'existe pas partout : sans borne, « tous les
            // mois » à partir du 31 janvier sautait au 3 mars.
            const cible = new Date(annee, moisIndex + i * regle.mois, 1, hh, mm)
            const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate()
            debutOcc = new Date(cible.getFullYear(), cible.getMonth(), Math.min(jourNum, dernierJour), hh, mm)
          } else {
            debutOcc = new Date(annee, moisIndex, jourNum + i * (regle.jours ?? 7), hh, mm)
          }
          if (Number.isNaN(debutOcc.getTime()) || debutOcc.getTime() > limite) break
          occurrences.push({
            debut_a: versUtc(debutOcc),
            fin_a: versUtc(new Date(debutOcc.getTime() + duree * 60_000)),
          })
        }
        await onCreer(brouillon, { occurrences, libelle: regle.libelle })
      } else {
        await onCreer(brouillon)
      }
    } catch {
      // Le panneau restait ouvert, muet, sans qu'on sache si c'était enregistré.
      setErreur('Enregistrement impossible — vérifie le réseau et réessaie.')
      return
    }
    setTitre('')
    setLieu('')
    setParticipants([])
    setRecurrence(0)
  }

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={initiale ? 'Modifier l’événement' : 'Nouvel événement'}>
      <div className="flex flex-col gap-3">
        <ChampTexte etiquette="Titre" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Piscine, dîner chez…" />
        <div className="flex gap-3">
          <ChampTexte etiquette="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <ChampTexte etiquette="Heure" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
        </div>
        <label className="block">
          <span className="mb-1 block text-note font-[500] text-encre-2">Durée</span>
          <select
            value={duree}
            onChange={(e) => setDuree(Number(e.target.value))}
            className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps text-encre"
          >
            {/* Une durée héritée d'un événement existant peut sortir des choix standard. */}
            {![30, 60, 90, 120, 240].includes(duree) && <option value={duree}>{duree} min</option>}
            <option value={30}>30 min</option>
            <option value={60}>1 h</option>
            <option value={90}>1 h 30</option>
            <option value={120}>2 h</option>
            <option value={240}>Demi-journée</option>
          </select>
        </label>
        {/* Pas de répétition en modification : chaque occurrence se modifie une par une. */}
        {!initiale && (
          <label className="block">
            <span className="mb-1 block text-note font-[500] text-encre-2">Répétition</span>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(Number(e.target.value))}
              className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps text-encre"
            >
              {RECURRENCES_EVENEMENT.map((r, i) => (
                <option key={r.libelle} value={i}>{r.libelle}</option>
              ))}
            </select>
            {recurrence > 0 && (
              <span className="mt-1 block text-legende text-encre-3">
                La série est posée sur 6 mois — supprimable d’un coup depuis n’importe quelle occurrence.
              </span>
            )}
          </label>
        )}
        <ChampTexte etiquette="Lieu (facultatif)" value={lieu} onChange={(e) => setLieu(e.target.value)} />
        <div>
          <span className="mb-1 block text-note font-[500] text-encre-2">Qui ? (personne = tout le foyer)</span>
          <div className="flex gap-1">
            {membres
              .filter((m) => m.role !== 'guest')
              .map((m) => (
                <PastilleMembre
                  key={m.id}
                  membre={m}
                  taille={34}
                  estompee={participants.length > 0 && !participants.includes(m.id)}
                  onClick={() =>
                    setParticipants((actuels) =>
                      actuels.includes(m.id) ? actuels.filter((id) => id !== m.id) : [...actuels, m.id],
                    )
                  }
                />
              ))}
          </div>
        </div>
        {erreur && <p className="text-legende text-urgent">{erreur}</p>}
        {/* Sans titre, le bouton ne faisait rien du tout : il est maintenant inactif. */}
        <Bouton pleineLargeur variante="valider" desactive={!titre.trim()} onClick={() => void valider()}>
          {initiale ? 'Enregistrer' : 'Ajouter'}
        </Bouton>
      </div>
    </Feuille>
  )
}
