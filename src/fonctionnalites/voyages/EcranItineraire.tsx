// 🗺 L'itinéraire du voyage : le trajet calculé avec le trafic du moment
// (durée, bouchons, péages), les routes alternatives quand il y en a, et tous
// les arrêts utiles semés le long du chemin (aires, essence, gonflage, eau,
// curiosités) — épinglés sur la carte et filtrables d'un doigt.
//
// L'écran est AUTONOME : il lit les points du trajet dans l'adresse
// (?points=lat,lon;lat,lon) et appelle le relais lui-même. Il accepte aussi
// les mêmes points passés par l'état de navigation, pour un départ instantané.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LayerGroup, Map as CarteLeaflet, Marker } from 'leaflet'
import { supabase } from '@/lib/supabase'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

// Le module Leaflet arrive en import paresseux : on garde son type sous la
// main pour pouvoir le ranger dans une référence entre deux effets.
type Leaflet = typeof import('leaflet')

interface Point {
  lat: number
  lon: number
}

interface Itineraire {
  minutes: number
  minutesSansTrafic: number
  bouchonsMin: number
  km: number
  kmPeage: number
  geometrie: [number, number][]
}

type TypeLieu = 'aire' | 'essence' | 'gonflage' | 'curiosite' | 'eau'

interface LieuRoute {
  nom: string
  type: TypeLieu
  lat: number
  lon: number
}

// Les familles d'arrêts, dans l'ordre où on les cherche pendant un trajet.
const TYPES_LIEU: { cle: TypeLieu; emoji: string; libelle: string }[] = [
  { cle: 'aire', emoji: '🅿️', libelle: 'Aires' },
  { cle: 'essence', emoji: '⛽', libelle: 'Essence' },
  { cle: 'gonflage', emoji: '🛞', libelle: 'Gonflage' },
  { cle: 'eau', emoji: '🚰', libelle: 'Eau' },
  { cle: 'curiosite', emoji: '📸', libelle: 'Curiosités' },
]

const emojiDe = (t: TypeLieu): string => TYPES_LIEU.find((x) => x.cle === t)?.emoji ?? '📍'
const libelleDe = (t: TypeLieu): string => TYPES_LIEU.find((x) => x.cle === t)?.libelle ?? 'Arrêt'

// ——————————————————————— Lecture des points du trajet ———————————————————————

/** Une coordonnée n'est retenue que si elle est vraiment sur Terre. */
const pointSur = (lat: unknown, lon: unknown): Point | null => {
  const la = typeof lat === 'number' ? lat : Number(lat)
  const lo = typeof lon === 'number' ? lon : Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null
  return { lat: la, lon: lo }
}

/** « 48.85,2.35;45.76,4.83 » → la liste ordonnée départ → étapes → arrivée. */
const lirePointsUrl = (brut: string | null): Point[] => {
  if (!brut) return []
  const points: Point[] = []
  for (const morceau of brut.split(';')) {
    const [la, lo] = morceau.split(',')
    const p = pointSur(la, lo)
    if (p) points.push(p)
  }
  return points
}

/** Les mêmes points, mais passés par l'état de navigation (départ instantané). */
const lirePointsEtat = (etat: unknown): Point[] => {
  if (!etat || typeof etat !== 'object') return []
  const brut = (etat as { points?: unknown }).points
  if (!Array.isArray(brut)) return []
  const points: Point[] = []
  for (const e of brut) {
    if (!e || typeof e !== 'object') continue
    const p = pointSur((e as Point).lat, (e as Point).lon)
    if (p) points.push(p)
  }
  return points
}

/** Les étiquettes facultatives (« Maison;Aire de Beaune;L'hôtel »). */
const lireNoms = (brut: string | null): string[] =>
  brut ? brut.split(';').map((n) => n.trim()) : []

// ——————————————————————— Remise en forme des réponses ———————————————————————

const nombreOuZero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

/** Le relais peut renvoyer des champs manquants ou en texte : on ne garde
 *  qu'un itinéraire réellement traçable, sinon on l'ignore. */
const itineraireSur = (brut: unknown): Itineraire | null => {
  if (!brut || typeof brut !== 'object') return null
  const i = brut as Record<string, unknown>
  const geometrie: [number, number][] = []
  for (const paire of Array.isArray(i['geometrie']) ? (i['geometrie'] as unknown[]) : []) {
    if (!Array.isArray(paire)) continue
    const p = pointSur(paire[0], paire[1])
    if (p) geometrie.push([p.lat, p.lon])
  }
  if (geometrie.length < 2) return null
  const minutes = nombreOuZero(i['minutes'])
  const sansTrafic = nombreOuZero(i['minutesSansTrafic'])
  return {
    minutes,
    minutesSansTrafic: sansTrafic || minutes,
    // Si le serveur ne chiffre pas les bouchons, on les déduit de l'écart.
    bouchonsMin: i['bouchonsMin'] !== undefined ? nombreOuZero(i['bouchonsMin']) : Math.max(0, Math.round(minutes - sansTrafic)),
    km: nombreOuZero(i['km']),
    kmPeage: nombreOuZero(i['kmPeage']),
    geometrie,
  }
}

const lieuSur = (brut: unknown): LieuRoute | null => {
  if (!brut || typeof brut !== 'object') return null
  const l = brut as Record<string, unknown>
  const p = pointSur(l['lat'], l['lon'])
  if (!p) return null
  const type = String(l['type'] ?? '')
  return {
    nom: String(l['nom'] ?? 'Arrêt'),
    type: (TYPES_LIEU.some((t) => t.cle === type) ? type : 'aire') as TypeLieu,
    lat: p.lat,
    lon: p.lon,
  }
}

// ——————————————————————————— Petits formatages ———————————————————————————

/** 72 → « 1 h 12 » ; 48 → « 48 min ». */
const dureeLisible = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}

/** Vert quand ça roule, ambre dès 5 min perdues, rouge à partir d'un quart d'heure. */
const couleurBouchons = (min: number): string =>
  min >= 15 ? 'text-urgent' : min >= 5 ? 'text-ambre' : 'text-fait'

/** Le tracé complet fait des milliers de points : le serveur n'en veut que 25,
 *  régulièrement espacés, premier et dernier compris. */
const echantillonner = (trace: [number, number][], maximum = 25): [number, number][] => {
  if (trace.length <= maximum) return trace
  const pas = (trace.length - 1) / (maximum - 1)
  const echantillon: [number, number][] = []
  for (let i = 0; i < maximum; i++) {
    const p = trace[Math.round(i * pas)]
    if (p) echantillon.push(p)
  }
  return echantillon
}

/** Les noms viennent du serveur : jamais injectés bruts dans une bulle Leaflet. */
const echapper = (texte: string): string =>
  texte.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** L'appel au relais de STG — même porte que les restaurants et les crues. */
const appelerRelais = async (corps: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const { data: session } = await supabase.auth.getSession()
  const reponse = await fetch('/api/chercher-resto', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(corps),
  })
  if (!reponse.ok) throw new Error(`relais ${reponse.status}`)
  return (await reponse.json()) as Record<string, unknown>
}

// ———————————————————————————————— L'écran ————————————————————————————————

export function EcranItineraire() {
  const { id } = useParams()
  const [parametres] = useSearchParams()
  const emplacement = useLocation()

  const brutPoints = parametres.get('points')
  const brutNoms = parametres.get('noms')
  const etatNavigation = emplacement.state as unknown

  // Les points de l'adresse font foi ; l'état de navigation prend le relais
  // quand l'écran a été ouvert sans adresse détaillée.
  const points = useMemo(() => {
    const parUrl = lirePointsUrl(brutPoints)
    return parUrl.length >= 2 ? parUrl : lirePointsEtat(etatNavigation)
  }, [brutPoints, etatNavigation])
  const noms = useMemo(() => lireNoms(brutNoms), [brutNoms])

  const clePoints = points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';')

  const [indexChoisi, setIndexChoisi] = useState(0)
  const [typesActifs, setTypesActifs] = useState<Set<TypeLieu>>(() => new Set(TYPES_LIEU.map((t) => t.cle)))

  // ——— 1. Le calcul de l'itinéraire (TomTom, via le relais) ———
  const calcul = useQuery({
    queryKey: ['itineraire', clePoints],
    enabled: points.length >= 2,
    staleTime: 5 * 60 * 1000, // le trafic bouge : 5 minutes, pas plus
    queryFn: async (): Promise<{ liste: Itineraire[]; cleAbsente: boolean }> => {
      const donnees = await appelerRelais({ mode: 'itineraire', points: points.map((p) => ({ lat: p.lat, lon: p.lon })) })
      // La clé TomTom manquante n'est pas une panne : c'est une consigne
      // d'installation, montrée telle quelle à la famille.
      if (donnees['erreur'] === 'cle_absente') return { liste: [], cleAbsente: true }
      if (donnees['erreur']) throw new Error(String(donnees['erreur']))
      const liste = (Array.isArray(donnees['itineraires']) ? (donnees['itineraires'] as unknown[]) : [])
        .map(itineraireSur)
        .filter((i): i is Itineraire => i !== null)
      if (liste.length === 0) throw new Error('aucun itinéraire traçable')
      return { liste, cleAbsente: false }
    },
  })

  const itineraires = calcul.data?.liste ?? []
  // Le premier est le plus rapide maintenant ; un vieil index ne doit pas
  // pointer dans le vide après un recalcul.
  const choisi = itineraires[indexChoisi] ?? itineraires[0] ?? null

  // ——— 2. Les arrêts utiles le long du tracé choisi ———
  const trace = choisi?.geometrie ?? []
  const cleTrace = trace.length > 0 ? `${clePoints}#${indexChoisi}#${trace.length}` : ''

  const arrets = useQuery({
    queryKey: ['itineraire-poi', cleTrace],
    enabled: cleTrace !== '',
    staleTime: 60 * 60 * 1000, // une aire d'autoroute ne déménage pas
    queryFn: async (): Promise<LieuRoute[]> => {
      const donnees = await appelerRelais({ mode: 'poi_route', trace: echantillonner(trace) })
      if (donnees['erreur']) throw new Error(String(donnees['erreur']))
      return (Array.isArray(donnees['lieux']) ? (donnees['lieux'] as unknown[]) : [])
        .map(lieuSur)
        .filter((l): l is LieuRoute => l !== null)
    },
  })

  const lieux = useMemo(() => arrets.data ?? [], [arrets.data])
  // La raison exacte quand aucun arrêt ne remonte — précieux pour corriger.
  const diagnosticArrets = arrets.error instanceof Error ? arrets.error.message : ''
  const lieuxVisibles = useMemo(() => lieux.filter((l) => typesActifs.has(l.type)), [lieux, typesActifs])

  // ——— 3. La carte : créée UNE fois, nourrie ensuite par deux effets ———
  const conteneur = useRef<HTMLDivElement>(null)
  const refL = useRef<Leaflet | null>(null)
  const refCarte = useRef<CarteLeaflet | null>(null)
  const refTrace = useRef<LayerGroup | null>(null)
  const refArrets = useRef<LayerGroup | null>(null)
  const refMarqueurs = useRef<Map<string, Marker>>(new Map())
  const [cartePrete, setCartePrete] = useState(false)

  useEffect(() => {
    let carte: CarteLeaflet | null = null
    let annule = false
    void (async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (annule || !conteneur.current) return
      carte = L.map(conteneur.current, { zoomControl: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(carte)
      carte.setView([46.6, 2.4], 5)
      refL.current = L
      refCarte.current = carte
      refTrace.current = L.layerGroup().addTo(carte)
      refArrets.current = L.layerGroup().addTo(carte)
      setCartePrete(true)
    })()
    // Démontage : la carte Leaflet est démolie proprement, sinon elle
    // continue d'écouter le redimensionnement de la fenêtre (fuite).
    return () => {
      annule = true
      refMarqueurs.current.clear()
      refTrace.current = null
      refArrets.current = null
      refCarte.current = null
      refL.current = null
      setCartePrete(false)
      carte?.remove()
    }
  }, [])

  // Le tracé + les bornes du voyage : redessinés à chaque changement de route.
  useEffect(() => {
    const L = refL.current
    const carte = refCarte.current
    const calque = refTrace.current
    if (!cartePrete || !L || !carte || !calque || !choisi) return
    calque.clearLayers()

    L.polyline(choisi.geometrie, {
      color: '#4a6fa5',
      weight: 7,
      opacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(calque)

    const borne = (p: Point, html: string, taille: number, bulle: string) =>
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-size:${taille}px;line-height:1;filter:drop-shadow(0 2px 3px rgb(0 0 0/.4))">${html}</div>`,
          iconSize: [taille, taille],
          iconAnchor: [taille / 2, taille - 2],
        }),
      })
        .addTo(calque)
        .bindPopup(bulle)

    points.forEach((p, i) => {
      const nom = noms[i]?.trim()
      if (i === 0) borne(p, '🏠', 28, echapper(nom || 'Départ'))
      else if (i === points.length - 1) borne(p, '🎯', 28, echapper(nom || 'Arrivée'))
      // Les étapes intermédiaires ne s'affichent que s'il y en a vraiment.
      else borne(p, String(i), 22, echapper(nom || `Étape ${i}`))
    })

    carte.fitBounds(choisi.geometrie, { padding: [36, 36] })
  }, [cartePrete, choisi, points, noms])

  // Les arrêts : recalqués seuls quand on touche aux filtres — la vue de la
  // carte ne bouge pas, on ne perd pas son zoom.
  useEffect(() => {
    const L = refL.current
    const calque = refArrets.current
    if (!cartePrete || !L || !calque) return
    calque.clearLayers()
    refMarqueurs.current.clear()
    for (const lieu of lieuxVisibles) {
      const marqueur = L.marker([lieu.lat, lieu.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 1px 2px rgb(0 0 0/.35))">${emojiDe(lieu.type)}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 18],
        }),
      })
        .addTo(calque)
        .bindPopup(
          `<strong>${echapper(lieu.nom)}</strong><br>${libelleDe(lieu.type)}<br>` +
            `<a href="https://maps.apple.com/?daddr=${lieu.lat},${lieu.lon}" target="_blank" rel="noopener">🧭 Y aller</a>`,
        )
      refMarqueurs.current.set(`${lieu.lat},${lieu.lon},${lieu.nom}`, marqueur)
    }
  }, [cartePrete, lieuxVisibles])

  /** Un appui dans la liste recentre la carte sur l'arrêt et ouvre sa bulle. */
  const centrerSur = (lieu: LieuRoute) => {
    navigator.vibrate?.(4)
    refCarte.current?.setView([lieu.lat, lieu.lon], 15)
    refMarqueurs.current.get(`${lieu.lat},${lieu.lon},${lieu.nom}`)?.openPopup()
  }

  const basculerType = (t: TypeLieu) => {
    navigator.vibrate?.(4)
    setTypesActifs((actifs) => {
      const suivant = new Set(actifs)
      if (suivant.has(t)) suivant.delete(t)
      else suivant.add(t)
      return suivant
    })
  }

  return (
    <div className="pb-6">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour vers={id ? `/nous/voyages/${id}` : undefined} />
        <h1 className="text-titre-2 text-encre">🗺 L’itinéraire</h1>
        {choisi ? (
          <p className="text-corps-2 text-encre-2">
            <span className="chiffres font-[590] text-encre">{dureeLisible(choisi.minutes)}</span>
            {' · '}
            <span className="chiffres">{Math.round(choisi.km)} km</span>
            {' · '}
            <span className={`chiffres font-[590] ${couleurBouchons(choisi.bouchonsMin)}`}>
              {choisi.bouchonsMin >= 1 ? `+${Math.round(choisi.bouchonsMin)} min de bouchons` : 'ça roule'}
            </span>
            {choisi.kmPeage > 0 && <span className="chiffres text-encre-3">{` · ${Math.round(choisi.kmPeage)} km de péage`}</span>}
          </p>
        ) : (
          <p className="text-legende text-encre-3">Trajet, trafic en direct et arrêts utiles sur la route.</p>
        )}
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {/* Aucun point : l'écran a été ouvert tout seul, on explique par où passer. */}
        {points.length < 2 && (
          <EtatVide
            titre="Quel trajet ?"
            message="Lance l’itinéraire depuis la fiche du voyage : c’est elle qui connaît le départ, les étapes et l’arrivée."
          />
        )}

        {points.length >= 2 && calcul.isLoading && (
          <p className="py-6 text-center text-corps-2 text-encre-3">🗺 Calcul de l’itinéraire…</p>
        )}

        {/* La clé TomTom manque : trois lignes, une fois, et l'écran s'allume pour toujours. */}
        {calcul.data?.cleAbsente && (
          <Carte>
            <p className="text-corps-2 font-[590] text-encre">🔑 Une clé gratuite est nécessaire (2 minutes, une fois)</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-corps-2 text-encre-2">
              <li>Crée un compte gratuit sur <strong>developer.tomtom.com</strong> — la clé s’affiche aussitôt.</li>
              <li>Dans <strong>Vercel → ton projet → Settings → Environment Variables</strong>, ajoute <strong>TOMTOM_KEY</strong> avec cette clé.</li>
              <li>« Redeploy », et l’itinéraire se calcule tout seul à chaque départ.</li>
            </ol>
          </Carte>
        )}

        {calcul.isError && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-corps-2 text-encre-3">
              L’itinéraire n’a pas pu être calculé.
              <br />
              <span className="text-legende">
                Diagnostic pour STG :{' '}
                {String(calcul.error instanceof Error ? calcul.error.message : calcul.error).slice(0, 90)}
              </span>
            </p>
            <Bouton pleineLargeur variante="primaire" onClick={() => void calcul.refetch()}>
              🔄 Réessayer
            </Bouton>
          </div>
        )}

        {/* Plusieurs routes possibles : on laisse le choix, la carte suit. */}
        {itineraires.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {itineraires.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  navigator.vibrate?.(4)
                  setIndexChoisi(i)
                }}
                aria-pressed={i === indexChoisi}
                className={`min-h-sur-tactile shrink-0 rounded-full px-4 text-note font-[590]
                  ${i === indexChoisi ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {i === 0 ? 'Le plus rapide' : 'Alternative'} · {dureeLisible(it.minutes)}{' '}
                {it.bouchonsMin >= 1 ? `(+${Math.round(it.bouchonsMin)} min)` : '(fluide)'}
              </button>
            ))}
          </div>
        )}

        {/* La carte reste montée en permanence : Leaflet déteste naître et mourir. */}
        <div className={points.length >= 2 ? 'overflow-hidden rounded-xl shadow-carte' : 'hidden'}>
          <div ref={conteneur} style={{ height: '60vh' }} aria-label="Carte de l’itinéraire" />
        </div>

        {choisi && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TYPES_LIEU.map((t) => {
                const nombre = lieux.filter((l) => l.type === t.cle).length
                return (
                  <button
                    key={t.cle}
                    onClick={() => basculerType(t.cle)}
                    aria-pressed={typesActifs.has(t.cle)}
                    className={`min-h-sur-tactile shrink-0 rounded-full px-3 text-note font-[590]
                      ${typesActifs.has(t.cle) ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
                  >
                    {t.emoji} {t.libelle}
                    {nombre > 0 ? ` (${nombre})` : ''}
                  </button>
                )
              })}
            </div>

            {arrets.isLoading && (
              <p className="text-center text-legende text-encre-3">🔎 Recherche des arrêts sur la route…</p>
            )}
            {arrets.isError && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-legende text-encre-3">
                  Les arrêts n’ont pas pu être cherchés — l’itinéraire, lui, reste bon.
                  {diagnosticArrets ? (
                    <>
                      <br />
                      <span>Diagnostic pour STG : {diagnosticArrets.slice(0, 90)}</span>
                    </>
                  ) : null}
                </p>
                <Bouton variante="discret" onClick={() => void arrets.refetch()}>🔄 Réessayer</Bouton>
              </div>
            )}
            {!arrets.isLoading && !arrets.isError && lieux.length === 0 && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-legende text-encre-3">
                  Aucun arrêt repéré pour l’instant — la carte des routes (OpenStreetMap) répond parfois lentement.
                  {diagnosticArrets ? (
                    <>
                      <br />
                      <span>Diagnostic pour STG : {diagnosticArrets.slice(0, 90)}</span>
                    </>
                  ) : null}
                </p>
                <Bouton variante="discret" onClick={() => void arrets.refetch()}>🔄 Chercher à nouveau</Bouton>
              </div>
            )}

            <ul className="flex flex-col gap-2">
              {lieuxVisibles.map((l, i) => (
                <li key={`${l.lat}-${l.lon}-${i}`}>
                  <button
                    onClick={() => centrerSur(l)}
                    className="flex w-full items-center gap-3 rounded-xl bg-fond-eleve p-3 text-left shadow-carte active:bg-fond-sourd"
                  >
                    <span aria-hidden="true" className="text-[22px]">{emojiDe(l.type)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-corps-2 font-[590] leading-snug text-encre">{l.nom}</span>
                      <span className="block text-legende text-encre-3">{libelleDe(l.type)}</span>
                    </span>
                    <span aria-hidden="true" className="text-encre-3">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
