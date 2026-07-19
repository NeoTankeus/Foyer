// 💊 Pharmacies : les plus proches avec téléphone, horaires et itinéraire —
// et le réflexe officiel « de garde » (3237). Trois façons de se situer :
// la maison (instantané), le GPS précis, ou une ville mémorisée.
import { useEffect, useState } from 'react'
import { utiliserSession } from '@/etat/session'
import { chercherLieux, type LieuAutour } from '@/lib/lieux'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

const CLE_VILLE = 'stg-pharmacies-ville'

interface PointVille { nom: string; lat: number; lon: number }

async function geocoderVille(nom: string): Promise<PointVille | null> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nom)}&count=1&language=fr&format=json`,
    )
    if (!r.ok) return null
    const d = (await r.json()) as { results?: { name: string; latitude: number; longitude: number }[] }
    const premier = d.results?.[0]
    return premier ? { nom: premier.name, lat: premier.latitude, lon: premier.longitude } : null
  } catch {
    return null
  }
}

export function EcranPharmacies() {
  const { foyer } = utiliserSession()
  const maison = (foyer?.reglages['maison'] ?? null) as { adresse?: string; lat?: number; lon?: number } | null
  const [villeMemo, setVilleMemo] = useState<PointVille | null>(() => {
    try { return JSON.parse(localStorage.getItem(CLE_VILLE) ?? 'null') as PointVille | null } catch { return null }
  })
  const [source, setSource] = useState<'maison' | 'gps' | 'ville' | null>(null)
  const [saisieVille, setSaisieVille] = useState('')
  const [etat, setEtat] = useState<'attente' | 'cherche' | 'pret' | 'erreur'>('attente')
  const [pharmacies, setPharmacies] = useState<LieuAutour[]>([])
  const [erreur, setErreur] = useState('')

  const chercherDepuis = (lat: number, lon: number) => {
    setEtat('cherche')
    chercherLieux(lat, lon, 5000, 'pharmacy', 'pharmacies')
      .then((liste) => {
        setPharmacies(liste)
        setEtat('pret')
      })
      .catch((e: unknown) => {
        setErreur(String(e instanceof Error ? e.message : e))
        setEtat('erreur')
      })
  }

  const depuisMaison = () => {
    if (!maison?.lat || !maison.lon) return
    setSource('maison')
    chercherDepuis(maison.lat, maison.lon)
  }

  const depuisGps = () => {
    setSource('gps')
    setEtat('cherche')
    // Position EXACTE demandée — la position approximative peut être à 100 km.
    navigator.geolocation?.getCurrentPosition(
      (pos) => chercherDepuis(pos.coords.latitude, pos.coords.longitude),
      () => {
        setErreur('Position refusée — autorise la localisation, ou utilise « La maison » / une ville.')
        setEtat('erreur')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  }

  const depuisVille = async (nom?: string) => {
    setSource('ville')
    const cible = nom ? await geocoderVille(nom) : villeMemo
    if (!cible) {
      setErreur('Ville introuvable — vérifie l’orthographe.')
      setEtat('erreur')
      return
    }
    setVilleMemo(cible)
    localStorage.setItem(CLE_VILLE, JSON.stringify(cible))
    setSaisieVille('')
    chercherDepuis(cible.lat, cible.lon)
  }

  // À l'ouverture : la maison si on la connaît — instantané et jamais faux.
  useEffect(() => {
    if (maison?.lat && maison.lon) depuisMaison()
    else if (villeMemo) void depuisVille()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dimancheOuSoir = (() => {
    const maintenant = new Date()
    return maintenant.getDay() === 0 || maintenant.getHours() >= 20 || maintenant.getHours() < 8
  })()

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">💊 Pharmacies</h1>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="flex flex-wrap gap-2">
          {maison?.lat && (
            <button
              onClick={depuisMaison}
              aria-pressed={source === 'maison'}
              className={`min-h-sur-tactile rounded-full px-4 text-note font-[590]
                ${source === 'maison' ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              🏡 La maison
            </button>
          )}
          <button
            onClick={depuisGps}
            aria-pressed={source === 'gps'}
            className={`min-h-sur-tactile rounded-full px-4 text-note font-[590]
              ${source === 'gps' ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
          >
            📍 Ma position
          </button>
          {villeMemo && (
            <button
              onClick={() => void depuisVille()}
              aria-pressed={source === 'ville'}
              className={`min-h-sur-tactile rounded-full px-4 text-note font-[590]
                ${source === 'ville' ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              🏙 {villeMemo.nom}
            </button>
          )}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (saisieVille.trim()) void depuisVille(saisieVille.trim())
          }}
        >
          <input
            value={saisieVille}
            onChange={(e) => setSaisieVille(e.target.value)}
            placeholder="Ou tape une ville (mémorisée)…"
            aria-label="Chercher les pharmacies d'une ville"
            className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
          />
          <Bouton type="submit" variante="valider" desactive={!saisieVille.trim()}>OK</Bouton>
        </form>

        <Carte>
          <p className="text-corps-2 font-[590] text-encre">🌙 Besoin d'une pharmacie DE GARDE (nuit, dimanche, férié) ?</p>
          <p className="mt-1 text-corps-2 text-encre-2">
            Le service officiel, partout en France : appelle le <strong>32 37</strong> (0,35 €/min) — il te donne LA
            pharmacie de garde du moment.
          </p>
          <a
            href="tel:3237"
            className={`btn-3d btn-clair mt-2 inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 ${dimancheOuSoir ? 'font-[700]' : ''}`}
          >
            📞 Appeler le 32 37
          </a>
        </Carte>

        {etat === 'cherche' && <p className="py-6 text-center text-corps-2 text-encre-3">💊 Recherche des pharmacies…</p>}
        {etat === 'erreur' && (
          <div className="flex flex-col gap-2">
            <p className="text-corps-2 text-encre-2">{erreur}</p>
            {source === 'gps' && (
              <p className="text-legende text-encre-3">
                💡 Si « Ma position » te place dans une mauvaise ville : Réglages → Confidentialité et sécurité →
                Service de localisation → Sites web Safari → active <strong>« Position exacte »</strong>.
              </p>
            )}
          </div>
        )}
        {etat === 'pret' && pharmacies.length === 0 && (
          <EtatVide titre="Aucune pharmacie à moins de 5 km" message="Le 32 37 reste ton meilleur allié." />
        )}

        {etat === 'pret' && source === 'gps' && pharmacies.length > 0 && (
          <p className="text-legende text-encre-3">
            📍 Autour de ta position GPS. Mauvaise ville ? Active « Position exacte » (Réglages → Service de
            localisation → Sites web Safari) ou utilise 🏡 La maison.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {pharmacies.slice(0, 12).map((p) => (
            <li key={p.id} className="rounded-xl bg-fond-eleve p-3 shadow-carte">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-corps-2 font-[590] leading-snug text-encre">{p.nom}</p>
                  <p className="text-legende text-encre-3">
                    {p.distanceM < 1000 ? `${p.distanceM} m` : `${(p.distanceM / 1000).toFixed(1)} km`}
                    {p.horaires ? ` · ${p.horaires.slice(0, 60)}` : ''}
                  </p>
                </div>
                {p.telephone && (
                  <a
                    href={`tel:${p.telephone.replace(/[\s.-]/g, '')}`}
                    aria-label={`Appeler ${p.nom}`}
                    className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
                  >
                    📞
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}&travelmode=driving`}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Itinéraire vers ${p.nom}`}
                  className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
                >
                  🧭
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
