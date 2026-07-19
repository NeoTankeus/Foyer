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

/** Cherche le restaurant sur OpenStreetMap : adresse, GPS, téléphone, site. */
async function chercherSurOsm(nom: string, ville: string): Promise<ResultatOsm | null> {
  try {
    const q = encodeURIComponent(`${nom} ${ville}`.trim())
    const reponse = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=1&extratags=1&addressdetails=1&accept-language=fr`,
      { headers: { accept: 'application/json' } },
    )
    if (!reponse.ok) return null
    const donnees = (await reponse.json()) as ResultatOsm[]
    return donnees[0] ?? null
  } catch {
    return null
  }
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
  const [vue, setVue] = useState<'liste' | 'carte'>('liste')
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
        <Bouton variante="discret" onClick={() => setVue(vue === 'liste' ? 'carte' : 'liste')}>
          {vue === 'liste' ? '🗺 Carte' : '📋 Liste'}
        </Bouton>
        <Bouton variante="valider" onClick={() => setCreation(true)} etiquette="Ajouter un restaurant">+</Bouton>
      </div>
      <p className="pb-3 text-note text-encre-3">
        Nos adresses, nos notes, la carte du menu — et la carte du monde pour les retrouver.
      </p>

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
              <li key={r.id}>
                <button
                  onClick={() => setOuvert(r)}
                  className="w-full rounded-xl bg-fond-eleve p-4 text-left shadow-carte"
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-[590] text-encre">
                        {r.favori ? '⭐ ' : ''}{r.nom}
                      </p>
                      <p className="truncate text-legende text-encre-3">
                        {[r.ville, r.cuisine].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {r.note !== null && <Etoiles note={r.note} />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {vue === 'carte' && <CarteMonde restaurants={restaurants.data ?? []} surChoix={(r) => setOuvert(r)} />}

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
        <a href={`https://www.thefork.fr/search?queryText=${q}`} target="_blank" rel="noopener" className="btn-3d btn-ardoise inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 leading-tight">
          🍴 Réserver (TheFork)
        </a>
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
            🔎 Chercher la carte sur internet
          </Bouton>
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
