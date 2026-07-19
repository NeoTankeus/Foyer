// Les Restaurants du foyer : fiche remplie par OpenStreetMap (adresse, GPS,
// téléphone, site), NOS notes et avis, photos de la carte (photo ou trouvée
// sur internet), favoris ⭐, et la carte mondiale avec ma position.
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import { ChoixVisuel } from '@/design/composants/ChoixVisuel'
import type { LigneRestaurant } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

interface ResultatOsm {
  display_name: string
  lat: string
  lon: string
  extratags?: Record<string, string>
  address?: Record<string, string>
}

async function chercherNominatim(q: string): Promise<ResultatOsm | null> {
  try {
    const reponse = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=3&extratags=1&addressdetails=1&accept-language=fr`,
      { headers: { accept: 'application/json' } },
    )
    if (!reponse.ok) return null
    const donnees = (await reponse.json()) as ResultatOsm[]
    return donnees[0] ?? null
  } catch {
    return null
  }
}

/** Recherche floue (Photon) — tolère fautes de frappe et noms approximatifs. */
async function chercherPhoton(q: string): Promise<ResultatOsm | null> {
  try {
    const reponse = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=fr`)
    if (!reponse.ok) return null
    const donnees = (await reponse.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }[]
    }
    const lieux = donnees.features ?? []
    const choisi =
      lieux.find((f) =>
        /restaurant|bistro|brasserie|cafe|fast_food|pub|bar/.test(String(f.properties?.['osm_value'] ?? '')),
      ) ?? lieux[0]
    const coords = choisi?.geometry?.coordinates
    if (!choisi || !coords) return null
    const p = choisi.properties ?? {}
    const morceaux = [p['name'], p['street'], p['postcode'], p['city'], p['country']].filter(Boolean)
    return {
      display_name: morceaux.join(', '),
      lat: String(coords[1]),
      lon: String(coords[0]),
      address: { city: String(p['city'] ?? '') },
    }
  } catch {
    return null
  }
}

/** Cherche le restaurant sur OpenStreetMap : adresse, GPS, téléphone, site.
 *  Trois tentatives, de la plus précise à la plus tolérante. */
async function chercherSurOsm(nom: string, ville: string): Promise<ResultatOsm | null> {
  const complet = `${nom} ${ville}`.trim()
  return (
    (await chercherNominatim(complet)) ??
    (await chercherNominatim(`restaurant ${complet}`)) ??
    (await chercherPhoton(complet))
  )
}

interface RestoAutour {
  id: string
  nom: string
  cuisine: string | null
  telephone: string | null
  site: string | null
  latitude: number
  longitude: number
  distanceM: number
}

// Les serveurs Overpass (OpenStreetMap) — souvent saturés un par un,
// alors on les interroge TOUS EN MÊME TEMPS : le plus rapide gagne.
const MIROIRS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

interface ReponseOverpass {
  elements?: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]
}

/** Le serveur de StiGa interroge les cartes à notre place (contourne Safari). */
async function chercherAutourViaStiga(lat: number, lon: number, rayonM: number): Promise<ReponseOverpass> {
  const { data: session } = await supabase.auth.getSession()
  const reponse = await fetch('/api/chercher-resto', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ mode: 'autour', lat, lon, rayon: rayonM }),
  })
  if (!reponse.ok) throw new Error(`relais ${reponse.status}`)
  const donnees = (await reponse.json()) as ReponseOverpass & { erreur?: string }
  if (donnees.erreur) throw new Error(donnees.erreur)
  return donnees
}

/** Les restaurants autour d'un point (Overpass / OpenStreetMap, gratuit). */
async function chercherAutour(lat: number, lon: number, rayonM: number): Promise<RestoAutour[]> {
  const requete = `[out:json][timeout:20];(node(around:${rayonM},${lat},${lon})[amenity~"restaurant|bistro|brasserie"][name];way(around:${rayonM},${lat},${lon})[amenity~"restaurant|bistro|brasserie"][name];);out center 80;`
  const controleurs = MIROIRS_OVERPASS.map(() => new AbortController())
  const essais = MIROIRS_OVERPASS.map(async (miroir, i) => {
    const coupure = controleurs[i]!
    const minuteur = setTimeout(() => coupure.abort(), 25000)
    try {
      const essai = await fetch(miroir, {
        method: 'POST',
        body: `data=${encodeURIComponent(requete)}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        signal: coupure.signal,
      })
      if (!essai.ok) throw new Error(`serveur cartes : ${essai.status}`)
      return (await essai.json()) as ReponseOverpass
    } catch (e) {
      throw new Error(
        coupure.signal.aborted
          ? 'serveur cartes trop lent (25 s)'
          : String(e instanceof Error ? e.message : e).slice(0, 70),
      )
    } finally {
      clearTimeout(minuteur)
    }
  })
  // Le relais StiGa part EN MÊME TEMPS que les appels directs : le premier
  // qui répond gagne — plus aucune attente en cascade.
  const relais = chercherAutourViaStiga(lat, lon, rayonM)
  let donnees: ReponseOverpass
  try {
    donnees = await Promise.any([...essais, relais])
    for (const c of controleurs) c.abort()
  } catch (e) {
    const motifs = (e instanceof AggregateError ? e.errors : [e])
      .map((x) => String(x instanceof Error ? x.message : x).slice(0, 60))
    throw new Error(motifs.join(' · ').slice(0, 160))
  }
  const versRad = (d: number) => (d * Math.PI) / 180
  const distance = (la: number, lo: number) => {
    const R = 6371000
    const dLat = versRad(la - lat)
    const dLon = versRad(lo - lon)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(versRad(lat)) * Math.cos(versRad(la)) * Math.sin(dLon / 2) ** 2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  }
  const resultats: RestoAutour[] = []
  for (const e of donnees.elements ?? []) {
    const la = e.lat ?? e.center?.lat
    const lo = e.lon ?? e.center?.lon
    const nom = e.tags?.['name']
    if (la === undefined || lo === undefined || !nom) continue
    resultats.push({
      id: String(e.id),
      nom,
      cuisine: e.tags?.['cuisine']?.replace(/_/g, ' ').replace(/;/g, ', ') ?? null,
      telephone: e.tags?.['phone'] ?? e.tags?.['contact:phone'] ?? null,
      site: e.tags?.['website'] ?? e.tags?.['contact:website'] ?? null,
      latitude: la,
      longitude: lo,
      distanceM: distance(la, lo),
    })
  }
  return resultats.sort((a, b) => a.distanceM - b.distanceM)
}

function Etoiles({ note, surNote }: { note: number | null; surNote?: (n: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={!surNote}
          onClick={() => {
            navigator.vibrate?.(4)
            surNote?.(n)
          }}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          className={`px-0.5 text-[22px] ${surNote ? '' : 'pointer-events-none'}`}
        >
          {note !== null && n <= note ? '⭐' : '☆'}
        </button>
      ))}
    </span>
  )
}

export function EcranRestaurants() {
  const { foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [vue, setVue] = useState<'liste' | 'carte' | 'autour'>('liste')
  const [filtre, setFiltre] = useState('')
  const [favorisSeuls, setFavorisSeuls] = useState(false)
  const [creation, setCreation] = useState(false)
  const [ouvert, setOuvert] = useState<LigneRestaurant | null>(null)

  const restaurants = useQuery({
    queryKey: ['restaurants'],
    queryFn: () =>
      lireAvecRepli<LigneRestaurant>('restaurants', async () => {
        const { data, error } = await supabase.from('restaurants').select('*')
        if (error) throw error
        return data
      }),
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['restaurants'] })

  const visibles = (restaurants.data ?? [])
    .filter((r) => !favorisSeuls || r.favori)
    .filter((r) => `${r.nom} ${r.ville ?? ''} ${r.cuisine ?? ''}`.toLowerCase().includes(filtre.toLowerCase()))
    .sort((a, b) => Number(b.favori) - Number(a.favori) || (b.note ?? 0) - (a.note ?? 0) || a.nom.localeCompare(b.nom))

  // La fiche ouverte suit les données fraîches.
  const ouvertFrais = ouvert ? (restaurants.data ?? []).find((r) => r.id === ouvert.id) ?? ouvert : null

  return (
    <div className="px-5 pb-6 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 className="min-w-0 flex-1 truncate text-titre-3 text-encre">🍴 Restaurants</h2>
        <Bouton variante="valider" onClick={() => setCreation(true)} etiquette="Ajouter un restaurant">+</Bouton>
      </div>
      <div className="mb-3 flex gap-1 rounded-lg bg-fond-sourd p-1">
        {([['liste', '📋 Nos adresses'], ['autour', '📍 Autour de moi'], ['carte', '🗺 Carte']] as const).map(([cle, libelle]) => (
          <button
            key={cle}
            onClick={() => setVue(cle)}
            aria-pressed={vue === cle}
            className={`min-h-sur-tactile flex-1 rounded-md text-note font-[590]
              ${vue === cle ? 'bg-fond-eleve text-encre shadow-carte' : 'text-encre-3'}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {vue === 'liste' && (
        <>
          <div className="mb-3 flex gap-2">
            <input
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              placeholder="🔎 Chercher (nom, ville, cuisine…)"
              aria-label="Filtrer les restaurants"
              className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
            />
            <button
              onClick={() => setFavorisSeuls(!favorisSeuls)}
              aria-pressed={favorisSeuls}
              aria-label="Favoris seulement"
              className={`min-h-sur-tactile shrink-0 rounded-full px-3 text-[18px] ${favorisSeuls ? 'bg-ambre/20' : 'bg-fond-sourd'}`}
            >
              ⭐
            </button>
          </div>

          {visibles.length === 0 && !restaurants.isLoading && (
            <EtatVide titre="Aucun restaurant" message="Ajoute votre première adresse — la fiche se remplit toute seule." />
          )}

          <ul className="flex flex-col gap-2">
            {visibles.map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded-xl bg-fond-eleve p-3 shadow-carte">
                <button
                  onClick={() => void muter({ table: 'restaurants', type: 'update', cible_id: r.id, charge: { favori: !r.favori } }).then(rafraichir)}
                  aria-pressed={r.favori}
                  aria-label={`${r.favori ? 'Retirer des' : 'Mettre en'} favoris : ${r.nom}`}
                  className="flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center text-[24px]"
                >
                  {r.favori ? '⭐' : '☆'}
                </button>
                <button onClick={() => setOuvert(r)} className="min-w-0 flex-1 py-1 text-left">
                  <p className="break-words text-corps font-[590] leading-snug text-encre">{r.nom}</p>
                  <p className="break-words text-legende text-encre-3">
                    {[r.ville, r.cuisine].filter(Boolean).join(' · ')}
                  </p>
                  {r.note !== null && <Etoiles note={r.note} />}
                </button>
                <span aria-hidden="true" className="text-encre-3">›</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {vue === 'carte' && <CarteMonde restaurants={restaurants.data ?? []} surChoix={(r) => setOuvert(r)} />}

      {vue === 'autour' && foyer && (
        <AutourDeMoi
          mesRestos={restaurants.data ?? []}
          surAjout={async (decouvert, favori = false) => {
            const id = crypto.randomUUID()
            await muter({
              table: 'restaurants', type: 'insert', cible_id: id,
              charge: {
                id, foyer_id: foyer.id, nom: decouvert.nom, ville: null, adresse: null,
                latitude: decouvert.latitude, longitude: decouvert.longitude,
                telephone: decouvert.telephone, site: decouvert.site, cuisine: decouvert.cuisine,
                note: null, avis: null, favori, carte_photos: [],
                cree_le: new Date().toISOString(),
              },
            })
            await rafraichir()
          }}
        />
      )}

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouveau restaurant">
        {foyer && (
          <FormRestaurant
            surCreation={async (brouillon) => {
              const id = crypto.randomUUID()
              await muter({
                table: 'restaurants', type: 'insert', cible_id: id,
                charge: {
                  id, foyer_id: foyer.id, note: null, avis: null, favori: false,
                  carte_photos: [], cree_le: new Date().toISOString(), ...brouillon,
                },
              })
              await rafraichir()
              setCreation(false)
            }}
          />
        )}
      </Feuille>

      <Feuille ouverte={ouvertFrais !== null} onFermer={() => setOuvert(null)} titre={ouvertFrais?.nom ?? ''}>
        {ouvertFrais && (
          <FicheRestaurant
            resto={ouvertFrais}
            surMaj={async (charge) => {
              await muter({ table: 'restaurants', type: 'update', cible_id: ouvertFrais.id, charge })
              await rafraichir()
            }}
            surSuppression={async () => {
              await muter({ table: 'restaurants', type: 'delete', cible_id: ouvertFrais.id, charge: {} })
              await rafraichir()
              setOuvert(null)
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormRestaurant({
  surCreation,
}: {
  surCreation: (b: Partial<LigneRestaurant> & { nom: string }) => Promise<void>
}) {
  const [nom, setNom] = useState('')
  const [ville, setVille] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [etat, setEtat] = useState<string | null>(null)

  const creer = async () => {
    if (!nom.trim()) return
    setEnCours(true)
    setEtat('🔎 Recherche de la fiche (adresse, téléphone, GPS)…')
    const osm = await chercherSurOsm(nom.trim(), ville.trim())
    const extra = osm?.extratags ?? {}
    await surCreation({
      nom: nom.trim(),
      ville: ville.trim() || osm?.address?.['municipality'] || osm?.address?.['town'] || osm?.address?.['city'] || null,
      adresse: osm?.display_name?.split(',').slice(0, 3).join(',') ?? null,
      latitude: osm ? Number(osm.lat) : null,
      longitude: osm ? Number(osm.lon) : null,
      telephone: extra['phone'] ?? extra['contact:phone'] ?? null,
      site: extra['website'] ?? extra['contact:website'] ?? null,
      cuisine: extra['cuisine']?.replace(/_/g, ' ') ?? null,
    })
    setEnCours(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Nom du restaurant" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Chez Louise" />
      <ChampTexte etiquette="Ville" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="pour bien le retrouver" />
      {etat && <p className="text-legende text-encre-3">{etat}</p>}
      <Bouton pleineLargeur variante="valider" desactive={enCours || !nom.trim()} onClick={() => void creer()}>
        {enCours ? 'Création…' : 'Ajouter — la fiche se remplit toute seule'}
      </Bouton>
    </div>
  )
}

function FicheRestaurant({
  resto,
  surMaj,
  surSuppression,
}: {
  resto: LigneRestaurant
  surMaj: (charge: Record<string, unknown>) => Promise<void>
  surSuppression: () => Promise<void>
}) {
  const [avis, setAvis] = useState(resto.avis ?? '')
  const [confirme, setConfirme] = useState(false)
  const [choixCarte, setChoixCarte] = useState(false)
  const [photoEnCours, setPhotoEnCours] = useState(false)
  const [localisation, setLocalisation] = useState<'repos' | 'en-cours' | 'echec'>('repos')
  const [adresseManuelle, setAdresseManuelle] = useState('')
  const [pageTheFork, setPageTheFork] = useState<string | null | 'cherche'>('cherche')
  const [pageMenu, setPageMenu] = useState<string | null>(null)

  const appelResto = async (corps: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data } = await supabase.auth.getSession()
    const reponse = await fetch('/api/chercher-resto', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(corps),
    })
    return (await reponse.json()) as Record<string, unknown>
  }

  // La vraie page TheFork du restaurant — cherchée dès l'ouverture de la fiche.
  useEffect(() => {
    let annule = false
    setPageTheFork('cherche')
    void appelResto({ mode: 'thefork', nom: resto.nom, ville: resto.ville ?? '' })
      .then((r) => {
        if (!annule) setPageTheFork(typeof r['url'] === 'string' ? (r['url'] as string) : null)
      })
      .catch(() => {
        if (!annule) setPageTheFork(null)
      })
    return () => {
      annule = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resto.id])

  // La carte : on lit d'abord LE SITE du restaurant, internet en secours.
  const chercheurCarte = async (requete: string): Promise<string[]> => {
    const r = await appelResto({
      mode: 'carte', nom: resto.nom, ville: resto.ville ?? '', site: resto.site ?? '', requete,
    })
    setPageMenu(typeof r['pageMenu'] === 'string' ? (r['pageMenu'] as string) : null)
    return Array.isArray(r['images']) ? (r['images'] as string[]) : []
  }

  // Position manquante (l'adresse n'avait pas été trouvée) : on retente.
  const localiser = async () => {
    setLocalisation('en-cours')
    const osm = await chercherSurOsm(resto.nom, resto.ville ?? '')
    if (osm) {
      await surMaj({
        latitude: Number(osm.lat),
        longitude: Number(osm.lon),
        adresse: resto.adresse ?? osm.display_name.split(',').slice(0, 3).join(','),
      })
      setLocalisation('repos')
    } else {
      setLocalisation('echec')
    }
  }

  // Dernier recours : l'adresse postale tapée à la main, toujours localisable.
  const localiserParAdresse = async () => {
    if (!adresseManuelle.trim()) return
    setLocalisation('en-cours')
    const osm = (await chercherNominatim(adresseManuelle)) ?? (await chercherPhoton(adresseManuelle))
    if (osm) {
      await surMaj({
        latitude: Number(osm.lat),
        longitude: Number(osm.lon),
        adresse: adresseManuelle.trim(),
      })
      setLocalisation('repos')
    } else {
      setLocalisation('echec')
    }
  }

  const q = encodeURIComponent(`${resto.nom} ${resto.ville ?? ''}`.trim())

  const ajouterPhotoCarte = async (fichier: File) => {
    setPhotoEnCours(true)
    try {
      const image = await compresserImage(fichier)
      await surMaj({ carte_photos: [...resto.carte_photos, image] })
    } finally {
      setPhotoEnCours(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-legende text-encre-3">{resto.adresse ?? resto.ville ?? ''}</p>
          {resto.cuisine && <p className="text-legende text-encre-3">🍽 {resto.cuisine}</p>}
        </div>
        <button
          onClick={() => void surMaj({ favori: !resto.favori })}
          aria-pressed={resto.favori}
          aria-label="Favori"
          className="min-h-sur-tactile min-w-sur-tactile text-[26px]"
        >
          {resto.favori ? '⭐' : '☆'}
        </button>
      </div>

      {resto.latitude === null && (
        <div>
          <Bouton pleineLargeur variante="discret" desactive={localisation === 'en-cours'} onClick={() => void localiser()}>
            {localisation === 'en-cours' ? 'Localisation…' : '📍 Localiser sur la carte (par l’adresse)'}
          </Bouton>
          {localisation === 'echec' && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-legende text-encre-3">
                Introuvable par le nom — colle son adresse postale complète, ça marche à tous les coups :
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void localiserParAdresse()
                }}
              >
                <input
                  value={adresseManuelle}
                  onChange={(e) => setAdresseManuelle(e.target.value)}
                  placeholder="12 rue de la Paix, 75002 Paris"
                  aria-label="Adresse du restaurant"
                  className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
                />
                <Bouton type="submit" variante="valider" desactive={!adresseManuelle.trim()}>
                  📍
                </Bouton>
              </form>
            </div>
          )}
        </div>
      )}
      {resto.latitude !== null && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${resto.latitude},${resto.longitude}&travelmode=driving`}
          target="_blank"
          rel="noopener"
          className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight"
        >
          🧭 Itinéraire depuis ma position
        </a>
      )}

      <div className="rounded-lg bg-fond-sourd px-3 py-2">
        <p className="mb-1 text-legende font-[590] text-encre-3">NOTRE NOTE</p>
        <Etoiles note={resto.note} surNote={(n) => void surMaj({ note: n })} />
        <textarea
          value={avis}
          onChange={(e) => setAvis(e.target.value)}
          rows={2}
          placeholder="Ce qu’on en pense — plats préférés, à éviter, ambiance…"
          aria-label="Notre avis"
          className="mt-1 w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2 text-encre"
        />
        {avis.trim() !== (resto.avis ?? '').trim() && (
          <Bouton variante="valider" onClick={() => void surMaj({ avis: avis.trim() || null })}>
            Enregistrer l’avis
          </Bouton>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {resto.telephone && (
          <a href={`tel:${resto.telephone.replace(/\s/g, '')}`} className="btn-3d btn-sauge inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight">
            📞 Appeler
          </a>
        )}
        {resto.site && (
          <a href={resto.site} target="_blank" rel="noopener" className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight">
            🌐 Site
          </a>
        )}
        <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener" className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight">
          ⭐ Avis Google
        </a>
        <a href={`https://www.tripadvisor.fr/Search?q=${q}`} target="_blank" rel="noopener" className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight">
          🦉 TripAdvisor
        </a>
        {pageTheFork === 'cherche' ? (
          <span className="inline-flex min-h-sur-tactile items-center px-2 text-legende text-encre-3">
            🍴 TheFork : recherche de la page…
          </span>
        ) : pageTheFork ? (
          <a href={pageTheFork} target="_blank" rel="noopener" className="btn-3d btn-ardoise inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight">
            🍴 Réserver (TheFork)
          </a>
        ) : (
          <span className="inline-flex min-h-sur-tactile items-center px-2 text-legende text-encre-3">
            🍴 Pas de page TheFork trouvée — 📞 l’appel reste le plus sûr.
          </span>
        )}
      </div>

      <div>
        <p className="mb-1 text-legende font-[590] text-encre-3">📖 LA CARTE DU RESTAURANT</p>
        {resto.carte_photos.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {resto.carte_photos.map((photo, idx) => (
              <div key={idx} className="relative shrink-0">
                <img src={photo} alt={`Carte ${idx + 1}`} className="h-36 rounded-md object-cover" />
                <button
                  onClick={() => void surMaj({ carte_photos: resto.carte_photos.filter((_, i) => i !== idx) })}
                  aria-label="Retirer cette photo"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-encre/70 text-note text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="btn-3d btn-clair inline-flex min-h-sur-tactile cursor-pointer items-center justify-center px-4 py-2.5 text-corps-2 leading-tight">
            {photoEnCours ? 'Ajout…' : '📷 Photographier la carte'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const fichier = e.target.files?.[0]
                if (fichier) void ajouterPhotoCarte(fichier)
                e.target.value = ''
              }}
            />
          </label>
          <Bouton variante="discret" onClick={() => setChoixCarte(true)}>
            🔎 Chercher la carte {resto.site ? 'sur le site du resto' : 'sur internet'}
          </Bouton>
          {pageMenu && (
            <a
              href={pageMenu}
              target="_blank"
              rel="noopener"
              className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight"
            >
              🌐 Ouvrir la carte du site {/\.pdf(\?|$)/i.test(pageMenu) ? '(PDF)' : ''}
            </a>
          )}
        </div>
      </div>

      <Bouton
        pleineLargeur
        variante={confirme ? 'urgent' : 'discret'}
        onClick={() => {
          if (confirme) void surSuppression()
          else setConfirme(true)
        }}
      >
        {confirme ? 'Confirmer la suppression ?' : 'Supprimer ce restaurant'}
      </Bouton>

      <ChoixVisuel
        ouverte={choixCarte}
        nomInitial={`${resto.nom} ${resto.ville ?? ''} carte menu`}
        onFermer={() => setChoixCarte(false)}
        chercheur={chercheurCarte}
        onChoix={(image) => {
          setChoixCarte(false)
          void surMaj({ carte_photos: [...resto.carte_photos, image] })
        }}
      />
    </div>
  )
}

/** La carte mondiale (OpenStreetMap/Leaflet) : nos restaurants + ma position. */
function CarteMonde({
  restaurants,
  surChoix,
}: {
  restaurants: LigneRestaurant[]
  surChoix: (r: LigneRestaurant) => void
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [pret, setPret] = useState(false)

  useEffect(() => {
    let detruire: (() => void) | null = null
    void (async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (!conteneur.current) return
      const carte = L.map(conteneur.current, { zoomControl: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(carte)

      const positions: [number, number][] = []
      for (const r of restaurants) {
        if (r.latitude === null || r.longitude === null) continue
        positions.push([r.latitude, r.longitude])
        const marqueur = L.marker([r.latitude, r.longitude], {
          icon: L.divIcon({
            className: '',
            html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgb(0 0 0/.4))">${r.favori ? '⭐' : '📍'}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 24],
          }),
        }).addTo(carte)
        marqueur.bindPopup(`<strong>${r.nom}</strong><br>${r.ville ?? ''}`)
        marqueur.on('click', () => surChoix(r))
      }

      if (positions.length > 0) carte.fitBounds(positions, { padding: [40, 40], maxZoom: 14 })
      else carte.setView([46.6, 2.4], 5)

      // Ma position — pour retrouver l'adresse la plus proche d'où je suis.
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          const ici: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          L.circleMarker(ici, { radius: 9, color: '#4a6fa5', fillColor: '#4a6fa5', fillOpacity: 0.85 })
            .addTo(carte)
            .bindPopup('Moi 📍')
          if (positions.length === 0) carte.setView(ici, 12)
        },
        () => undefined,
        { enableHighAccuracy: false, timeout: 8000 },
      )

      setPret(true)
      detruire = () => carte.remove()
    })()
    return () => detruire?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurants.length])

  return (
    <div className="overflow-hidden rounded-xl shadow-carte">
      <div ref={conteneur} style={{ height: '62vh' }} aria-label="Carte des restaurants" />
      {!pret && <p className="py-4 text-center text-corps-2 text-encre-3">Chargement de la carte…</p>}
    </div>
  )
}

/** 📍 Autour de moi : découverte GPS, tri par distance et par NOS goûts. */
function AutourDeMoi({
  mesRestos,
  surAjout,
}: {
  mesRestos: LigneRestaurant[]
  surAjout: (r: RestoAutour, favori?: boolean) => Promise<void>
}) {
  const [rayon, setRayon] = useState(2000)
  const [etat, setEtat] = useState<'attente' | 'geoloc' | 'recherche' | 'pret' | 'erreur'>('attente')
  const [refusPosition, setRefusPosition] = useState(false)
  const [diagnostic, setDiagnostic] = useState<string | null>(null)
  const [essais, setEssais] = useState(0)
  const [resultats, setResultats] = useState<RestoAutour[]>([])
  const [ici, setIci] = useState<[number, number] | null>(null)
  const [gouts, setGouts] = useState(false)
  const [ajoutes, setAjoutes] = useState<Set<string>>(new Set())
  const [favorisAjoutes, setFavorisAjoutes] = useState<Set<string>>(new Set())
  const [avisStiga, setAvisStiga] = useState<string | null>(null)
  const [reflechit, setReflechit] = useState(false)

  // Nos goûts : les cuisines de nos favoris et de nos tables notées ≥ 4.
  const cuisinesAimees = [
    ...new Set(
      mesRestos
        .filter((r) => r.favori || (r.note ?? 0) >= 4)
        .flatMap((r) => (r.cuisine ?? '').split(/[,;]/).map((c) => c.trim().toLowerCase()))
        .filter(Boolean),
    ),
  ]
  const dansNosGouts = (r: RestoAutour) =>
    cuisinesAimees.length > 0 &&
    cuisinesAimees.some((c) => (r.cuisine ?? '').toLowerCase().includes(c))

  const lancer = (rayonChoisi: number) => {
    setAvisStiga(null)
    setRefusPosition(false)
    setDiagnostic(null)
    setEssais((n) => n + 1)
    if (!navigator.geolocation) {
      setRefusPosition(true)
      setDiagnostic('géolocalisation absente du navigateur')
      setEtat('erreur')
      return
    }
    setEtat('geoloc')
    // C'est CET appel qui déclenche la demande d'autorisation sur l'iPhone.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIci([pos.coords.latitude, pos.coords.longitude])
        setEtat('recherche')
        void chercherAutour(pos.coords.latitude, pos.coords.longitude, rayonChoisi)
          .then((liste) => {
            setResultats(liste)
            setEtat('pret')
          })
          .catch((e: unknown) => {
            const detail = String(e instanceof Error ? e.message : e).slice(0, 90)
            setDiagnostic(`position OK, mais la recherche des tables a échoué — ${detail}`)
            setEtat('erreur')
          })
      },
      (e) => {
        setRefusPosition(e.code === e.PERMISSION_DENIED)
        const motifs: Record<number, string> = {
          1: 'l’iPhone répond « refusé » sans demander',
          2: 'position indisponible (GPS muet)',
          3: 'trop long — la position n’est pas arrivée à temps',
        }
        let detail = `code ${e.code} — ${motifs[e.code] ?? e.message}`
        // L'état exact de l'autorisation, si l'iPhone accepte de le dire.
        void navigator.permissions
          ?.query({ name: 'geolocation' })
          .then((p) => {
            const libelles: Record<string, string> = {
              denied: 'refusée (mémorisée)',
              prompt: 'à demander',
              granted: 'accordée',
            }
            detail += ` · autorisation : ${libelles[p.state] ?? p.state}`
            setDiagnostic(detail)
          })
          .catch(() => setDiagnostic(detail))
        setDiagnostic(detail)
        setEtat('erreur')
      },
      // Précision « ville » suffit pour des restaurants — et une position
      // d'il y a moins de 5 min est réutilisée telle quelle : réponse immédiate.
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    )
  }

  const demanderAvis = async () => {
    setReflechit(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const dejaNotes = mesRestos
        .filter((r) => r.note !== null || r.favori)
        .map((r) => `${r.nom} (${r.cuisine ?? '?'}, ${r.favori ? 'favori' : ''} note ${r.note ?? '—'}/5${r.avis ? `, « ${r.avis.slice(0, 60)} »` : ''})`)
        .join(' · ')
      const alentours = resultats
        .slice(0, 20)
        .map((r) => `${r.nom} (${r.cuisine ?? 'cuisine inconnue'}, à ${r.distanceM} m)`)
        .join(' · ')
      const question =
        `Voici les restaurants autour de nous : ${alentours}. ` +
        `Nos goûts d'après notre carnet : ${dejaNotes || 'pas encore de notes'}. ` +
        `Recommande les 3 meilleures tables à essayer parmi la liste autour de nous, en une ligne chacune avec pourquoi (par rapport à nos goûts). Sois direct et concret.`
      const reponse = await fetch('/api/gastif', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ messages: [{ role: 'utilisateur', texte: question }], contexte: '', role_membre: 'adult' }),
      })
      const donnees = (await reponse.json()) as { reponse?: string; message?: string }
      setAvisStiga(donnees.reponse ?? donnees.message ?? 'StiGa n’a pas répondu — réessaie.')
    } catch {
      setAvisStiga('Pas de réseau — réessaie.')
    } finally {
      setReflechit(false)
    }
  }

  const visibles = resultats
    .filter((r) => !gouts || dansNosGouts(r))
    .sort((a, b) => Number(dansNosGouts(b)) - Number(dansNosGouts(a)) || a.distanceM - b.distanceM)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {[[500, '500 m'], [2000, '2 km'], [10000, '10 km']].map(([m, libelle]) => (
          <button
            key={m}
            onClick={() => {
              setRayon(Number(m))
              lancer(Number(m))
            }}
            aria-pressed={rayon === Number(m) && etat === 'pret'}
            className={`min-h-sur-tactile rounded-full px-4 text-note font-[590]
              ${rayon === Number(m) && etat !== 'attente' ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
          >
            {libelle}
          </button>
        ))}
        {cuisinesAimees.length > 0 && etat === 'pret' && (
          <button
            onClick={() => setGouts(!gouts)}
            aria-pressed={gouts}
            className={`min-h-sur-tactile rounded-full px-4 text-note font-[590]
              ${gouts ? 'bg-ambre/25 text-encre' : 'bg-fond-sourd text-encre-2'}`}
          >
            💛 Dans nos goûts
          </button>
        )}
      </div>

      {etat === 'attente' && (
        <EtatVide
          titre="Où es-tu ?"
          message="Choisis un rayon — l’iPhone te demandera alors l’autorisation de position : accepte, et StiGa cherche les tables autour de toi."
        />
      )}
      {etat === 'geoloc' && <p className="py-6 text-center text-corps-2 text-encre-3">📍 Localisation…</p>}
      {/* La carte s'ouvre dès que la position est connue — les tables s'y épinglent à l'arrivée. */}
      {ici && (etat === 'recherche' || etat === 'pret') && (
        <CarteAutour ici={ici} resultats={visibles.slice(0, 30)} enGout={dansNosGouts} />
      )}
      {etat === 'recherche' && (
        <p className="py-2 text-center text-corps-2 text-encre-3">🔎 Les tables arrivent…</p>
      )}
      {etat === 'erreur' && (
        <div className="flex flex-col gap-3 rounded-xl bg-fond-sourd p-4">
          {refusPosition ? (
            <>
              <p className="text-corps-2 font-[590] text-encre">📍 L’iPhone bloque la position de StiGa.</p>
              <ol className="list-decimal space-y-1 pl-5 text-corps-2 text-encre-2">
                <li>
                  <strong>Réglages → Confidentialité et sécurité → Service de localisation</strong> : vérifie
                  qu’il est <strong>activé</strong>, puis descends jusqu’à <strong>Sites web Safari</strong> et
                  choisis <strong>« Lors de l’utilisation de l’app »</strong>.
                </li>
                <li>
                  Le réglage le plus souvent fautif : <strong>Réglages → Safari</strong>, descends à
                  « Réglages pour les sites web » → <strong>Position</strong> → choisis
                  <strong> « Demander »</strong> (surtout pas « Refuser »).
                </li>
                <li>
                  <strong>Ferme complètement StiGa</strong> (balaye vers le haut depuis le bas de l’écran, puis
                  pousse StiGa vers le haut) et <strong>rouvre-la</strong> — puis touche « Réessayer » et accepte la
                  demande.
                </li>
              </ol>
              {essais >= 2 && (
                <p className="rounded-lg bg-ambre/15 p-3 text-corps-2 text-encre-2">
                  Toujours rien après tout ça ? L’iPhone a mémorisé un vieux « non » pour StiGa. Dernier recours :
                  supprime l’icône StiGa de l’écran d’accueil, rouvre le site dans Safari et refais « Ajouter à
                  l’écran d’accueil » — toutes tes données sont dans le nuage, tu ne perds rien.
                </p>
              )}
            </>
          ) : (
            <p className="text-corps-2 text-encre-2">
              Impossible de te localiser ou de chercher — vérifie le réseau, puis réessaie.
            </p>
          )}
          {diagnostic && (
            <p className="text-legende text-encre-3">Diagnostic pour StiGa : {diagnostic}</p>
          )}
          <Bouton pleineLargeur variante="primaire" onClick={() => lancer(rayon)}>
            📍 Réessayer
          </Bouton>
        </div>
      )}

      {etat === 'pret' && (
        <>
          {resultats.length === 0 ? (
            <EtatVide
              titre="Aucune table ici"
              message="Le serveur de cartes n’a rien trouvé dans ce rayon — élargis à 2 ou 10 km, ou réessaie dans un instant."
            />
          ) : (
            <p className="text-legende text-encre-3">
              {visibles.length} table{visibles.length > 1 ? 's' : ''} trouvée{visibles.length > 1 ? 's' : ''}
              {cuisinesAimees.length > 0 ? ` — vos goûts : ${cuisinesAimees.slice(0, 4).join(', ')}` : ''}
            </p>
          )}
          {resultats.length > 0 && (
            <Bouton pleineLargeur variante="primaire" desactive={reflechit} onClick={() => void demanderAvis()}>
              {reflechit ? 'StiGa réfléchit…' : '✨ StiGa, recommande-moi les bonnes tables'}
            </Bouton>
          )}
          {avisStiga && (
            <div className="rounded-lg bg-fond-sourd px-3 py-2">
              <p className="whitespace-pre-wrap text-corps-2 leading-snug text-encre">{avisStiga}</p>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {visibles.slice(0, 30).map((r) => (
              <li key={r.id} className="rounded-xl bg-fond-eleve p-3 shadow-carte">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-corps font-[590] leading-snug text-encre">
                      {dansNosGouts(r) ? '💛 ' : ''}{r.nom}
                    </p>
                    <p className="break-words text-legende text-encre-3">
                      {[r.cuisine, r.distanceM < 1000 ? `${r.distanceM} m` : `${(r.distanceM / 1000).toFixed(1)} km`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <button
                    aria-label={`Mettre ${r.nom} en favori`}
                    disabled={ajoutes.has(r.id)}
                    onClick={() => {
                      navigator.vibrate?.(4)
                      setFavorisAjoutes((s) => new Set(s).add(r.id))
                      setAjoutes((s) => new Set(s).add(r.id))
                      void surAjout(r, true)
                    }}
                    className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[18px]"
                  >
                    {favorisAjoutes.has(r.id) ? '⭐' : '☆'}
                  </button>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}&travelmode=walking`}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Itinéraire vers ${r.nom}`}
                    className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
                  >
                    🧭
                  </a>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.nom)}%20${r.latitude},${r.longitude}`}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Avis Google de ${r.nom}`}
                    className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
                  >
                    💬
                  </a>
                  <Bouton
                    variante="discret"
                    desactive={ajoutes.has(r.id)}
                    onClick={() => {
                      setAjoutes((a) => new Set(a).add(r.id))
                      void surAjout(r)
                    }}
                  >
                    {ajoutes.has(r.id) ? '✓' : '+ Carnet'}
                  </Bouton>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** La mini-carte d'« Autour de moi » : moi en bleu, les tables épinglées autour. */
function CarteAutour({
  ici,
  resultats,
  enGout,
}: {
  ici: [number, number]
  resultats: RestoAutour[]
  enGout: (r: RestoAutour) => boolean
}) {
  const conteneur = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let detruire: (() => void) | null = null
    void (async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (!conteneur.current) return
      const carte = L.map(conteneur.current, { zoomControl: false })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(carte)

      L.circleMarker(ici, { radius: 9, color: '#4a6fa5', fillColor: '#4a6fa5', fillOpacity: 0.9 })
        .addTo(carte)
        .bindPopup('Moi 📍')

      const positions: [number, number][] = [ici]
      for (const r of resultats) {
        positions.push([r.latitude, r.longitude])
        L.marker([r.latitude, r.longitude], {
          icon: L.divIcon({
            className: '',
            html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 3px rgb(0 0 0/.4))">${enGout(r) ? '💛' : '📍'}</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 20],
          }),
        })
          .addTo(carte)
          .bindPopup(
            `<strong>${r.nom}</strong><br>${r.cuisine ?? ''} · ${r.distanceM < 1000 ? `${r.distanceM} m` : `${(r.distanceM / 1000).toFixed(1)} km`}<br>` +
              `<a href="https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}&travelmode=walking" target="_blank" rel="noopener">🧭 Itinéraire</a>`,
          )
      }
      carte.fitBounds(positions, { padding: [30, 30], maxZoom: 16 })
      detruire = () => carte.remove()
    })()
    return () => detruire?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ici[0], ici[1], resultats.length])

  return (
    <div className="overflow-hidden rounded-xl shadow-carte">
      <div ref={conteneur} style={{ height: '34vh' }} aria-label="Carte des tables autour de moi" />
    </div>
  )
}
