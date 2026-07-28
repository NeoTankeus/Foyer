// 🌤 La fiche météo complète, façon Windfinder : on choisit un jour, et on a
// TOUT ce qui est prévu heure par heure — température, ressenti, pluie et sa
// probabilité, vent en nœuds avec rafales et direction, humidité, nuages,
// pression, et l'état de la mer près des côtes.
//
// L'écran est AUTONOME : le lieu se lit dans l'adresse
// (?lat=&lon=&nom=), sinon c'est la ville de la maison. On peut en changer
// à tout moment sans rien perdre.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'
import {
  chercherVilles,
  iconeMeteo,
  meteoComplete,
  villeMeteo,
  type HeureDetaillee,
  type Lieu,
  type MerHeure,
} from '@/lib/meteo'

// L'échelle de vent de Windfinder : une couleur par force, en nœuds.
const couleurVent = (noeuds: number): string =>
  noeuds < 4 ? '#dfe8ee'
  : noeuds < 8 ? '#a9d9f2'
  : noeuds < 11 ? '#93d693'
  : noeuds < 14 ? '#cbe371'
  : noeuds < 17 ? '#f5d455'
  : noeuds < 21 ? '#f7a73e'
  : noeuds < 25 ? '#f2722d'
  : noeuds < 30 ? '#e6402f'
  : '#b3268f'

const couleurVagues = (m: number): string =>
  m < 0.3 ? '#dfe8ee' : m < 0.6 ? '#a9d9f2' : m < 1 ? '#93d693' : m < 1.5 ? '#f5d455' : m < 2.5 ? '#f7a73e' : '#e6402f'

const enNoeuds = (kmh: number): number => Math.round(kmh / 1.852)

const libelleUv = (uv: number): string =>
  uv >= 11 ? 'extrême' : uv >= 8 ? 'très fort' : uv >= 6 ? 'fort' : uv >= 3 ? 'modéré' : 'faible'

// La rose des vents en 16 points : « d'où vient le vent ».
const CARDINAUX = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
const cardinal = (degres: number): string => CARDINAUX[Math.round((((degres % 360) + 360) % 360) / 22.5) % 16] ?? 'N'

/** Le texte lisible d'une journée : « lundi 4 août ». */
const jourLisible = (date: string): string => {
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const jourCourt = (date: string): string => {
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
}

/** Le lieu demandé dans l'adresse, s'il est complet et plausible. */
const lieuDeAdresse = (p: URLSearchParams): Lieu | null => {
  const la = Number(p.get('lat'))
  const lo = Number(p.get('lon'))
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null
  return { nom: p.get('nom')?.trim() || 'Ce lieu', latitude: la, longitude: lo }
}

export function EcranMeteo() {
  const [parametres] = useSearchParams()
  const lieuUrl = useMemo(() => lieuDeAdresse(parametres), [parametres])
  const jourDemande = parametres.get('jour') ?? ''
  // On accepte aussi un simple NOM de ville (?ville=Biarritz) : c'est ce que
  // passe la fiche d'un voyage, qui ne connaît pas les coordonnées.
  const villeDemandee = (parametres.get('ville') ?? '').trim()

  const villeResolue = useQuery({
    queryKey: ['meteo-ville', villeDemandee],
    enabled: villeDemandee !== '' && lieuUrl === null,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async () => (await chercherVilles(villeDemandee))[0] ?? null,
  })

  // Le lieu affiché : celui de l'adresse, sinon la ville de la maison.
  const [lieu, setLieu] = useState<Lieu | null>(() => {
    if (lieuUrl) return lieuUrl
    const ville = villeMeteo()
    return ville ? { nom: ville.nom, latitude: ville.latitude, longitude: ville.longitude } : null
  })
  // Arriver sur l'écran depuis un autre voyage doit changer le lieu affiché.
  useEffect(() => {
    if (lieuUrl) setLieu(lieuUrl)
  }, [lieuUrl])
  // Le nom de ville, une fois retrouvé sur la carte, devient le lieu affiché.
  useEffect(() => {
    if (villeResolue.data) setLieu(villeResolue.data)
  }, [villeResolue.data])

  const [chercheOuverte, setChercheOuverte] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [candidats, setCandidats] = useState<Lieu[]>([])
  const [chercheEnCours, setChercheEnCours] = useState(false)
  const [jourChoisi, setJourChoisi] = useState(jourDemande)

  const fiche = useQuery({
    queryKey: ['meteo-fiche', lieu?.latitude, lieu?.longitude],
    enabled: lieu !== null,
    staleTime: 30 * 60 * 1000,
    queryFn: () => meteoComplete(lieu as Lieu, 7),
  })

  const jours = useMemo(() => fiche.data?.jours ?? [], [fiche.data])
  // Le jour affiché : celui demandé s'il existe encore, sinon le premier.
  const jour = useMemo(
    () => jours.find((j) => j.date === jourChoisi) ?? jours[0] ?? null,
    [jours, jourChoisi],
  )

  const heuresDuJour = useMemo<HeureDetaillee[]>(
    () => (jour ? (fiche.data?.heures ?? []).filter((h) => h.quand.startsWith(jour.date)) : []),
    [fiche.data, jour],
  )
  const merDuJour = useMemo<MerHeure[]>(
    () => (jour ? (fiche.data?.mer ?? []).filter((m) => m.quand.startsWith(jour.date)) : []),
    [fiche.data, jour],
  )
  // La mer n'a de sens qu'au bord de l'eau : dans les terres tout est vide.
  const aDeLaMer = merDuJour.some((m) => m.vagues !== null || m.eau !== null)

  const lancerRecherche = async () => {
    const texte = saisie.trim()
    if (texte.length < 2) return
    setChercheEnCours(true)
    setCandidats(await chercherVilles(texte))
    setChercheEnCours(false)
  }

  const totalPluie = heuresDuJour.reduce((t, h) => t + h.pluie, 0)
  const ventMax = heuresDuJour.reduce((t, h) => Math.max(t, h.rafales), 0)

  return (
    <div className="pb-8">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🌤 La météo en détail</h1>
        <p className="text-legende text-encre-3">{lieu ? lieu.nom : 'Choisis un lieu'}</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {/* Changer de ville — sans jamais perdre celle d'où l'on vient. */}
        <div className="flex flex-col gap-2">
          <Bouton
            variante="discret"
            pleineLargeur
            onClick={() => {
              navigator.vibrate?.(4)
              setChercheOuverte((v) => !v)
            }}
          >
            🔍 Voir une autre ville
          </Bouton>
          {chercheOuverte && (
            <Carte>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void lancerRecherche()
                }}
                className="flex gap-2"
              >
                <input
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value)}
                  placeholder="Biarritz, Toulon, Annecy…"
                  aria-label="Nom de la ville"
                  className="min-h-sur-tactile min-w-0 flex-1 rounded-lg bg-fond-sourd px-3 text-corps-2 text-encre"
                />
                <Bouton type="submit" variante="primaire" desactive={saisie.trim().length < 2}>
                  Chercher
                </Bouton>
              </form>
              {chercheEnCours && <p className="mt-2 text-legende text-encre-3">Recherche…</p>}
              {!chercheEnCours && candidats.length === 0 && saisie.trim().length >= 2 && (
                <p className="mt-2 text-legende text-encre-3">Aucune commune de ce nom — vérifie l’orthographe.</p>
              )}
              <ul className="mt-2 flex flex-col gap-1">
                {candidats.map((c) => (
                  <li key={`${c.latitude},${c.longitude}`}>
                    <button
                      onClick={() => {
                        navigator.vibrate?.(4)
                        setLieu(c)
                        setJourChoisi('')
                        setChercheOuverte(false)
                        setCandidats([])
                        setSaisie('')
                      }}
                      className="min-h-sur-tactile w-full rounded-lg bg-fond-sourd px-3 text-left text-corps-2 text-encre active:bg-fond-eleve"
                    >
                      📍 {c.nom}
                    </button>
                  </li>
                ))}
              </ul>
            </Carte>
          )}
        </div>

        {!lieu && (
          <EtatVide
            titre="Quel endroit ?"
            message="Renseigne la ville de la maison dans le Radar de départ, ou cherche une ville ci-dessus."
          />
        )}

        {villeResolue.isPending && villeDemandee !== '' && lieuUrl === null && (
          <p className="py-6 text-center text-corps-2 text-encre-3">📍 Localisation de « {villeDemandee} »…</p>
        )}
        {villeResolue.isFetched && villeResolue.data === null && (
          <EtatVide
            titre="Ville introuvable"
            message={`« ${villeDemandee} » n’a pas été trouvée sur la carte — cherche-la ci-dessus.`}
          />
        )}

        {lieu && fiche.isPending && <p className="py-6 text-center text-corps-2 text-encre-3">🌤 Relevé en cours…</p>}

        {lieu && !fiche.isPending && jours.length === 0 && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center text-corps-2 text-encre-3">
              Les prévisions n’ont pas pu être chargées pour ce lieu.
              {fiche.error instanceof Error && (
                <>
                  <br />
                  <span className="text-legende">Diagnostic pour STG : {fiche.error.message.slice(0, 140)}</span>
                </>
              )}
            </p>
            <Bouton variante="discret" onClick={() => void fiche.refetch()}>🔄 Réessayer</Bouton>
          </div>
        )}

        {/* Les jours : un appui pour ouvrir le détail de celui qu'on veut. */}
        {jours.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {jours.map((j) => {
              const actif = jour?.date === j.date
              return (
                <button
                  key={j.date}
                  onClick={() => {
                    navigator.vibrate?.(4)
                    setJourChoisi(j.date)
                  }}
                  aria-pressed={actif}
                  className={`min-w-[86px] shrink-0 rounded-xl p-2 text-center shadow-carte
                    ${actif ? 'bg-encre text-fond' : 'bg-fond-eleve text-encre'}`}
                >
                  <span className={`block text-legende ${actif ? 'text-fond' : 'text-encre-3'}`}>{jourCourt(j.date)}</span>
                  <span className="block text-[22px] leading-tight" aria-hidden="true">{iconeMeteo(j.code)}</span>
                  <span className="chiffres block text-corps-2 font-[590]">
                    {j.tMin}–{j.tMax}°
                  </span>
                  <span className={`block text-legende ${actif ? 'text-fond' : 'text-encre-3'}`}>
                    {j.pluieMm >= 0.5 ? `${j.pluieMm.toFixed(1).replace('.', ',')} mm` : `${j.probaPluie}%`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Le résumé du jour choisi. */}
        {jour && (
          <Carte>
            <p className="text-corps-2 font-[590] text-encre">
              {iconeMeteo(jour.code)} {jourLisible(jour.date)}
            </p>
            <div className="mt-1 flex flex-col gap-0.5 text-legende text-encre-2">
              <p>
                🌡 {jour.tMin}° la nuit · {jour.tMax}° l’après-midi
              </p>
              <p>
                💧 {totalPluie >= 0.1 ? `${totalPluie.toFixed(1).replace('.', ',')} mm attendus` : 'pas de pluie prévue'} ·
                risque {jour.probaPluie}%
              </p>
              <p>
                💨 rafales jusqu’à <span className="chiffres">{enNoeuds(ventMax)}</span> nœuds (
                <span className="chiffres">{ventMax}</span> km/h)
              </p>
              <p>
                ☀️ UV {jour.uvMax} ({libelleUv(jour.uvMax)}) · lever {jour.lever} · coucher {jour.coucher}
              </p>
            </div>
          </Carte>
        )}

        {/* ⛵ Le tableau heure par heure, façon Windfinder. */}
        {heuresDuJour.length > 0 && (
          <div>
            <p className="mb-1 text-corps-2 font-[590] text-encre">Heure par heure</p>
            <div className="overflow-x-auto rounded-xl bg-fond-eleve p-2 shadow-carte">
              <table className="w-full min-w-[560px] border-collapse text-legende">
                <thead>
                  <tr className="text-encre-3">
                    <th className="p-1 text-left font-[590]">h</th>
                    <th className="p-1 font-[590]">ciel</th>
                    <th className="p-1 font-[590]">°C</th>
                    <th className="p-1 font-[590]">ressenti</th>
                    <th className="p-1 font-[590]">pluie</th>
                    <th className="p-1 font-[590]">risque</th>
                    <th className="p-1 font-[590]">vent kt</th>
                    <th className="p-1 font-[590]">rafales</th>
                    <th className="p-1 font-[590]">dir.</th>
                    <th className="p-1 font-[590]">hum.</th>
                    <th className="p-1 font-[590]">nuages</th>
                    <th className="p-1 font-[590]">hPa</th>
                  </tr>
                </thead>
                <tbody>
                  {heuresDuJour.map((h) => {
                    const noeuds = enNoeuds(h.vent)
                    return (
                      <tr key={h.quand} className={h.jour ? '' : 'opacity-70'}>
                        <td className="chiffres p-1 font-[590] text-encre">{h.quand.slice(11, 16)}</td>
                        <td className="p-1 text-center" aria-hidden="true">{iconeMeteo(h.code)}</td>
                        <td className="chiffres p-1 text-center text-encre">{h.t}°</td>
                        <td className="chiffres p-1 text-center text-encre-3">{h.ressenti}°</td>
                        <td className="chiffres p-1 text-center text-encre-2">
                          {h.pluie >= 0.1 ? h.pluie.toFixed(1).replace('.', ',') : '—'}
                        </td>
                        <td className="chiffres p-1 text-center text-encre-3">{h.probaPluie}%</td>
                        <td className="p-1 text-center">
                          <span
                            className="chiffres inline-block min-w-[26px] rounded px-1 font-[590] text-encre"
                            style={{ background: couleurVent(noeuds) }}
                          >
                            {noeuds}
                          </span>
                        </td>
                        <td className="chiffres p-1 text-center text-encre-2">{enNoeuds(h.rafales)}</td>
                        <td className="p-1 text-center text-encre-2">
                          <span
                            aria-hidden="true"
                            className="inline-block"
                            // La flèche montre où VA le vent : la direction
                            // donnée est celle d'où il vient, d'où le +180°.
                            style={{ transform: `rotate(${h.direction + 180}deg)` }}
                          >
                            ↑
                          </span>{' '}
                          {cardinal(h.direction)}
                        </td>
                        <td className="chiffres p-1 text-center text-encre-3">{h.humidite}%</td>
                        <td className="chiffres p-1 text-center text-encre-3">{h.nuages}%</td>
                        <td className="chiffres p-1 text-center text-encre-3">{h.pression}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-legende text-encre-3">
              Vent en nœuds, couleur selon la force (comme Windfinder). Les heures de nuit sont grisées. Fais glisser le
              tableau vers la gauche pour voir toutes les colonnes.
            </p>
          </div>
        )}

        {/* 🌊 La mer, quand on est près des côtes. */}
        {aDeLaMer && (
          <div>
            <p className="mb-1 text-corps-2 font-[590] text-encre">🌊 La mer</p>
            <div className="overflow-x-auto rounded-xl bg-fond-eleve p-2 shadow-carte">
              <table className="w-full min-w-[320px] border-collapse text-legende">
                <thead>
                  <tr className="text-encre-3">
                    <th className="p-1 text-left font-[590]">h</th>
                    <th className="p-1 font-[590]">vagues</th>
                    <th className="p-1 font-[590]">période</th>
                    <th className="p-1 font-[590]">eau</th>
                  </tr>
                </thead>
                <tbody>
                  {merDuJour
                    .filter((_, i) => i % 3 === 0)
                    .map((m) => (
                      <tr key={m.quand}>
                        <td className="chiffres p-1 font-[590] text-encre">{m.quand.slice(11, 16)}</td>
                        <td className="p-1 text-center">
                          {m.vagues === null ? (
                            <span className="text-encre-3">—</span>
                          ) : (
                            <span
                              className="chiffres inline-block min-w-[38px] rounded px-1 font-[590] text-encre"
                              style={{ background: couleurVagues(m.vagues) }}
                            >
                              {m.vagues.toFixed(1).replace('.', ',')} m
                            </span>
                          )}
                        </td>
                        <td className="chiffres p-1 text-center text-encre-2">
                          {m.periode === null ? '—' : `${Math.round(m.periode)} s`}
                        </td>
                        <td className="chiffres p-1 text-center text-encre-2">
                          {m.eau === null ? '—' : `${Math.round(m.eau)}°`}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
