// Agenda — présentation calendrier classique : le mois en grille, la journée
// choisie en dessous. Pastilles de couleur par membre, tap pour isoler.
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { creerEvenement, supprimerEvenement, utiliserEvenementsPeriode } from '@/lib/requetes'
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

export function EcranAgenda() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [mois, setMois] = useState(() => {
    const m = maintenantLocal()
    return new Date(m.getFullYear(), m.getMonth(), 1)
  })
  const [jourChoisi, setJourChoisi] = useState(() => maintenantLocal())
  const [filtreMembre, setFiltreMembre] = useState<string | null>(null)
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [evenementOuvert, setEvenementOuvert] = useState<LigneEvenement | null>(null)

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

  const filtres = (evenements.data ?? []).filter(
    (e) => filtreMembre === null || e.participants.length === 0 || e.participants.includes(filtreMembre),
  )

  const evenementsPour = (jour: Date) => filtres.filter((e) => isSameDay(versLocal(e.debut_a), jour))
  const duJour = evenementsPour(jourChoisi).sort((a, b) => a.debut_a.localeCompare(b.debut_a))
  const aujourdHui = maintenantLocal()

  const couleursDe = (e: LigneEvenement) =>
    (e.participants.length === 0
      ? membres.filter((m) => m.role !== 'guest')
      : membres.filter((m) => e.participants.includes(m.id))
    ).map((m) => couleurMembre(m.couleur))

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-titre-2 capitalize text-encre">
            {mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </h1>
          <div className="flex items-center gap-1">
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
              <Bouton variante="discret" onClick={() => setCreationOuverte(true)} etiquette="Nouvel événement">
                +
              </Bouton>
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
        {duJour.length === 0 ? (
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
                  <div className="flex-1">
                    <p className="text-corps text-encre">{e.titre}</p>
                    <p className="chiffres text-note text-encre-3">
                      {e.journee_entiere ? 'Toute la journée' : `${formatHeure(e.debut_a)} – ${formatHeure(e.fin_a)}`}
                      {e.lieu ? ` · ${e.lieu}` : ''}
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

      {/* Détail / suppression */}
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
            {membre?.role === 'adult' && (
              <Bouton
                variante="urgent"
                pleineLargeur
                onClick={() => {
                  void supprimerEvenement(evenementOuvert.id).then(() =>
                    clientRequetes.invalidateQueries({ queryKey: ['evenements'] }),
                  )
                  setEvenementOuvert(null)
                }}
              >
                Supprimer cet événement
              </Bouton>
            )}
          </div>
        )}
      </Feuille>

      {foyer && membre && (
        <FeuilleCreation
          ouverte={creationOuverte}
          jourParDefaut={jourChoisi}
          onFermer={() => setCreationOuverte(false)}
          onCreer={async (brouillon) => {
            await creerEvenement(foyer.id, membre.id, brouillon)
            await clientRequetes.invalidateQueries({ queryKey: ['evenements'] })
            setCreationOuverte(false)
          }}
        />
      )}
    </div>
  )
}

interface PropsCreation {
  ouverte: boolean
  jourParDefaut: Date
  onFermer: () => void
  onCreer: (brouillon: {
    titre: string
    debut_a: string
    fin_a: string
    lieu: string | null
    participants: string[]
    journee_entiere: boolean
  }) => Promise<void>
}

function FeuilleCreation({ ouverte, jourParDefaut, onFermer, onCreer }: PropsCreation) {
  const { membres } = utiliserSession()
  const [titre, setTitre] = useState('')
  const [date, setDate] = useState(dateIsoJour(jourParDefaut))
  const [heure, setHeure] = useState('18:00')
  const [duree, setDuree] = useState(60)
  const [lieu, setLieu] = useState('')
  const [participants, setParticipants] = useState<string[]>([])

  const valider = async () => {
    if (!titre.trim()) return
    const debutLocal = new Date(`${date}T${heure}:00`)
    const finLocal = new Date(debutLocal.getTime() + duree * 60_000)
    await onCreer({
      titre: titre.trim(),
      debut_a: versUtc(debutLocal),
      fin_a: versUtc(finLocal),
      lieu: lieu.trim() || null,
      participants,
      journee_entiere: false,
    })
    setTitre('')
    setLieu('')
    setParticipants([])
  }

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Nouvel événement">
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
            <option value={30}>30 min</option>
            <option value={60}>1 h</option>
            <option value={90}>1 h 30</option>
            <option value={120}>2 h</option>
            <option value={240}>Demi-journée</option>
          </select>
        </label>
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
        <Bouton pleineLargeur variante="valider" onClick={() => void valider()}>
          Ajouter
        </Bouton>
      </div>
    </Feuille>
  )
}
