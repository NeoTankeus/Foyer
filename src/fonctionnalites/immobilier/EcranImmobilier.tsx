// 🏠 Les VRAIES ventes immobilières du quartier : la base DVF (Demandes de
// Valeurs Foncières) publie chaque acte notarié — prix, surface, date — en
// open data. Le relais serveur ramène les ventes à 400 m de la maison.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

interface VenteDvf {
  date: string
  prix: number
  surface: number
  prixM2: number
  type: string
  adresse: string
}

// Prix médian (pas moyen : une vente de château ne doit pas tout fausser).
const mediane = (valeurs: number[]): number | null => {
  if (valeurs.length === 0) return null
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  const centre = tri[milieu]
  if (centre === undefined) return null
  return tri.length % 2 === 1 ? centre : ((tri[milieu - 1] ?? centre) + centre) / 2
}

const enEuros = (n: number) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('fr-FR')} €` : '—')
const moisAn = (date: string | null | undefined) => {
  const d = new Date(date ?? NaN)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}
const jourMoisAn = (date: string | null | undefined) => {
  const d = new Date(date ?? NaN)
  return Number.isNaN(d.getTime()) ? 'date inconnue' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// DVF est de l'open data brut : type, adresse, date ou prix peuvent manquer
// sur un acte. On remet chaque vente en forme avant de la manipuler.
const venteSure = (v: unknown): VenteDvf => {
  const b = (v && typeof v === 'object' ? v : {}) as Partial<VenteDvf>
  const nombre = (x: unknown) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN
    return Number.isFinite(n) ? n : NaN
  }
  return {
    date: typeof b.date === 'string' ? b.date : '',
    prix: nombre(b.prix),
    surface: nombre(b.surface),
    prixM2: nombre(b.prixM2),
    type: String(b.type ?? 'Bien'),
    adresse: String(b.adresse ?? ''),
  }
}

export function EcranImmobilier() {
  const { foyer } = utiliserSession()
  const maison = (foyer?.reglages['maison'] ?? null) as { lat?: number; lon?: number; adresse?: string } | null

  const ventes = useQuery({
    queryKey: ['immobilier'],
    enabled: maison?.lat !== undefined && maison?.lon !== undefined,
    staleTime: 24 * 3600 * 1000, // la base DVF n'est mise à jour que 2 fois par an
    queryFn: async (): Promise<VenteDvf[]> => {
      const { data: session } = await supabase.auth.getSession()
      const r = await fetch('/api/chercher-resto', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ mode: 'dvf', lat: maison?.lat, lon: maison?.lon, rayon: 400 }),
      })
      if (!r.ok) throw new Error(`relais ${r.status}`)
      const donnees = (await r.json()) as { ventes?: VenteDvf[]; erreur?: string }
      if (donnees.erreur) throw new Error(donnees.erreur)
      return (Array.isArray(donnees.ventes) ? donnees.ventes : []).map(venteSure)
    },
  })

  // La synthèse se calcule ICI, sur les prix/m² plausibles (500 à 20 000 €) —
  // DVF contient des ventes de caves ou de lots entiers qui fausseraient tout.
  const liste = ventes.data ?? []
  const fiables = liste.filter((v) => v.prixM2 >= 500 && v.prixM2 <= 20000)
  const medianeAppart = mediane(fiables.filter((v) => String(v.type ?? '').toLowerCase().includes('appartement')).map((v) => v.prixM2))
  const medianeMaison = mediane(fiables.filter((v) => String(v.type ?? '').toLowerCase().includes('maison')).map((v) => v.prixM2))
  const dates = liste.map((v) => v.date).filter((d) => d !== '').sort()
  const premiere = dates[0]
  const derniere = dates[dates.length - 1]

  // Les plus récentes d'abord ; on s'arrête à 40, au-delà personne ne lit.
  const affichees = [...liste].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 40)

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🏠 Autour de chez nous</h1>
        <p className="text-legende text-encre-3">Les vraies ventes immobilières à 400 m de la maison.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {maison?.lat === undefined && (
          <EtatVide
            titre="La maison d'abord"
            message="Renseigne l'adresse de la maison dans le Radar de départ — les ventes du quartier apparaîtront ici."
          />
        )}
        {ventes.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">🏠 Lecture des actes notariés…</p>}
        {ventes.isError && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-corps-2 text-encre-3">
              Les ventes ne répondent pas.
              <br />
              <span className="text-legende">Diagnostic pour STG : {String(ventes.error instanceof Error ? ventes.error.message : ventes.error).slice(0, 90)}</span>
            </p>
            <Bouton pleineLargeur variante="primaire" onClick={() => void ventes.refetch()}>
              🔄 Réessayer
            </Bouton>
          </div>
        )}
        {ventes.data?.length === 0 && (
          <EtatVide
            titre="Aucune vente enregistrée à 400 m"
            message="Quartier stable — personne ne vend autour de chez vous sur la période couverte par DVF."
          />
        )}

        {/* LA grande carte de synthèse : le quartier en un coup d'œil. */}
        {liste.length > 0 && (
          <Carte>
            <h2 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">Le quartier en chiffres</h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-legende text-encre-3">Appartement</p>
                <p className="chiffres text-titre-3 text-encre">
                  {medianeAppart !== null ? `${enEuros(medianeAppart)}/m²` : '—'}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-legende text-encre-3">Maison</p>
                <p className="chiffres text-titre-3 text-encre">
                  {medianeMaison !== null ? `${enEuros(medianeMaison)}/m²` : '—'}
                </p>
              </div>
            </div>
            <p className="mt-2 text-legende text-encre-3">
              Prix médians au m² · {liste.length} vente{liste.length > 1 ? 's' : ''}
              {premiere && derniere ? ` · de ${moisAn(premiere)} à ${moisAn(derniere)}` : ''}
            </p>
          </Carte>
        )}

        {affichees.map((v, i) => (
          <Carte key={`${v.date}-${v.adresse}-${i}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-corps-2 font-[590] text-encre">{v.type}</p>
              <p className="shrink-0 text-legende text-encre-3">{jourMoisAn(v.date)}</p>
            </div>
            <p className="break-words text-legende text-encre-3">{v.adresse}</p>
            <p className="chiffres mt-1 text-corps-2 text-encre">
              {enEuros(v.prix)}
              <span className="text-encre-3"> · {Number.isFinite(v.surface) ? `${Math.round(v.surface)} m²` : '— m²'} · {enEuros(v.prixM2)}/m²</span>
            </p>
          </Carte>
        ))}

        {liste.length > 0 && (
          <p className="text-center text-legende text-encre-3">Données DVF (data.gouv.fr), actes notariés réels.</p>
        )}
      </div>
    </div>
  )
}
