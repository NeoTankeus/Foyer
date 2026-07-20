// 🌌 Ce soir on lève les yeux : la lune de ce soir, le coucher du soleil,
// la Station spatiale internationale suivie EN DIRECT (est-elle près de chez
// vous ?), et les pluies d'étoiles filantes à ne pas rater — magique avec
// Gabriel.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { villeMeteo, previsions, iconeMeteo } from '@/lib/meteo'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Carte } from '@/design/composants/Carte'
import { Feuille } from '@/design/composants/Feuille'

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

// La VRAIE Terre : photo satellite « Blue Marble » de la NASA (domaine
// public), chargée une fois puis gardée en cache un an par l'app.
const URL_TERRE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Blue_Marble_2002.png/1280px-Blue_Marble_2002.png'

/** La vraie Terre avec la Station qui avance dessus, seconde par seconde. */
function CarteTerreIss({
  lat,
  lon,
  ville,
  grande,
}: {
  lat: number
  lon: number
  ville: { nom: string; lat: number; lon: number } | null
  grande?: boolean
}) {
  const x = ((lon + 180) / 360) * 100
  const y = ((90 - lat) / 180) * 100
  const vx = ville ? ((ville.lon + 180) / 360) * 100 : null
  const vy = ville ? ((90 - ville.lat) / 180) * 100 : null

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-[#0a1226]"
      style={{ aspectRatio: '2 / 1' }}
      aria-label="La Station spatiale sur la vraie carte de la Terre"
    >
      <img
        src={URL_TERRE}
        alt=""
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* La maison */}
      {vx !== null && vy !== null && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${vx}%`, top: `${vy}%` }}>
          <div className="h-2.5 w-2.5 rounded-full border border-white bg-urgent shadow" />
          {grande && (
            <p className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-[700] text-white drop-shadow">
              {ville?.nom}
            </p>
          )}
        </div>
      )}
      {/* La Station : halo qui pulse + satellite, elle AVANCE chaque seconde */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ease-linear"
        style={{ left: `${x}%`, top: `${y}%` }}
      >
        <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-white/25" />
        <span className={grande ? 'text-[26px] drop-shadow' : 'text-[19px] drop-shadow'} aria-hidden="true">🛰</span>
      </div>
    </div>
  )
}

const CLE_ISS = 'stg-iss-derniere'

export function EcranCiel() {
  const lune = phaseLune()
  const ville = villeMeteo()
  const [pleinEcran, setPleinEcran] = useState(false)
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
          {/* La VRAIE Terre — un appui : plein écran avec la position réelle. */}
          <button onClick={() => setPleinEcran(true)} className="block w-full" aria-label="Voir la Station en plein écran">
            <CarteTerreIss
              lat={iss?.lat ?? 30}
              lon={iss?.lon ?? 0}
              ville={ville ? { nom: ville.nom, lat: ville.latitude, lon: ville.longitude } : null}
            />
          </button>
          {iss ? (
            <>
              <p className="mt-2 text-corps-2 text-encre">
                {iss.km !== null && iss.km < 1000
                  ? `🤩 Elle est à ${iss.km} km de chez vous — sortez voir si le ciel est dégagé, elle file comme une étoile très brillante !`
                  : iss.km !== null
                    ? `Elle survole un point à ${iss.km.toLocaleString('fr-FR')} km de chez vous.`
                    : 'Choisis ta ville dans la météo du tableau de bord pour voir la maison sur la carte.'}
              </p>
              <p className="mt-1 text-legende text-encre-3">
                {iss.lat.toFixed(1)}°, {iss.lon.toFixed(1)}° · 28 000 km/h ·{' '}
                {iss.direct ? '🟢 EN DIRECT' : '🛰 trajectoire calculée, le direct arrive…'} · touche la carte pour le
                plein écran !
              </p>
            </>
          ) : (
            <p className="mt-1 text-legende text-encre-3">
              🛰 Elle file à 28 000 km/h — position exacte dans quelques secondes…
            </p>
          )}
        </Carte>

        {/* Plein écran : la position réelle en grand + les vraies caméras NASA */}
        <Feuille ouverte={pleinEcran} onFermer={() => setPleinEcran(false)} titre="🛰 La Station en direct">
          <div className="flex flex-col gap-3">
            <CarteTerreIss
              lat={iss?.lat ?? 30}
              lon={iss?.lon ?? 0}
              ville={ville ? { nom: ville.nom, lat: ville.latitude, lon: ville.longitude } : null}
              grande
            />
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['📍', iss ? `${iss.lat.toFixed(1)}°, ${iss.lon.toFixed(1)}°` : '…', 'position'],
                ['🚀', '28 000 km/h', 'vitesse'],
                ['🏔', '~ 408 km', 'altitude'],
              ].map(([icone, valeur, libelle]) => (
                <div key={String(libelle)} className="rounded-xl bg-fond-sourd px-2 py-3">
                  <p className="text-corps-2 font-[700] text-encre">{icone} {valeur}</p>
                  <p className="text-legende text-encre-3">{libelle}</p>
                </div>
              ))}
            </div>
            {iss !== null && iss.km !== null && (
              <p className="text-center text-corps-2 text-encre-2">
                Elle est à <strong>{iss.km.toLocaleString('fr-FR')} km</strong> de chez vous
                {iss.km < 1500 ? ' — sortez la voir passer !' : '.'}
              </p>
            )}
            <a
              href="https://www.n2yo.com/?s=25544"
              target="_blank"
              rel="noopener"
              className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2"
            >
              🗺 Sa position réelle seconde par seconde (carte mondiale)
            </a>
            <a
              href="https://www.youtube.com/@NASA/streams"
              target="_blank"
              rel="noopener"
              className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2"
            >
              🎥 La VUE depuis la Station — caméras NASA en direct
            </a>
            <a
              href="https://spotthestation.nasa.gov/"
              target="_blank"
              rel="noopener"
              className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2"
            >
              🔔 Être prévenu des passages visibles (NASA Spot the Station)
            </a>
          </div>
        </Feuille>

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
