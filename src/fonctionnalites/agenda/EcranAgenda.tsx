// Agenda — vue Semaine (la sync CalDAV Apple arrive en phase 3).
// Filtres par membre : les pastilles de couleur, tap pour isoler.
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { creerEvenement, utiliserEvenementsPeriode } from '@/lib/requetes'
import {
  addDays,
  bornesJourneeLocale,
  dateIsoJour,
  formatHeure,
  formatJourLong,
  isSameDay,
  maintenantLocal,
  versLocal,
  versUtc,
} from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { EtatVide } from '@/design/composants/EtatVide'

const JOURS_AFFICHES = 7

export function EcranAgenda() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [filtreMembre, setFiltreMembre] = useState<string | null>(null)
  const [creationOuverte, setCreationOuverte] = useState(false)

  const debutPeriode = bornesJourneeLocale().debut
  const finPeriode = bornesJourneeLocale(addDays(maintenantLocal(), JOURS_AFFICHES - 1)).fin
  const evenements = utiliserEvenementsPeriode(debutPeriode, finPeriode)

  const jours = useMemo(
    () => Array.from({ length: JOURS_AFFICHES }, (_, i) => addDays(maintenantLocal(), i)),
    [],
  )

  const filtres = (evenements.data ?? []).filter(
    (e) =>
      filtreMembre === null ||
      e.participants.length === 0 ||
      e.participants.includes(filtreMembre),
  )

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <h1 className="text-titre-2 text-encre">Agenda</h1>
          {membre?.role === 'adult' && (
            <Bouton variante="discret" onClick={() => setCreationOuverte(true)} etiquette="Nouvel événement">
              +
            </Bouton>
          )}
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

      <div className="flex flex-col gap-5 px-5 pt-3">
        {jours.map((jour) => {
          const duJour = filtres.filter((e) => isSameDay(versLocal(e.debut_a), jour))
          return (
            <section key={dateIsoJour(jour)}>
              <h2 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">
                {formatJourLong(jour)}
              </h2>
              {duJour.length === 0 ? (
                <p className="text-corps-2 text-encre-3">—</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {duJour.map((evenement) => (
                    <li
                      key={evenement.id}
                      className="flex min-h-sur-tactile items-center gap-3 rounded-md bg-fond-eleve px-3 py-2 shadow-carte"
                    >
                      <span className="chiffres w-12 text-note text-encre-3">
                        {evenement.journee_entiere ? 'jour' : formatHeure(evenement.debut_a)}
                      </span>
                      <span className="flex-1 text-corps text-encre">{evenement.titre}</span>
                      <span className="flex gap-0.5">
                        {(evenement.participants.length === 0
                          ? membres.filter((m) => m.role !== 'guest')
                          : membres.filter((m) => evenement.participants.includes(m.id))
                        ).map((m) => (
                          <span
                            key={m.id}
                            className="h-2 w-2 rounded-full"
                            style={{ background: couleurMembre(m.couleur) }}
                            aria-label={m.prenom}
                          />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
        {evenements.isError && (
          <EtatVide titre="Hors ligne" message="Les événements affichés viennent du cache local." />
        )}
      </div>

      {foyer && membre && (
        <FeuilleCreation
          ouverte={creationOuverte}
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

function FeuilleCreation({ ouverte, onFermer, onCreer }: PropsCreation) {
  const { membres } = utiliserSession()
  const [titre, setTitre] = useState('')
  const [date, setDate] = useState(dateIsoJour(maintenantLocal()))
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
        <ChampTexte
          etiquette="Titre"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Piscine, dîner chez…"
        />
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
          <span className="mb-1 block text-note font-[500] text-encre-2">
            Qui ? (personne = tout le foyer)
          </span>
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
                      actuels.includes(m.id)
                        ? actuels.filter((id) => id !== m.id)
                        : [...actuels, m.id],
                    )
                  }
                />
              ))}
          </div>
        </div>
        <Bouton pleineLargeur onClick={() => void valider()}>
          Ajouter
        </Bouton>
      </div>
    </Feuille>
  )
}
