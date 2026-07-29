// 🚨 LE TRAFIC AUTOUR DE MOI — accidents, routes coupées, gros bouchons.
//
// On autorise la position une fois, on choisit un rayon, et l'écran affiche en
// direct ce qui bloque autour. Tant que l'app est ouverte, elle re-vérifie
// toute seule et prévient dès qu'un incident SÉRIEUX apparaît.
import { useCallback, useEffect, useRef, useState } from 'react'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'
import {
  communeDe,
  couleurGravite,
  demanderPosition,
  EMOJI_INCIDENT,
  enregistrerReglagesTrafic,
  incidentsDejaVus,
  libelleIncident,
  marquerVus,
  meriteUneAlerte,
  positionMemorisee,
  reglagesTrafic,
  traficAutour,
  type IncidentAutour,
  type PositionConnue,
} from '@/lib/trafic'

const RAYONS = [10, 20, 30, 50]
const RETARDS = [5, 10, 20, 30]

/** « il y a 4 min » — pour savoir si la position est encore fraîche. */
const ilYA = (iso: string): string => {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const minutes = Math.round((Date.now() - t) / 60000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  return heures < 24 ? `il y a ${heures} h` : `il y a ${Math.round(heures / 24)} j`
}

export function EcranTrafic() {
  const [reglages, setReglages] = useState(() => reglagesTrafic())
  const [position, setPosition] = useState<PositionConnue | null>(() => positionMemorisee())
  const [commune, setCommune] = useState('')
  const [incidents, setIncidents] = useState<IncidentAutour[]>([])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [refusee, setRefusee] = useState(false)
  const [dernierReleve, setDernierReleve] = useState('')
  const monte = useRef(true)

  useEffect(() => {
    monte.current = true
    return () => {
      monte.current = false
    }
  }, [])

  const majReglages = (suivant: typeof reglages) => {
    setReglages(suivant)
    enregistrerReglagesTrafic(suivant)
  }

  /** Relève la position puis le trafic. `silencieux` = rafraîchissement auto. */
  const releverTout = useCallback(
    async (silencieux = false) => {
      if (!silencieux) setEnCours(true)
      setErreur(null)
      try {
        const p = (await demanderPosition()) ?? positionMemorisee()
        if (!p) {
          setRefusee(true)
          setErreur(
            'La position n’a pas pu être obtenue. Sur iPhone : Réglages → Confidentialité → Service de localisation, ' +
              'puis autorise Safari. Ensuite reviens ici et touche « Relever ».',
          )
          return
        }
        setRefusee(false)
        if (!monte.current) return
        setPosition(p)
        const liste = await traficAutour(p.lat, p.lon, reglages.rayonKm)
        if (!monte.current) return
        setIncidents(liste)
        setDernierReleve(new Date().toISOString())

        // La commune sert aux textes : on la cherche sans bloquer l'affichage.
        void communeDe(p.lat, p.lon).then((v) => {
          if (monte.current && v) setCommune(v)
        })

        // Prévenir, mais UNE SEULE FOIS par incident : sinon c'est du harcèlement.
        if (reglages.actif && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const vus = incidentsDejaVus()
          const nouveaux = liste.filter((i) => meriteUneAlerte(i, reglages.retardMinimum) && !vus[i.cle])
          for (const i of nouveaux.slice(0, 3)) {
            try {
              new Notification(`${EMOJI_INCIDENT[i.categorie] ?? '⚠️'} ${libelleIncident(i.categorie)} à ${i.distanceKm} km`, {
                body: [i.route, i.description, i.retardMin > 0 ? `+${i.retardMin} min` : ''].filter(Boolean).join(' · '),
                tag: i.cle,
              })
            } catch {
              // notification refusée par le système : l'écran suffit
            }
          }
          if (nouveaux.length > 0) marquerVus(nouveaux.map((i) => i.cle))
        }
      } catch (e) {
        if (monte.current) setErreur(`Le trafic n’a pas pu être relevé. (${String(e instanceof Error ? e.message : e).slice(0, 80)})`)
      } finally {
        if (monte.current) setEnCours(false)
      }
    },
    [reglages.rayonKm, reglages.actif, reglages.retardMinimum],
  )

  // Premier relevé si l'on a déjà une position mémorisée : l'écran s'ouvre plein.
  useEffect(() => {
    if (positionMemorisee()) void releverTout(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tant que l'écran est ouvert, on re-vérifie toutes les 4 minutes.
  useEffect(() => {
    const minuterie = window.setInterval(() => {
      if (positionMemorisee()) void releverTout(true)
    }, 4 * 60 * 1000)
    return () => window.clearInterval(minuterie)
  }, [releverTout])

  const activerAlertes = async () => {
    navigator.vibrate?.(4)
    if (typeof Notification === 'undefined') {
      setErreur('Ce navigateur ne sait pas afficher de notifications.')
      return
    }
    if (Notification.permission === 'default') await Notification.requestPermission().catch(() => 'denied')
    if (Notification.permission !== 'granted') {
      setErreur(
        'Les notifications sont refusées. Sur iPhone, l’app doit être installée sur l’écran d’accueil (Partager → ' +
          'Sur l’écran d’accueil), puis autorisée dans Réglages → Notifications.',
      )
      return
    }
    majReglages({ ...reglages, actif: true })
    void releverTout()
  }

  const serieux = incidents.filter((i) => meriteUneAlerte(i, reglages.retardMinimum))
  const secondaires = incidents.filter((i) => !meriteUneAlerte(i, reglages.retardMinimum))

  const carte = (i: IncidentAutour) => (
    <Carte key={`${i.cle}-${i.description}`}>
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px]"
          style={{ background: couleurGravite(i.gravite) }}
        >
          {EMOJI_INCIDENT[i.categorie] ?? '⚠️'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-corps-2 font-[590] text-encre">
            {libelleIncident(i.categorie)}
            {i.route ? ` · ${i.route}` : ''}
            <span className="chiffres font-[400] text-encre-3"> · à {i.distanceKm} km</span>
          </p>
          <p className="break-words text-corps-2 text-encre-2">{i.description}</p>
          {(i.de || i.vers) && (
            <p className="text-legende text-encre-3">
              {i.de}
              {i.vers ? ` → ${i.vers}` : ''}
            </p>
          )}
          <p className="text-legende text-encre-3">
            {i.retardMin > 0 ? `⏱ +${i.retardMin} min` : 'pas de retard chiffré'}
            {i.km > 0 ? ` · ${String(i.km).replace('.', ',')} km concernés` : ''}
          </p>
          <a
            href={`https://maps.apple.com/?ll=${i.lat},${i.lon}&q=${encodeURIComponent(libelleIncident(i.categorie))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-sur-tactile items-center rounded-full bg-fond-sourd px-3 text-note font-[590] text-encre-2"
          >
            🗺 Voir sur la carte
          </a>
        </div>
      </div>
    </Carte>
  )

  return (
    <div className="pb-8">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🚨 Le trafic autour de moi</h1>
        <p className="text-legende text-encre-3">
          {position
            ? `${commune || 'Position relevée'} · rayon ${reglages.rayonKm} km${dernierReleve ? ` · ${ilYA(dernierReleve)}` : ''}`
            : 'Accidents, routes coupées et gros bouchons près de toi'}
        </p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Bouton pleineLargeur variante="primaire" onClick={() => void releverTout()} desactive={enCours}>
          {enCours ? '📍 Relevé en cours…' : '📍 Relever le trafic autour de moi'}
        </Bouton>

        {erreur && <p className="text-corps-2 text-urgent">{erreur}</p>}

        {/* Le rayon et le seuil : c'est ça qui décide de ce qui dérange. */}
        <Carte>
          <p className="text-corps-2 font-[590] text-encre">Jusqu’où regarder ?</p>
          <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
            {RAYONS.map((r) => (
              <button
                key={r}
                onClick={() => majReglages({ ...reglages, rayonKm: r })}
                aria-pressed={reglages.rayonKm === r}
                className={`min-h-sur-tactile shrink-0 rounded-full px-4 text-note font-[590]
                  ${reglages.rayonKm === r ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
              >
                {r} km
              </button>
            ))}
          </div>
          <p className="mt-2 text-corps-2 font-[590] text-encre">À partir de quel retard prévenir ?</p>
          <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
            {RETARDS.map((r) => (
              <button
                key={r}
                onClick={() => majReglages({ ...reglages, retardMinimum: r })}
                aria-pressed={reglages.retardMinimum === r}
                className={`min-h-sur-tactile shrink-0 rounded-full px-4 text-note font-[590]
                  ${reglages.retardMinimum === r ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
              >
                +{r} min
              </button>
            ))}
          </div>
          <p className="mt-1 text-legende text-encre-3">
            Les accidents et les routes coupées préviennent toujours, quel que soit le retard.
          </p>
        </Carte>

        {/* Les alertes automatiques, avec ce qu'elles peuvent vraiment faire. */}
        <Carte>
          <p className="text-corps-2 font-[590] text-encre">
            {reglages.actif ? '🔔 Alertes activées' : '🔕 Alertes désactivées'}
          </p>
          <p className="mt-1 text-corps-2 text-encre-2">
            Quand l’app est ouverte, elle re-vérifie toutes les 4 minutes et te prévient dès qu’un accident, une route
            coupée ou un gros bouchon apparaît autour de toi. Chaque incident ne prévient qu’une fois.
          </p>
          <p className="mt-1 text-legende text-encre-3">
            ⚠️ iPhone : aucune application web n’a le droit de se géolocaliser en arrière-plan. Les alertes envoyées
            quand l’app est fermée utilisent donc ta DERNIÈRE position connue — celle du dernier relevé.
          </p>
          <div className="mt-2">
            {reglages.actif ? (
              <Bouton variante="discret" onClick={() => majReglages({ ...reglages, actif: false })}>
                🔕 Ne plus me prévenir
              </Bouton>
            ) : (
              <Bouton variante="valider" onClick={() => void activerAlertes()}>
                🔔 Me prévenir automatiquement
              </Bouton>
            )}
          </div>
        </Carte>

        {!position && !enCours && !refusee && (
          <EtatVide
            titre="Où es-tu ?"
            message="Touche « Relever le trafic autour de moi » : l’iPhone demandera l’autorisation une seule fois."
          />
        )}

        {position && !enCours && incidents.length === 0 && !erreur && (
          <p className="py-4 text-center text-corps-2 text-encre-3">
            ✅ Rien de signalé dans un rayon de {reglages.rayonKm} km. Ça roule.
          </p>
        )}

        {serieux.length > 0 && (
          <>
            <p className="text-corps-2 font-[590] text-urgent">
              {serieux.length} perturbation{serieux.length > 1 ? 's' : ''} sérieuse{serieux.length > 1 ? 's' : ''}
            </p>
            {serieux.map(carte)}
          </>
        )}

        {secondaires.length > 0 && (
          <>
            <p className="mt-2 text-corps-2 font-[590] text-encre-2">
              Et {secondaires.length} perturbation{secondaires.length > 1 ? 's' : ''} mineure
              {secondaires.length > 1 ? 's' : ''}
            </p>
            {secondaires.slice(0, 15).map(carte)}
          </>
        )}

        <p className="mt-2 text-legende text-encre-3">
          Source : le flux temps réel de TomTom — celui des applis de navigation, alimenté par les exploitants
          routiers, les forces de l’ordre et les véhicules connectés. La radio FM (107.7 et les décrochages locaux) ne
          diffuse aucun flux de données exploitable : elle ne peut pas être branchée.
        </p>
      </div>
    </div>
  )
}
