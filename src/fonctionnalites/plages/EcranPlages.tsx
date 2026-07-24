// 🏖 La qualité des eaux de baignade autour de la maison (ou de toi) :
// le classement sanitaire officiel (contrôles ARS, ministère de la Santé),
// récupéré par le relais serveur de STG — avec le lien vers le site officiel.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

interface SiteBaignade {
  nom: string
  commune: string
  qualite: string
}

interface ReponseBaignades {
  sites?: SiteBaignade[]
  commune?: string
  lien: string
  erreur?: string
}

interface Webcam {
  titre: string
  ville: string | null
  image: string | null
  lien: string | null
}

// La pastille de qualité : on matche le TEXTE du classement officiel,
// insensible à la casse — « insuffisant » d'abord, il contient « suffisant ».
const teinteQualite = (qualite: string): { couleur: string; dose: number } => {
  const q = qualite.toLowerCase()
  if (q.includes('insuffisant')) return { couleur: 'var(--urgent)', dose: 16 }
  if (q.includes('excellent')) return { couleur: 'var(--sauge)', dose: 20 }
  if (q.includes('bon')) return { couleur: 'var(--sauge)', dose: 9 } // sauge claire
  if (q.includes('suffisant')) return { couleur: 'var(--ambre)', dose: 16 }
  return { couleur: 'var(--encre-3)', dose: 12 }
}

function PastilleQualite({ qualite }: { qualite: string }) {
  const { couleur, dose } = teinteQualite(qualite)
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-legende font-[700]"
      style={{ color: couleur, background: `color-mix(in srgb, ${couleur} ${dose}%, transparent)` }}
    >
      {qualite}
    </span>
  )
}

export function EcranPlages() {
  const { foyer } = utiliserSession()
  const maison = (foyer?.reglages['maison'] ?? null) as { lat?: number; lon?: number; adresse?: string } | null

  // La maison d'abord ; sinon le GPS du téléphone (position exacte demandée —
  // l'approximative peut être à 100 km de la bonne plage).
  const obtenirPosition = async (): Promise<{ lat: number; lon: number }> => {
    if (maison?.lat !== undefined && maison.lon !== undefined) return { lat: maison.lat, lon: maison.lon }
    return new Promise((resoudre, rejeter) => {
      if (!navigator.geolocation) {
        rejeter(new Error('pas de GPS ici — renseigne la maison dans le Radar de départ'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resoudre({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => rejeter(new Error('position refusée — autorise la localisation, ou renseigne la maison dans le Radar de départ')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      )
    })
  }

  const plages = useQuery({
    queryKey: ['plages'],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<ReponseBaignades> => {
      const { lat, lon } = await obtenirPosition()
      const { data: session } = await supabase.auth.getSession()
      const r = await fetch('/api/chercher-resto', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ mode: 'baignades', lat, lon }),
      })
      if (!r.ok) throw new Error(`relais ${r.status}`)
      const donnees = (await r.json()) as ReponseBaignades
      if (donnees.erreur) throw new Error(donnees.erreur)
      return donnees
    },
  })

  // 📷 Les webcams autour (Windy) : voir la mer EN VRAI avant de partir.
  const webcams = useQuery({
    queryKey: ['plages-webcams'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ webcams?: Webcam[]; erreur?: string }> => {
      const { lat, lon } = await obtenirPosition()
      const { data: session } = await supabase.auth.getSession()
      const r = await fetch('/api/chercher-resto', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ mode: 'webcams', lat, lon }),
      })
      if (!r.ok) throw new Error(`relais ${r.status}`)
      return (await r.json()) as { webcams?: Webcam[]; erreur?: string }
    },
  })

  const sites = plages.data?.sites ?? []

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🏖 Les Plages</h1>
        <p className="text-legende text-encre-3">
          La qualité officielle des eaux de baignade (contrôles sanitaires ARS),
          {maison?.lat !== undefined ? ' autour de la maison.' : ' autour de toi.'}
        </p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {plages.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">🏖 Relevé des sites de baignade…</p>}
        {plages.isError && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-corps-2 text-encre-3">
              Les sites de baignade ne répondent pas.
              <br />
              <span className="text-legende">Diagnostic pour STG : {String(plages.error instanceof Error ? plages.error.message : plages.error).slice(0, 90)}</span>
            </p>
            <Bouton pleineLargeur variante="primaire" onClick={() => void plages.refetch()}>
              🔄 Réessayer
            </Bouton>
          </div>
        )}

        {sites.map((s, i) => (
          <Carte key={`${s.nom}-${i}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-corps-2 font-[590] text-encre">{s.nom}</p>
                <p className="text-legende text-encre-3">{s.commune}</p>
              </div>
              <PastilleQualite qualite={s.qualite} />
            </div>
          </Carte>
        ))}

        {/* Aucun site listé SANS erreur : les contrôles sont saisonniers — le
            détail se consulte sur le site officiel, on y emmène directement. */}
        {plages.data && sites.length === 0 && (
          <Carte>
            <p className="text-corps-2 text-encre-2">
              Pas de classement à afficher ici pour l'instant
              {plages.data.commune ? ` (commune repérée : ${plages.data.commune})` : ''} — les contrôles
              des eaux de baignade sont saisonniers, et le détail se consulte sur le site officiel du
              ministère de la Santé.
            </p>
          </Carte>
        )}

        {plages.data?.lien && (
          <a
            href={plages.data.lien}
            target="_blank"
            rel="noopener"
            className="btn-3d btn-ardoise inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2"
          >
            🌊 Le détail sur le site officiel des eaux de baignade
          </a>
        )}

        {/* 📷 Les webcams : la mer en direct avant de charger la voiture. */}
        {(webcams.data?.webcams ?? []).length > 0 && (
          <>
            <h2 className="mt-2 text-corps font-[590] text-encre">📷 La mer en direct (webcams)</h2>
            <div className="grid grid-cols-2 gap-2">
              {(webcams.data?.webcams ?? []).filter((w) => w.image).slice(0, 8).map((w, i) => (
                <a
                  key={`${w.titre}-${i}`}
                  href={w.lien ?? undefined}
                  target="_blank"
                  rel="noopener"
                  className="overflow-hidden rounded-xl bg-fond-eleve shadow-carte"
                >
                  <img src={w.image ?? ''} alt={w.titre} loading="lazy" className="h-24 w-full object-cover" />
                  <p className="truncate px-2 py-1.5 text-legende text-encre-2">{w.titre}{w.ville ? ` · ${w.ville}` : ''}</p>
                </a>
              ))}
            </div>
            <p className="text-legende text-encre-3">Images Windy Webcams — touche une vignette pour la vue en direct.</p>
          </>
        )}
        {webcams.data?.erreur === 'cle_absente' && (
          <Carte>
            <p className="text-corps-2 text-encre-2">
              📷 Pour voir la mer en direct ici (webcams des plages et du port) : crée une clé gratuite sur
              api.windy.com/webcams, puis ajoute-la dans Vercel → Settings → Environment Variables sous le nom{' '}
              <span className="chiffres font-[590]">WINDY_WEBCAMS_KEY</span>.
            </p>
          </Carte>
        )}
      </div>
    </div>
  )
}
