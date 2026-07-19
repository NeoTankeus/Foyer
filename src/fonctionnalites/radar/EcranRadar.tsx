// 🚗 Le Radar de départ : pour chaque rendez-vous du jour (et de demain) qui
// a un lieu, StiGa calcule l'heure exacte à laquelle il faut partir de la
// maison — trajet réel + 10 min de marge. L'heure de départ arrive aussi
// dans le brief du matin.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import type { LigneEvenement } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

interface Maison { adresse: string; lat: number; lon: number }
interface Depart {
  evenement: LigneEvenement
  minutes: number
  partirA: Date
}

const CACHE_GEO = 'stiga-radar-geocache'

async function geocoder(texte: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_GEO) ?? '{}') as Record<string, { lat: number; lon: number }>
    const connu = cache[texte]
    if (connu) return connu
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(texte)}&format=jsonv2&limit=1&accept-language=fr`,
      { headers: { accept: 'application/json' } },
    )
    if (!r.ok) return null
    const [premier] = (await r.json()) as { lat: string; lon: string }[]
    if (!premier) return null
    const point = { lat: Number(premier.lat), lon: Number(premier.lon) }
    cache[texte] = point
    localStorage.setItem(CACHE_GEO, JSON.stringify(cache))
    return point
  } catch {
    return null
  }
}

async function dureeTrajet(de: { lat: number; lon: number }, vers: { lat: number; lon: number }): Promise<number | null> {
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${de.lon},${de.lat};${vers.lon},${vers.lat}?overview=false`,
    )
    if (!r.ok) return null
    const route = (await r.json()) as { routes?: { duration?: number }[] }
    const duree = route.routes?.[0]?.duration
    return duree ? Math.round(duree / 60) : null
  } catch {
    return null
  }
}

export function EcranRadar() {
  const { foyer } = utiliserSession()
  const maison = (foyer?.reglages['maison'] ?? null) as Maison | null
  const [adresse, setAdresse] = useState('')
  const [etatMaison, setEtatMaison] = useState<'repos' | 'cherche' | 'echec' | 'ok'>('repos')

  const departs = useQuery({
    queryKey: ['radar', maison?.lat],
    enabled: maison !== null,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<{ calcules: Depart[]; sansLieu: number }> => {
      const debut = new Date()
      debut.setHours(0, 0, 0, 0)
      const fin = new Date(debut)
      fin.setDate(fin.getDate() + 2)
      const { data, error } = await supabase
        .from('evenements')
        .select('*')
        .gte('debut_a', debut.toISOString())
        .lt('debut_a', fin.toISOString())
        .order('debut_a')
      if (error) throw error
      const evenements = (data ?? []) as LigneEvenement[]
      const horaires = evenements.filter((e) => !e.journee_entiere)
      const calcules: Depart[] = []
      for (const e of horaires.filter((x) => x.lieu).slice(0, 6)) {
        if (!maison) break
        const cible = await geocoder(e.lieu ?? '')
        if (!cible) continue
        const minutes = await dureeTrajet(maison, cible)
        if (minutes === null) continue
        calcules.push({
          evenement: e,
          minutes,
          partirA: new Date(new Date(e.debut_a).getTime() - (minutes + 10) * 60000),
        })
      }
      return { calcules, sansLieu: horaires.filter((x) => !x.lieu).length }
    },
  })

  const definirMaison = async () => {
    if (!foyer || !adresse.trim()) return
    setEtatMaison('cherche')
    const point = await geocoder(adresse)
    if (!point) {
      setEtatMaison('echec')
      return
    }
    const { error } = await supabase
      .from('foyers')
      .update({ reglages: { ...foyer.reglages, maison: { adresse: adresse.trim(), ...point } } })
      .eq('id', foyer.id)
    if (error) {
      setEtatMaison('echec')
      return
    }
    setEtatMaison('ok')
    // Le foyer en mémoire n'a pas la nouvelle adresse — un rechargement doux la lit.
    window.setTimeout(() => window.location.reload(), 900)
  }

  const heure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const jourDe = (iso: string) => {
    const d = new Date(iso)
    const auj = new Date()
    return d.getDate() === auj.getDate() ? "aujourd'hui" : 'demain'
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🚗 Radar de départ</h1>
        <p className="text-legende text-encre-3">L'heure à laquelle il faut VRAIMENT partir.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {!maison && (
          <Carte>
            <p className="mb-2 text-corps-2 text-encre-2">
              Dis-moi une fois où est la maison — ensuite je calcule les départs tout seul, et je les glisse dans le brief du matin.
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void definirMaison()
              }}
            >
              <input
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="12 rue de la Paix, 75002 Paris"
                aria-label="Adresse de la maison"
                className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
              />
              <Bouton type="submit" variante="valider" desactive={!adresse.trim() || etatMaison === 'cherche'}>
                {etatMaison === 'cherche' ? '…' : 'OK'}
              </Bouton>
            </form>
            {etatMaison === 'echec' && (
              <p className="mt-1 text-legende text-urgent">Adresse introuvable — mets l'adresse postale complète.</p>
            )}
            {etatMaison === 'ok' && <p className="mt-1 text-legende text-fait">✓ Maison enregistrée !</p>}
          </Carte>
        )}

        {maison && (
          <>
            <p className="text-legende text-encre-3">🏡 Maison : {maison.adresse}</p>
            {departs.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">Calcul des trajets…</p>}
            {departs.data && departs.data.calcules.length === 0 && (
              <EtatVide
                titre="Aucun départ à calculer"
                message={
                  departs.data.sansLieu > 0
                    ? `${departs.data.sansLieu} rendez-vous n'ont pas de lieu renseigné — ajoute le lieu dans l'agenda et le Radar fera le reste.`
                    : 'Pas de rendez-vous avec un lieu aujourd’hui ni demain. Profitez-en.'
                }
              />
            )}
            {(departs.data?.calcules ?? []).map(({ evenement, minutes, partirA }) => {
              const dansMin = Math.round((partirA.getTime() - Date.now()) / 60000)
              const urgent = dansMin >= 0 && dansMin <= 20 && jourDe(evenement.debut_a) === "aujourd'hui"
              return (
                <Carte key={evenement.id}>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-14 w-20 shrink-0 flex-col items-center justify-center rounded-2xl ${urgent ? 'bg-urgent/15' : 'bg-fond-sourd'}`}>
                      <p className={`text-titre-3 ${urgent ? 'text-urgent' : 'text-encre'}`}>{heure(partirA)}</p>
                      <p className="text-legende text-encre-3">départ</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-corps font-[590] leading-snug text-encre">{evenement.titre}</p>
                      <p className="text-legende text-encre-3">
                        {jourDe(evenement.debut_a)} à {heure(new Date(evenement.debut_a))} · {minutes} min de route + 10 min de marge
                      </p>
                      {urgent && <p className="text-legende font-[590] text-urgent">⏰ Pars dans {dansMin} min !</p>}
                    </div>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&origin=${maison.lat},${maison.lon}&destination=${encodeURIComponent(evenement.lieu ?? '')}&travelmode=driving`}
                      target="_blank"
                      rel="noopener"
                      aria-label="Itinéraire"
                      className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
                    >
                      🧭
                    </a>
                  </div>
                </Carte>
              )
            })}
            <p className="text-legende text-encre-3">
              Chaque matin, le brief de StiGa inclut ces heures de départ. Les trajets sont recalculés à chaque ouverture de cet écran.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
