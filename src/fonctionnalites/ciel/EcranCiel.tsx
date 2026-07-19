// 🌌 Ce soir on lève les yeux : la lune de ce soir, le coucher du soleil,
// la Station spatiale internationale suivie EN DIRECT (est-elle près de chez
// vous ?), et les pluies d'étoiles filantes à ne pas rater — magique avec
// Gabriel.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { villeMeteo, previsions, iconeMeteo } from '@/lib/meteo'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Carte } from '@/design/composants/Carte'

// Phase de lune calculée localement (cycle synodique 29,53 j, réf. 2000-01-06).
function phaseLune(date = new Date()): { nom: string; emoji: string; illumination: number } {
  const synodique = 29.53058867
  const reference = Date.UTC(2000, 0, 6, 18, 14)
  const jours = ((date.getTime() - reference) / 86400000) % synodique
  const phase = jours / synodique
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * phase)) * 50)
  const PHASES: [number, string, string][] = [
    [0.03, 'Nouvelle lune', '🌑'],
    [0.22, 'Premier croissant', '🌒'],
    [0.28, 'Premier quartier', '🌓'],
    [0.47, 'Lune gibbeuse', '🌔'],
    [0.53, 'PLEINE LUNE', '🌕'],
    [0.72, 'Lune décroissante', '🌖'],
    [0.78, 'Dernier quartier', '🌗'],
    [0.97, 'Dernier croissant', '🌘'],
    [1.01, 'Nouvelle lune', '🌑'],
  ]
  const trouvee = PHASES.find(([seuil]) => phase <= seuil) ?? PHASES[0]!
  return { nom: trouvee[1], emoji: trouvee[2], illumination }
}

// Les grandes pluies d'étoiles filantes (dates stables d'année en année).
const PLUIES: { nom: string; debut: [number, number]; pic: [number, number]; fin: [number, number]; taux: number }[] = [
  { nom: 'Quadrantides', debut: [1, 1], pic: [1, 3], fin: [1, 10], taux: 80 },
  { nom: 'Lyrides', debut: [4, 16], pic: [4, 22], fin: [4, 25], taux: 18 },
  { nom: 'Êta aquarides', debut: [4, 19], pic: [5, 6], fin: [5, 28], taux: 50 },
  { nom: 'Perséides ⭐', debut: [7, 17], pic: [8, 12], fin: [8, 24], taux: 100 },
  { nom: 'Orionides', debut: [10, 2], pic: [10, 21], fin: [11, 7], taux: 20 },
  { nom: 'Léonides', debut: [11, 6], pic: [11, 17], fin: [11, 30], taux: 15 },
  { nom: 'Géminides ⭐', debut: [12, 4], pic: [12, 14], fin: [12, 17], taux: 120 },
]

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

// Étoiles fixes du fond (déterministes — pas de scintillement au re-rendu).
const ETOILES = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 97) % 220,
  y: (i * 53) % 220,
  r: 0.6 + ((i * 7) % 10) / 10,
}))

/** Le globe vu depuis la Station : la Terre tourne sous elle, dessinée
 *  localement en SVG — AUCUN chargement, l'image est là instantanément. */
function GlobeIss({ lat, lon, maison }: { lat: number; lon: number; maison: { nom: string; lat: number; lon: number } | null }) {
  const R = 88
  const CX = 110
  const CY = 110
  const rad = (d: number) => (d * Math.PI) / 180
  const p0 = rad(lat)
  const l0 = rad(lon)

  // Projection orthographique centrée sur la Station.
  const projeter = (latP: number, lonP: number): { x: number; y: number; visible: boolean } => {
    const p = rad(latP)
    const l = rad(lonP)
    const cosC = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0)
    return {
      x: CX + R * Math.cos(p) * Math.sin(l - l0),
      y: CY - R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0)),
      visible: cosC > 0.02,
    }
  }

  // La grille terrestre : parallèles et méridiens, coupés côté invisible.
  const chemins: string[] = []
  const tracer = (points: { x: number; y: number; visible: boolean }[]) => {
    let d = ''
    let dansSegment = false
    for (const pt of points) {
      if (pt.visible) {
        d += `${dansSegment ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
        dansSegment = true
      } else dansSegment = false
    }
    if (d) chemins.push(d)
  }
  for (let latG = -60; latG <= 60; latG += 30)
    tracer(Array.from({ length: 73 }, (_, i) => projeter(latG, -180 + i * 5)))
  for (let lonG = -180; lonG < 180; lonG += 30)
    tracer(Array.from({ length: 37 }, (_, i) => projeter(-90 + i * 5, lonG)))

  const chezNous = maison ? projeter(maison.lat, maison.lon) : null

  return (
    <svg viewBox="0 0 220 220" className="mx-auto block h-56 w-56" aria-label="La Terre vue depuis la Station spatiale">
      <defs>
        <radialGradient id="ciel-fond" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#101b33" />
          <stop offset="100%" stopColor="#05070f" />
        </radialGradient>
        <radialGradient id="terre" cx="42%" cy="38%">
          <stop offset="0%" stopColor="#3f6ea8" />
          <stop offset="70%" stopColor="#1d3a63" />
          <stop offset="100%" stopColor="#0e1f3a" />
        </radialGradient>
      </defs>
      <rect width="220" height="220" rx="16" fill="url(#ciel-fond)" />
      {ETOILES.map((e, i) => (
        <circle key={i} cx={e.x} cy={e.y} r={e.r} fill="#e8ecf7" opacity={0.4 + (i % 3) * 0.2} />
      ))}
      <circle cx={CX} cy={CY} r={R} fill="url(#terre)" stroke="#7d9cc8" strokeWidth="1" />
      {chemins.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#89a7d0" strokeWidth="0.5" opacity="0.55" />
      ))}
      {chezNous?.visible && (
        <g>
          <circle cx={chezNous.x} cy={chezNous.y} r="4" fill="#e35d5d" stroke="#fff" strokeWidth="1.2" />
          <text x={chezNous.x} y={chezNous.y - 7} textAnchor="middle" fontSize="9" fill="#ffd9d9" fontWeight="700">
            {maison?.nom}
          </text>
        </g>
      )}
      {/* La Station, toujours au centre : c'est elle qui regarde la Terre. */}
      <circle cx={CX} cy={CY} r="7" fill="#fff" opacity="0.15">
        <animate attributeName="r" values="7;13;7" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.25;0.05;0.25" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <text x={CX} y={CY + 5} textAnchor="middle" fontSize="16">🛰</text>
    </svg>
  )
}

const CLE_ISS = 'stg-iss-derniere'

export function EcranCiel() {
  const lune = phaseLune()
  const ville = villeMeteo()
  // Affichage INSTANTANÉ, image comprise : on repart de la dernière position
  // mémorisée et de sa vitesse, et on fait AVANCER la Station localement chaque
  // seconde (extrapolation) — le globe bouge dès l'ouverture, sans réseau.
  // Le direct ne fait ensuite qu'affiner la trajectoire.
  const [iss, setIss] = useState<{ lat: number; lon: number; km: number | null; direct: boolean } | null>(() => {
    try {
      const memo = JSON.parse(localStorage.getItem(CLE_ISS) ?? 'null') as {
        lat: number
        lon: number
        vlat?: number
        vlon?: number
        a?: number
      } | null
      if (!memo) return null
      // On projette la position mémorisée jusqu'à MAINTENANT (max 45 min).
      const ecartS = memo.a ? Math.min((Date.now() - memo.a) / 1000, 2700) : 0
      const lat = Math.max(-51.6, Math.min(51.6, memo.lat + (memo.vlat ?? 0) * ecartS))
      const lon = (((memo.lon + (memo.vlon ?? -0.06) * ecartS) + 540) % 360) - 180
      return {
        lat,
        lon,
        km: ville ? distanceKm(ville.latitude, ville.longitude, lat, lon) : null,
        direct: false,
      }
    } catch {
      return null
    }
  })

  // La Station spatiale : direct toutes les 8 s (coupure 4 s) + avance locale
  // chaque seconde entre deux réponses — le mouvement ne s'arrête jamais.
  useEffect(() => {
    let arret = false
    let derniere: { lat: number; lon: number; a: number } | null = null
    let vitesse = { vlat: 0, vlon: -0.06 } // valeurs typiques en attendant le direct

    const suivre = async () => {
      const coupure = new AbortController()
      const minuteurCoupure = setTimeout(() => coupure.abort(), 4000)
      try {
        const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544', { signal: coupure.signal })
        if (!r.ok) return
        const d = (await r.json()) as { latitude: number; longitude: number }
        if (arret) return
        if (derniere) {
          const dt = (Date.now() - derniere.a) / 1000
          if (dt > 2) {
            let dLon = d.longitude - derniere.lon
            if (dLon > 180) dLon -= 360
            if (dLon < -180) dLon += 360
            vitesse = { vlat: (d.latitude - derniere.lat) / dt, vlon: dLon / dt }
          }
        }
        derniere = { lat: d.latitude, lon: d.longitude, a: Date.now() }
        localStorage.setItem(CLE_ISS, JSON.stringify({ lat: d.latitude, lon: d.longitude, ...vitesse, a: Date.now() }))
        setIss({
          lat: d.latitude,
          lon: d.longitude,
          km: ville ? distanceKm(ville.latitude, ville.longitude, d.latitude, d.longitude) : null,
          direct: true,
        })
      } catch {
        // le satellite repassera — l'extrapolation locale continue de bouger
      } finally {
        clearTimeout(minuteurCoupure)
      }
    }

    // Chaque seconde : la Station avance toute seule (8 km/s, ça se voit !).
    const avancer = () => {
      setIss((actuel) => {
        if (!actuel) return actuel
        const base = derniere ?? { lat: actuel.lat, lon: actuel.lon, a: Date.now() - 1000 }
        const ecartS = (Date.now() - base.a) / 1000
        const lat = Math.max(-51.6, Math.min(51.6, base.lat + vitesse.vlat * ecartS))
        const lon = (((base.lon + vitesse.vlon * ecartS) + 540) % 360) - 180
        return {
          lat,
          lon,
          km: ville ? distanceKm(ville.latitude, ville.longitude, lat, lon) : null,
          direct: actuel.direct,
        }
      })
    }

    void suivre()
    const minuteurDirect = window.setInterval(() => void suivre(), 8000)
    const minuteurLocal = window.setInterval(avancer, 1000)
    return () => {
      arret = true
      window.clearInterval(minuteurDirect)
      window.clearInterval(minuteurLocal)
    }
  }, [ville?.nom])

  const soleil = useQuery({
    queryKey: ['ciel-soleil', ville?.nom],
    enabled: ville !== null,
    queryFn: async () => {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${ville?.latitude}&longitude=${ville?.longitude}` +
          `&daily=sunrise,sunset&timezone=Europe%2FParis&forecast_days=1`,
      )
      if (!r.ok) return null
      const d = (await r.json()) as { daily?: { sunrise?: string[]; sunset?: string[] } }
      return {
        lever: d.daily?.sunrise?.[0]?.slice(11) ?? null,
        coucher: d.daily?.sunset?.[0]?.slice(11) ?? null,
      }
    },
  })

  const meteoSoir = useQuery({ queryKey: ['ciel-meteo'], queryFn: () => previsions().catch(() => []) })
  const cielDegage = (meteoSoir.data?.[0]?.probaPluie ?? 100) < 30

  const maintenant = new Date()
  const annee = maintenant.getFullYear()
  const versDate = ([m, j]: [number, number]) => new Date(annee, m - 1, j)
  const pluiesActives = PLUIES.filter((p) => maintenant >= versDate(p.debut) && maintenant <= versDate(p.fin))
  const prochaine = PLUIES.map((p) => ({ ...p, quand: versDate(p.pic) < maintenant ? new Date(annee + 1, p.pic[0] - 1, p.pic[1]) : versDate(p.pic) }))
    .sort((a, b) => a.quand.getTime() - b.quand.getTime())[0]

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🌌 Ce soir, on lève les yeux</h1>
        <p className="text-legende text-encre-3">Le ciel au-dessus de la maison, en direct.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Carte>
          <div className="flex items-center gap-4">
            <span className="text-[52px] leading-none" aria-hidden="true">{lune.emoji}</span>
            <div>
              <p className="text-corps font-[590] text-encre">{lune.nom}</p>
              <p className="text-legende text-encre-3">éclairée à {lune.illumination} %</p>
              {soleil.data?.coucher && (
                <p className="text-legende text-encre-3">☀️ coucher du soleil à {soleil.data.coucher}</p>
              )}
            </div>
          </div>
        </Carte>

        <Carte>
          <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🛰 La Station spatiale, EN DIRECT</p>
          {/* L'image s'affiche IMMÉDIATEMENT — dessinée sur place, aucun chargement. */}
          <GlobeIss
            lat={iss?.lat ?? 30}
            lon={iss?.lon ?? 0}
            maison={ville ? { nom: ville.nom, lat: ville.latitude, lon: ville.longitude } : null}
          />
          {iss ? (
            <>
              <p className="mt-1 text-corps-2 text-encre">
                {iss.km !== null && iss.km < 1000
                  ? `🤩 Elle est à ${iss.km} km de chez vous — sortez voir si le ciel est dégagé, elle file comme une étoile très brillante !`
                  : iss.km !== null
                    ? `Elle survole un point à ${iss.km.toLocaleString('fr-FR')} km de chez vous${ville ? ` — quand le point ${ville.nom} apparaît sur le globe, elle arrive !` : ''}.`
                    : 'Choisis ta ville dans la météo du tableau de bord pour voir la maison sur le globe.'}
              </p>
              <p className="mt-1 text-legende text-encre-3">
                {iss.lat.toFixed(1)}°, {iss.lon.toFixed(1)}° · 28 000 km/h ·{' '}
                {iss.direct ? '🟢 EN DIRECT' : '🛰 trajectoire calculée, le direct arrive…'} · tour de la Terre en 92 min —
                dites-le à Gabriel !
              </p>
            </>
          ) : (
            <p className="mt-1 text-legende text-encre-3">
              🛰 Elle file à 28 000 km/h — position exacte dans quelques secondes…
            </p>
          )}
        </Carte>

        <Carte>
          <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🌠 Étoiles filantes</p>
          {pluiesActives.length > 0 ? (
            pluiesActives.map((p) => (
              <p key={p.nom} className="py-0.5 text-corps-2 text-encre">
                ✨ Les <strong>{p.nom}</strong> sont EN COURS — jusqu'à ~{p.taux}/h au pic
                ({versDate(p.pic).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}). Regardez après 22 h, loin des lampadaires.
              </p>
            ))
          ) : prochaine ? (
            <p className="text-corps-2 text-encre">
              Prochaine pluie : les <strong>{prochaine.nom}</strong>, pic le{' '}
              {prochaine.quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} (~{prochaine.taux} étoiles filantes/h).
            </p>
          ) : null}
          <p className="mt-1 text-legende text-encre-3">
            {cielDegage ? '☀️ Bonne nouvelle : le ciel devrait être dégagé ce soir.' : `${iconeMeteo(meteoSoir.data?.[0]?.code ?? 3)} Ciel incertain ce soir — retente demain.`}
          </p>
        </Carte>

        {!ville && (
          <p className="text-legende text-encre-3">
            💡 Choisis ta ville dans le bloc météo du tableau de bord pour l'heure du coucher de soleil et la distance de l'ISS.
          </p>
        )}
      </div>
    </div>
  )
}
