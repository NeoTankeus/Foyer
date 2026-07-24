// 🧭 Week-end surprise : donne un budget et un rayon de kilomètres — STG
// combine la météo du week-end, les vacances scolaires, vos goûts (restos
// favoris, souvenirs) et te sort un programme clé en main.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { demanderAStiga } from '@/lib/stiga'
import { previsions, villeMeteo, iconeMeteo } from '@/lib/meteo'
import { prochainesVacances } from '@/lib/scolaire'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

const BUDGETS = [
  { cle: 0, libelle: '0 € (gratuit !)' },
  { cle: 50, libelle: '~50 €' },
  { cle: 150, libelle: '~150 €' },
  { cle: 400, libelle: '~400 € (avec nuit)' },
]
const RAYONS = [
  { cle: 20, libelle: '20 km' },
  { cle: 60, libelle: '1 h de route' },
  { cle: 150, libelle: '150 km' },
  { cle: 400, libelle: 'On part loin !' },
]

interface Sortie { titre: string; lieu: string; quand: string; url: string }

export function EcranWeekend() {
  const { foyer } = utiliserSession()
  const maison = (foyer?.reglages['maison'] ?? null) as { adresse?: string; lat?: number; lon?: number } | null
  const ville = villeMeteo()
  // Le centre de recherche des sorties : la maison, sinon la ville de la météo.
  const centre =
    maison && maison.lat !== undefined && maison.lon !== undefined
      ? { lat: maison.lat, lon: maison.lon }
      : ville
        ? { lat: ville.latitude, lon: ville.longitude }
        : null
  const [budget, setBudget] = useState(50)
  const [rayon, setRayon] = useState(60)
  const [programme, setProgramme] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const gouts = useQuery({
    queryKey: ['weekend-gouts'],
    staleTime: 3600 * 1000,
    queryFn: async () => {
      const [restos, souvenirs] = await Promise.all([
        supabase.from('restaurants').select('nom,cuisine,favori,note').or('favori.eq.true,note.gte.4').limit(10),
        supabase.from('souvenirs').select('lieu,titre').not('lieu', 'is', null).limit(12),
      ])
      return {
        restos: (restos.data ?? []).map((r) => `${r.nom} (${r.cuisine ?? '?'})`).join(' · '),
        lieux: [...new Set((souvenirs.data ?? []).map((s) => s.lieu).filter(Boolean))].join(' · '),
      }
    },
  })

  // 🎪 Les sorties annoncées près de chez vous samedi et dimanche (relais OpenAgenda).
  const sorties = useQuery({
    queryKey: ['weekend-sorties', centre?.lat, centre?.lon],
    enabled: centre !== null,
    staleTime: 3600 * 1000,
    queryFn: async (): Promise<{ sansCle: true } | { sansCle: false; evenements: Sortie[] }> => {
      // Samedi prochain à 0 h → dimanche soir (calcul local, samedi = jour 6).
      const debut = new Date()
      debut.setHours(0, 0, 0, 0)
      debut.setDate(debut.getDate() + ((6 - debut.getDay() + 7) % 7))
      const fin = new Date(debut)
      fin.setDate(fin.getDate() + 1)
      fin.setHours(23, 59, 59, 999)
      const { data: session } = await supabase.auth.getSession()
      const r = await fetch('/api/chercher-resto', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          mode: 'sorties',
          lat: centre?.lat,
          lon: centre?.lon,
          debut: debut.toISOString(),
          fin: fin.toISOString(),
        }),
      })
      if (!r.ok) throw new Error(`relais ${r.status}`)
      const d = (await r.json()) as { evenements?: Sortie[]; erreur?: string }
      if (d.erreur === 'cle_absente') return { sansCle: true }
      if (d.erreur) throw new Error(d.erreur)
      return { sansCle: false, evenements: d.evenements ?? [] }
    },
  })

  const dateSortie = (brut: string) => {
    const d = new Date(brut)
    return Number.isNaN(d.getTime())
      ? brut
      : d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  }

  const surprendre = async () => {
    setEnCours(true)
    setErreur(null)
    setProgramme(null)
    try {
      const meteo = await previsions().catch(() => [])
      const vacances = (await prochainesVacances().catch(() => []))[0]
      const ciel = meteo
        .map((j) => `${new Date(j.date).toLocaleDateString('fr-FR', { weekday: 'long' })} : ${iconeMeteo(j.code)} ${j.tMin}–${j.tMax}° pluie ${j.probaPluie}%`)
        .join(' · ')
      const question =
        `Organise-nous un WEEK-END SURPRISE clé en main (2 adultes + Gabriel, 7 ans). ` +
        `Point de départ : ${maison?.adresse ?? ville?.nom ?? 'notre ville'}. ` +
        `Budget total ${budget === 0 ? 'zéro — que du gratuit' : `~${budget} €`}, rayon ${rayon} km maximum. ` +
        `Météo du week-end : ${ciel || 'inconnue — prévois un plan A dehors et un plan B abrité'}. ` +
        `${vacances ? `Vacances scolaires zone B : ${vacances.description} du ${vacances.debut.slice(0, 10)} au ${vacances.fin.slice(0, 10)}. ` : ''}` +
        `Nos goûts : restos aimés ${gouts.data?.restos || 'inconnus'} ; lieux déjà visités et aimés : ${gouts.data?.lieux || 'inconnus'} (propose du NOUVEAU). ` +
        `Réponds en sections : 🎯 LA DESTINATION (réelle, à ${rayon} km max, et pourquoi elle va nous plaire) · ` +
        `🗓 LE PROGRAMME (samedi et dimanche, heure par heure, réaliste avec un enfant) · ` +
        `🍴 OÙ MANGER (type de restaurant à chercher sur place) · 💶 LE BUDGET détaillé · ` +
        `🚗 DÉPART (heure conseillée et durée de route). Sois concret et enthousiaste, pas de blabla générique.`
      setProgramme(await demanderAStiga(question))
    } catch (e) {
      setErreur(String(e instanceof Error ? e.message : e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🧭 Week-end surprise</h1>
        <p className="text-legende text-encre-3">Un budget, un rayon — STG s'occupe du reste.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div>
          <p className="mb-1 text-legende text-encre-3">💶 Budget</p>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => (
              <button
                key={b.cle}
                onClick={() => setBudget(b.cle)}
                aria-pressed={budget === b.cle}
                className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                  ${budget === b.cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {b.libelle}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-legende text-encre-3">📍 Jusqu'où ?</p>
          <div className="flex flex-wrap gap-2">
            {RAYONS.map((r) => (
              <button
                key={r.cle}
                onClick={() => setRayon(r.cle)}
                aria-pressed={rayon === r.cle}
                className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                  ${rayon === r.cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {r.libelle}
              </button>
            ))}
          </div>
        </div>

        <Bouton pleineLargeur variante="primaire" desactive={enCours} onClick={() => void surprendre()}>
          {enCours ? 'STG compose votre week-end…' : programme ? '🔄 Une autre idée !' : '✨ Surprends-nous !'}
        </Bouton>

        {erreur && <p className="text-corps-2 text-urgent">{erreur}</p>}

        {programme && (
          <Carte>
            <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{programme}</p>
          </Carte>
        )}

        {!programme && !enCours && (
          <p className="text-legende text-encre-3">
            STG croise la météo du week-end, les vacances scolaires zone B, vos restos favoris et vos souvenirs
            de sorties — et il évite ce que vous avez déjà fait.
          </p>
        )}

        {/* 🎪 Les vraies sorties annoncées autour de la maison ce week-end. */}
        {centre && (
          <section className="mt-2 flex flex-col gap-2">
            <h2 className="text-corps font-[590] text-encre">🎪 Autour de vous ce week-end</h2>
            {sorties.isLoading && <p className="py-2 text-center text-corps-2 text-encre-3">🎪 Recherche des sorties…</p>}
            {sorties.data?.sansCle && (
              <Carte>
                <p className="text-corps-2 font-[590] text-encre">🔑 Une clé gratuite est nécessaire (2 minutes, une fois)</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-corps-2 text-encre-2">
                  <li>Crée un compte gratuit sur <strong>openagenda.com</strong> — la clé API (gratuite) est dans ton profil.</li>
                  <li>Dans <strong>Vercel → ton projet → Settings → Environment Variables</strong>, ajoute <strong>OPENAGENDA_KEY</strong> avec cette clé.</li>
                  <li>« Redeploy », et les sorties du week-end s'affichent pour toujours.</li>
                </ol>
              </Carte>
            )}
            {sorties.isError && (
              <div className="flex flex-col gap-2">
                <p className="text-corps-2 text-encre-3">
                  Les sorties ne répondent pas.
                  <br />
                  <span className="text-legende">
                    Diagnostic : {String(sorties.error instanceof Error ? sorties.error.message : sorties.error).slice(0, 90)}
                  </span>
                </p>
                <Bouton pleineLargeur variante="discret" onClick={() => void sorties.refetch()}>
                  🔄 Réessayer
                </Bouton>
              </div>
            )}
            {sorties.data && !sorties.data.sansCle && sorties.data.evenements.length === 0 && (
              <p className="text-corps-2 text-encre-3">
                Rien d'annoncé tout près ce week-end — le programme surprise prend le relais !
              </p>
            )}
            {sorties.data && !sorties.data.sansCle &&
              sorties.data.evenements.map((s, i) => (
                <div key={`${s.titre}-${i}`} className="flex items-center gap-3 rounded-xl bg-fond-eleve p-3 shadow-carte">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-corps-2 font-[590] leading-snug text-encre">{s.titre}</p>
                    <p className="text-legende text-encre-3">{s.lieu} · {dateSortie(s.quand)}</p>
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener"
                    className="btn-3d btn-clair flex min-h-sur-tactile shrink-0 items-center justify-center px-3 text-corps-2"
                  >
                    Voir
                  </a>
                </div>
              ))}
          </section>
        )}
      </div>
    </div>
  )
}
