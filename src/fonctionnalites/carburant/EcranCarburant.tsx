// ⛽ Plein malin : les prix OFFICIELS de toutes les stations de France
// (données du gouvernement, mises à jour en continu) — la moins chère autour
// de toi, et combien tu économises sur un plein.
import { useState } from 'react'
import { utiliserSession } from '@/etat/session'
import { chercherLieux } from '@/lib/lieux'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { EtatVide } from '@/design/composants/EtatVide'

const CARBURANTS: { cle: string; libelle: string }[] = [
  { cle: 'gazole_prix', libelle: 'Gazole' },
  { cle: 'sp95_prix', libelle: 'SP95' },
  { cle: 'e10_prix', libelle: 'E10' },
  { cle: 'sp98_prix', libelle: 'SP98' },
  { cle: 'e85_prix', libelle: 'E85' },
]
const CLE_CARBURANT = 'stg-carburant'

interface Station {
  id: string
  nom: string
  adresse: string
  ville: string
  prix: number
  lat: number
  lon: number
  majLe: string | null
}

/** Les stations autour d'un point — API officielle data.economie.gouv.fr. */
async function chercherStations(lat: number, lon: number, carburant: string): Promise<Station[]> {
  const ou = encodeURIComponent(`within_distance(geom, geom'POINT(${lon} ${lat})', 15km) and ${carburant} is not null`)
  const reponse = await fetch(
    `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?where=${ou}&limit=40`,
  )
  if (!reponse.ok) throw new Error(`serveur carburants : ${reponse.status}`)
  const donnees = (await reponse.json()) as {
    results?: Record<string, unknown>[]
  }
  return (donnees.results ?? [])
    .map((r): Station | null => {
      const geom = r['geom'] as { lat?: number; lon?: number } | null
      const prix = Number(r[carburant])
      if (!geom?.lat || !geom.lon || !Number.isFinite(prix) || prix <= 0) return null
      return {
        id: String(r['id'] ?? `${geom.lat},${geom.lon}`),
        nom: String(r['enseigne'] ?? r['brand'] ?? '').trim() || 'Station-service',
        adresse: String(r['adresse'] ?? ''),
        ville: String(r['ville'] ?? ''),
        prix,
        lat: geom.lat,
        lon: geom.lon,
        majLe: typeof r[`${carburant.replace('_prix', '')}_maj`] === 'string' ? String(r[`${carburant.replace('_prix', '')}_maj`]) : null,
      }
    })
    .filter((s): s is Station => s !== null)
    .sort((a, b) => a.prix - b.prix)
}

export function EcranCarburant() {
  const { foyer } = utiliserSession()
  const maison = (foyer?.reglages['maison'] ?? null) as { lat?: number; lon?: number } | null
  const [carburant, setCarburant] = useState(() => localStorage.getItem(CLE_CARBURANT) ?? 'gazole_prix')
  const [source, setSource] = useState<'maison' | 'gps'>(maison?.lat ? 'maison' : 'gps')
  const [etat, setEtat] = useState<'attente' | 'cherche' | 'pret' | 'erreur'>('attente')
  const [stations, setStations] = useState<Station[]>([])
  const [erreur, setErreur] = useState('')

  const chercherDepuis = (lat: number, lon: number, choix: string) => {
    // Les prix officiels n'ont pas les enseignes — OpenStreetMap les connaît :
    // on croise les deux par distance (< 250 m) pour afficher NOM et MARQUE.
    const metres = (la1: number, lo1: number, la2: number, lo2: number) => {
      const rad = (d: number) => (d * Math.PI) / 180
      const a =
        Math.sin(rad(la2 - la1) / 2) ** 2 +
        Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2
      return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    Promise.all([
      chercherStations(lat, lon, choix),
      chercherLieux(lat, lon, 15000, 'fuel', 'stations').catch(() => []),
    ])
      .then(([officielles, osm]) => {
        const enrichies = officielles.map((s) => {
          let nomTrouve: string | null = null
          let plusProche = 250
          for (const o of osm) {
            const d = metres(s.lat, s.lon, o.latitude, o.longitude)
            if (d < plusProche) {
              plusProche = d
              nomTrouve = o.nom
            }
          }
          return nomTrouve ? { ...s, nom: nomTrouve } : s
        })
        setStations(enrichies)
        setEtat('pret')
      })
      .catch((e: unknown) => {
        setErreur(String(e instanceof Error ? e.message : e))
        setEtat('erreur')
      })
  }

  const lancer = (choix: string, ou: 'maison' | 'gps' = source) => {
    setCarburant(choix)
    setSource(ou)
    localStorage.setItem(CLE_CARBURANT, choix)
    setEtat('cherche')
    if (ou === 'maison' && maison?.lat && maison.lon) {
      // La maison : instantané, et jamais dans la mauvaise ville.
      chercherDepuis(maison.lat, maison.lon, choix)
      return
    }
    // Position EXACTE — la position approximative peut être à 100 km.
    navigator.geolocation?.getCurrentPosition(
      (pos) => chercherDepuis(pos.coords.latitude, pos.coords.longitude, choix),
      () => {
        setErreur(
          maison?.lat
            ? 'Position refusée — utilise 🏡 La maison, ou autorise la localisation.'
            : 'Position refusée — autorise la localisation (comme pour les restaurants).',
        )
        setEtat('erreur')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  }

  const moinsChere = stations[0]
  const plusChere = stations[stations.length - 1]
  const economie =
    moinsChere && plusChere && stations.length > 1 ? (plusChere.prix - moinsChere.prix) * 50 : null

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">⛽ Plein malin</h1>
        <p className="text-legende text-encre-3">Les prix officiels, station par station.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {maison?.lat && (
          <div className="flex gap-2">
            {([['maison', '🏡 Autour de la maison'], ['gps', '📍 Autour de moi']] as const).map(([cle, libelle]) => (
              <button
                key={cle}
                onClick={() => (etat === 'attente' ? setSource(cle) : lancer(carburant, cle))}
                aria-pressed={source === cle}
                className={`min-h-sur-tactile flex-1 rounded-full px-3 text-note font-[590]
                  ${source === cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {libelle}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CARBURANTS.map((c) => (
            <button
              key={c.cle}
              onClick={() => lancer(c.cle)}
              aria-pressed={carburant === c.cle && etat === 'pret'}
              className={`min-h-sur-tactile shrink-0 rounded-full px-4 text-note font-[590]
                ${carburant === c.cle && etat !== 'attente' ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              {c.libelle}
            </button>
          ))}
        </div>

        {etat === 'attente' && (
          <EtatVide
            titre="Quel carburant ?"
            message="Touche ton carburant — STG interroge les prix officiels de toutes les stations dans 15 km autour de toi."
          />
        )}
        {etat === 'cherche' && <p className="py-6 text-center text-corps-2 text-encre-3">⛽ Relevé des prix officiels…</p>}
        {etat === 'erreur' && (
          <div className="flex flex-col gap-2">
            <p className="text-corps-2 text-encre-2">{erreur}</p>
            <Bouton pleineLargeur variante="primaire" onClick={() => lancer(carburant)}>Réessayer</Bouton>
          </div>
        )}

        {etat === 'pret' && stations.length === 0 && (
          <EtatVide titre="Aucune station" message="Rien à moins de 15 km avec ce carburant — étrange ! Essaie un autre carburant." />
        )}

        {etat === 'pret' && economie !== null && economie > 1 && (
          <p className="rounded-lg bg-sauge/15 px-3 py-2 text-corps-2 text-encre-2">
            💰 Sur un plein de 50 L : jusqu'à <strong>{economie.toFixed(2).replace('.', ',')} €</strong> d'écart entre la
            moins chère et la plus chère du coin.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {stations.slice(0, 15).map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl bg-fond-eleve p-3 shadow-carte">
              <div className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-xl ${i === 0 ? 'bg-sauge/20' : 'bg-fond-sourd'}`}>
                <p className={`chiffres text-corps font-[700] ${i === 0 ? 'text-fait' : 'text-encre'}`}>
                  {s.prix.toFixed(3).replace('.', ',')}
                </p>
                <p className="text-legende text-encre-3">€/L</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-corps-2 font-[590] leading-snug text-encre">
                  {i === 0 ? '🏆 ' : ''}{s.nom}
                </p>
                <p className="break-words text-legende text-encre-3">{[s.adresse, s.ville].filter(Boolean).join(', ')}</p>
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=driving`}
                target="_blank"
                rel="noopener"
                aria-label={`Itinéraire vers ${s.nom}`}
                className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
              >
                🧭
              </a>
            </li>
          ))}
        </ul>

        {etat === 'pret' && stations.length > 0 && (
          <p className="text-legende text-encre-3">
            Source : données officielles du gouvernement (prix-carburants), rafraîchies en continu par les stations.
          </p>
        )}
      </div>
    </div>
  )
}
