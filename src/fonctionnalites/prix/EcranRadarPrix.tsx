// 📉 Radar prix courses : tes produits habituels (déjà scannés dans Courses
// et Placards) surveillés via Open Prices — les prix relevés en magasin par
// la communauté Open Food Facts, magasin par magasin.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

interface ReleveProduit {
  code: string
  libelle: string
  image: string | null
  releves: { prix: number; date: string; magasin: string }[]
}

async function relevesPour(code: string): Promise<ReleveProduit['releves']> {
  try {
    const r = await fetch(
      `https://prices.openfoodfacts.org/api/v1/prices?product_code=${encodeURIComponent(code)}&order_by=-date&size=5`,
      { headers: { accept: 'application/json' } },
    )
    if (!r.ok) return []
    const donnees = (await r.json()) as {
      items?: {
        price?: number
        currency?: string
        date?: string
        location?: { osm_name?: string; osm_display_name?: string } | null
      }[]
    }
    return (donnees.items ?? [])
      .filter((i) => typeof i.price === 'number' && (i.currency ?? 'EUR') === 'EUR')
      .map((i) => ({
        prix: i.price ?? 0,
        date: i.date ?? '',
        magasin: i.location?.osm_name ?? i.location?.osm_display_name?.split(',')[0] ?? 'magasin inconnu',
      }))
  } catch {
    return []
  }
}

export function EcranRadarPrix() {
  const produits = useQuery({
    queryKey: ['radar-prix'],
    staleTime: 3600 * 1000,
    queryFn: async (): Promise<ReleveProduit[]> => {
      // Tes produits scannés dans Placards & congélo (code-barres connu).
      const inventaire = await supabase
        .from('inventaire')
        .select('libelle,code_barres,image_url')
        .not('code_barres', 'is', null)
      const vus = new Set<string>()
      const candidats: { code: string; libelle: string; image: string | null }[] = []
      for (const p of (inventaire.data ?? []) as {
        libelle: string
        code_barres: string | null
        image_url: string | null
      }[]) {
        if (!p.code_barres || vus.has(p.code_barres)) continue
        vus.add(p.code_barres)
        candidats.push({ code: p.code_barres, libelle: p.libelle, image: p.image_url })
      }
      const resultats = await Promise.all(
        candidats.slice(0, 12).map(async (c) => ({ ...c, releves: await relevesPour(c.code) })),
      )
      return resultats
    },
  })

  const avecReleves = (produits.data ?? []).filter((p) => p.releves.length > 0)
  const sansReleves = (produits.data ?? []).filter((p) => p.releves.length === 0)

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">📉 Radar prix</h1>
        <p className="text-legende text-encre-3">Tes produits scannés, aux prix relevés en magasin.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {produits.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">📡 STG relève les prix…</p>}

        {!produits.isLoading && (produits.data ?? []).length === 0 && (
          <EtatVide
            titre="Aucun produit scanné"
            message="Scanne quelques produits avec le scanner des Courses ou des Placards — leurs prix en magasin apparaîtront ici."
          />
        )}

        {avecReleves.map((p) => {
          const meilleur = [...p.releves].sort((a, b) => a.prix - b.prix)[0]
          return (
            <Carte key={p.code}>
              <div className="flex items-start gap-3">
                {p.image && <img src={p.image} alt="" className="h-14 w-14 rounded-lg object-contain" />}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-corps-2 font-[590] leading-snug text-encre">{p.libelle}</p>
                  {meilleur && (
                    <p className="text-legende text-fait">
                      🏆 Vu à {meilleur.prix.toFixed(2).replace('.', ',')} € ({meilleur.magasin})
                    </p>
                  )}
                  <ul className="mt-1">
                    {p.releves.slice(0, 3).map((r, i) => (
                      <li key={i} className="flex justify-between text-legende text-encre-3">
                        <span className="truncate">{r.magasin}</span>
                        <span className="chiffres shrink-0">
                          {r.prix.toFixed(2).replace('.', ',')} € · {r.date ? new Date(`${r.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Carte>
          )
        })}

        {sansReleves.length > 0 && (
          <p className="text-legende text-encre-3">
            Pas encore de relevé communautaire pour : {sansReleves.map((p) => p.libelle).slice(0, 6).join(', ')}
            {sansReleves.length > 6 ? '…' : ''} — les prix arrivent au fur et à mesure que la communauté Open Food Facts les scanne en rayon.
          </p>
        )}
      </div>
    </div>
  )
}
