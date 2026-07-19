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

export function EcranCiel() {
  const lune = phaseLune()
  const ville = villeMeteo()
  const [iss, setIss] = useState<{ lat: number; lon: number; km: number | null } | null>(null)

  // La Station spatiale, suivie en direct toutes les 8 secondes.
  useEffect(() => {
    let arret = false
    const suivre = async () => {
      try {
        const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544')
        if (!r.ok) return
        const d = (await r.json()) as { latitude: number; longitude: number }
        if (arret) return
        setIss({
          lat: d.latitude,
          lon: d.longitude,
          km: ville ? distanceKm(ville.latitude, ville.longitude, d.latitude, d.longitude) : null,
        })
      } catch {
        // le satellite repassera
      }
    }
    void suivre()
    const minuteur = window.setInterval(() => void suivre(), 8000)
    return () => {
      arret = true
      window.clearInterval(minuteur)
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
          {iss ? (
            <>
              <p className="text-corps-2 text-encre">
                {iss.km !== null && iss.km < 1000
                  ? `🤩 Elle est à ${iss.km} km de chez vous — sortez voir si le ciel est dégagé, elle file comme une étoile très brillante !`
                  : iss.km !== null
                    ? `En ce moment elle survole un point à ${iss.km.toLocaleString('fr-FR')} km de chez vous.`
                    : 'Position en direct — choisis ta ville dans la météo du tableau de bord pour savoir quand elle passe près de chez vous.'}
              </p>
              <p className="mt-1 text-legende text-encre-3">
                Position : {iss.lat.toFixed(1)}°, {iss.lon.toFixed(1)}° · 28 000 km/h · rafraîchi toutes les 8 s · elle fait le tour de la Terre en 92 min — dites-le à Gabriel !
              </p>
            </>
          ) : (
            <p className="text-corps-2 text-encre-3">Connexion au satellite…</p>
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
