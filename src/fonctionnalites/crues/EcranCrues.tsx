// 🌊 Les cours d'eau autour de la maison : hauteurs mesurées EN TEMPS RÉEL
// par les stations du réseau Vigicrues (données Hub'Eau, service public) —
// avec la tendance sur 24 h et le lien vers la carte officielle.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

interface StationCrue {
  code: string
  nom: string
  cours: string | null
  hauteurM: number | null
  variation24hCm: number | null
  mesureA: string | null
}

// Un chemin qui trouve les stations mais AUCUNE mesure n'a pas « gagné » :
// on laisse sa chance à l'autre chemin, et on garde sa liste en secours.
class SansMesures extends Error {
  constructor(public stations: StationCrue[]) {
    super('stations sans mesures')
  }
}

const exigerMesures = (stations: StationCrue[]): StationCrue[] => {
  if (stations.length > 0 && stations.every((s) => s.hauteurM === null)) throw new SansMesures(stations)
  return stations
}

export function EcranCrues() {
  const { foyer } = utiliserSession()
  const maison = (foyer?.reglages['maison'] ?? null) as { lat?: number; lon?: number; adresse?: string } | null

  // DEUX chemins interrogés EN MÊME TEMPS — le premier qui répond gagne :
  // le relais serveur de STG, ET l'appel direct à Hub'Eau depuis le téléphone
  // (leur pare-feu bloque parfois les serveurs, mais pas les navigateurs).
  const viaRelais = async (): Promise<StationCrue[]> => {
    const { data: session } = await supabase.auth.getSession()
    const r = await fetch('/api/chercher-resto', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ mode: 'crues', lat: maison?.lat, lon: maison?.lon }),
    })
    if (!r.ok) throw new Error(`relais ${r.status}`)
    const donnees = (await r.json()) as { stations?: StationCrue[]; erreur?: string }
    if (donnees.erreur) throw new Error(donnees.erreur)
    return donnees.stations ?? []
  }

  const viaDirect = async (): Promise<StationCrue[]> => {
    const r = await fetch(
      `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?latitude=${maison?.lat}&longitude=${maison?.lon}&distance=25&size=8&format=json`,
      { signal: AbortSignal.timeout(12000) },
    )
    if (!r.ok) throw new Error(`direct ${r.status}`)
    const donnees = (await r.json()) as {
      data?: { code_station: string; libelle_station: string; libelle_cours_eau?: string | null; en_service?: boolean }[]
    }
    const actives = (donnees.data ?? []).filter((s) => s.en_service !== false).slice(0, 5)
    return Promise.all(
      actives.map(async (s): Promise<StationCrue> => {
        try {
          let obs = await fetch(
            `https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tp?code_entite=${s.code_station}&grandeur_hydro=H&size=300&sort=desc`,
            { signal: AbortSignal.timeout(12000) },
          )
          // Les mesures peuvent réussir sur une version et pas l'autre.
          if (!obs.ok) {
            obs = await fetch(
              `https://hubeau.eaufrance.fr/api/v1/hydrometrie/observations_tp?code_entite=${s.code_station}&grandeur_hydro=H&size=300&sort=desc`,
              { signal: AbortSignal.timeout(12000) },
            )
          }
          const mesures = obs.ok
            ? (((await obs.json()) as { data?: { resultat_obs: number; date_obs: string }[] }).data ?? [])
            : []
          const derniere = mesures[0]
          const cible = Date.now() - 24 * 3600 * 1000
          const ancienne = [...mesures].sort(
            (a, b) => Math.abs(new Date(a.date_obs).getTime() - cible) - Math.abs(new Date(b.date_obs).getTime() - cible),
          )[0]
          return {
            code: s.code_station,
            nom: s.libelle_station,
            cours: s.libelle_cours_eau ?? null,
            hauteurM: derniere ? derniere.resultat_obs / 1000 : null,
            variation24hCm:
              derniere && ancienne && ancienne !== derniere
                ? Math.round((derniere.resultat_obs - ancienne.resultat_obs) / 10)
                : null,
            mesureA: derniere?.date_obs ?? null,
          }
        } catch {
          return { code: s.code_station, nom: s.libelle_station, cours: s.libelle_cours_eau ?? null, hauteurM: null, variation24hCm: null, mesureA: null }
        }
      }),
    )
  }

  const stations = useQuery({
    queryKey: ['crues', maison?.lat],
    enabled: maison?.lat !== undefined,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<StationCrue[]> => {
      try {
        return await Promise.any([viaRelais().then(exigerMesures), viaDirect().then(exigerMesures)])
      } catch (e) {
        const causes = e instanceof AggregateError ? e.errors : [e]
        // Aucun chemin n'a de mesures, mais l'un a au moins la liste : on l'affiche.
        const secours = causes.find((c): c is SansMesures => c instanceof SansMesures)
        if (secours) return secours.stations
        // Les deux ont vraiment échoué : diagnostic complet.
        throw new Error(causes.map((c) => (c instanceof Error ? c.message : String(c))).join(' · '))
      }
    },
  })

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🌊 Les cours d'eau</h1>
        <p className="text-legende text-encre-3">Hauteurs en temps réel, réseau Vigicrues (25 km autour de la maison).</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {!maison?.lat && (
          <EtatVide
            titre="La maison d'abord"
            message="Renseigne l'adresse de la maison dans le Radar de départ — les stations de mesure autour de chez vous apparaîtront ici."
          />
        )}
        {stations.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">🌊 Relevé des stations…</p>}
        {stations.isError && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-corps-2 text-encre-3">
              Les stations ne répondent pas.
              <br />
              <span className="text-legende">Diagnostic pour STG : {String(stations.error instanceof Error ? stations.error.message : stations.error).slice(0, 90)}</span>
            </p>
            <Bouton pleineLargeur variante="primaire" onClick={() => void stations.refetch()}>
              🔄 Réessayer
            </Bouton>
          </div>
        )}
        {stations.data?.length === 0 && (
          <EtatVide titre="Aucune station à moins de 25 km" message="Bonne nouvelle : pas de rivière instrumentée tout près = risque de crue limité chez vous." />
        )}

        {(stations.data ?? []).map((s) => (
          <Carte key={s.code}>
            <p className="break-words text-corps-2 font-[590] text-encre">{s.cours ?? 'Cours d’eau'} — {s.nom}</p>
            {s.hauteurM !== null ? (
              <p className="chiffres mt-1 text-titre-3 text-encre">
                {s.hauteurM.toFixed(2).replace('.', ',')} m
                {s.variation24hCm !== null && (
                  <span className={`ml-2 text-corps-2 ${s.variation24hCm > 10 ? 'font-[700] text-urgent' : s.variation24hCm > 0 ? 'text-ambre' : 'text-fait'}`}>
                    {s.variation24hCm > 0 ? '↗' : s.variation24hCm < 0 ? '↘' : '→'} {Math.abs(s.variation24hCm)} cm / 24 h
                  </span>
                )}
              </p>
            ) : (
              <p className="text-legende text-encre-3">mesure momentanément indisponible</p>
            )}
            {s.variation24hCm !== null && s.variation24hCm > 20 && (
              <p className="mt-1 rounded-lg bg-urgent/10 px-2 py-1 text-legende font-[590] text-urgent">
                ⚠️ Montée rapide — consulte la vigilance officielle ci-dessous.
              </p>
            )}
            {s.mesureA && (
              <p className="text-legende text-encre-3">
                relevé {new Date(s.mesureA).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </Carte>
        ))}

        <a
          href="https://www.vigicrues.gouv.fr"
          target="_blank"
          rel="noopener"
          className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2"
        >
          🗺 La carte de vigilance officielle Vigicrues
        </a>
      </div>
    </div>
  )
}
