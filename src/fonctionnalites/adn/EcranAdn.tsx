// 🧬 L'ADN du foyer : STG analyse vos données réelles et dresse votre
// portrait — rythmes, plats signatures, resto de cœur… et ses prédictions.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { demanderAStiga } from '@/lib/stiga'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export function EcranAdn() {
  const [portrait, setPortrait] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const adn = useQuery({
    queryKey: ['adn'],
    staleTime: 3600 * 1000,
    queryFn: async () => {
      const ilYA90j = new Date(Date.now() - 90 * 86400000).toISOString()
      const [restos, repas, taches, souvenirs, evenements] = await Promise.all([
        supabase.from('restaurants').select('nom,cuisine,note,favori,cree_le').order('cree_le'),
        supabase.from('repas').select('notes').not('notes', 'is', null).limit(300),
        supabase.from('taches').select('faite_par').gte('faite_le', ilYA90j).not('faite_le', 'is', null),
        supabase.from('souvenirs').select('id', { count: 'exact', head: true }),
        supabase.from('evenements').select('debut_a').gte('debut_a', ilYA90j).limit(500),
      ])

      // Le rythme resto : écart moyen entre deux nouvelles adresses.
      const datesRestos = (restos.data ?? []).map((r) => new Date(r.cree_le).getTime()).sort((a, b) => a - b)
      let rythmeJours: number | null = null
      if (datesRestos.length >= 3) {
        const premier = datesRestos[0]
        const dernier = datesRestos[datesRestos.length - 1]
        if (premier !== undefined && dernier !== undefined && dernier > premier) {
          rythmeJours = Math.max(1, Math.round((dernier - premier) / 86400000 / (datesRestos.length - 1)))
        }
      }
      const dernierResto = datesRestos[datesRestos.length - 1]
      const prochainResto =
        rythmeJours !== null && dernierResto !== undefined ? new Date(dernierResto + rythmeJours * 86400000) : null

      // Le plat signature : la note de repas la plus fréquente.
      const compte = new Map<string, number>()
      for (const r of repas.data ?? []) {
        const plat = (r.notes ?? '').trim().toLowerCase()
        if (plat.length > 2) compte.set(plat, (compte.get(plat) ?? 0) + 1)
      }
      const platSignature = [...compte.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

      // Le jour le plus chargé.
      const parJour = [0, 0, 0, 0, 0, 0, 0]
      for (const e of evenements.data ?? []) {
        const index = new Date(e.debut_a).getDay()
        parJour[index] = (parJour[index] ?? 0) + 1
      }
      const chargeMax = Math.max(...parJour)
      const jourCharge = chargeMax > 0 ? JOURS[parJour.indexOf(chargeMax)] : null

      const meilleurResto = [...(restos.data ?? [])].sort((a, b) => (b.note ?? 0) - (a.note ?? 0))[0] ?? null
      const cuisines = new Map<string, number>()
      for (const r of restos.data ?? [])
        for (const c of (r.cuisine ?? '').split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean))
          cuisines.set(c, (cuisines.get(c) ?? 0) + 1)
      const cuisinePreferee = [...cuisines.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

      return {
        nbRestos: (restos.data ?? []).length,
        rythmeJours,
        prochainResto,
        meilleurResto: meilleurResto && (meilleurResto.note ?? 0) >= 4 ? meilleurResto.nom : null,
        cuisinePreferee: cuisinePreferee?.[0] ?? null,
        platSignature: platSignature ? { nom: platSignature[0], fois: platSignature[1] } : null,
        nbTaches90j: (taches.data ?? []).length,
        nbPhotos: souvenirs.count ?? 0,
        jourCharge,
      }
    },
  })

  const d = adn.data

  const dresserPortrait = async () => {
    if (!d) return
    setEnCours(true)
    try {
      setPortrait(
        await demanderAStiga(
          `Dresse le PORTRAIT (l'ADN) de notre famille à partir de ces faits réels : ` +
            `${d.nbRestos} restaurants découverts${d.rythmeJours ? `, un nouveau tous les ~${d.rythmeJours} jours` : ''}` +
            `${d.meilleurResto ? `, table de cœur : ${d.meilleurResto}` : ''}${d.cuisinePreferee ? `, cuisine favorite : ${d.cuisinePreferee}` : ''}. ` +
            `${d.platSignature ? `Plat signature à la maison : « ${d.platSignature.nom} » (${d.platSignature.fois} fois). ` : ''}` +
            `${d.nbTaches90j} tâches accomplies en 90 jours, ${d.nbPhotos} photos souvenirs` +
            `${d.jourCharge ? `, jour le plus chargé : le ${d.jourCharge}` : ''}. ` +
            `Fais un portrait chaleureux, précis et un peu drôle en 3 courtes sections : 🧬 QUI VOUS ÊTES · 📈 VOS RYTHMES · 🔮 MES PRÉDICTIONS (dont la date probable du prochain resto${d.prochainResto ? ` — mathématiquement le ${d.prochainResto.toLocaleDateString('fr-FR')}` : ''}). Appuie-toi UNIQUEMENT sur ces faits.`,
        ),
      )
    } catch {
      setPortrait('STG n’a pas réussi à dresser le portrait — réessaie dans un instant.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🧬 L'ADN du foyer</h1>
        <p className="text-legende text-encre-3">Votre portrait, calculé sur vos vraies données.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {adn.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">🧬 Séquençage en cours…</p>}

        {d && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['🍴', d.nbRestos, 'restos découverts'],
                ['📷', d.nbPhotos, 'photos souvenirs'],
                ['✓', d.nbTaches90j, 'tâches en 90 j'],
                ['📅', d.jourCharge ?? '—', 'jour le plus chargé'],
              ].map(([icone, valeur, libelle]) => (
                <Carte key={String(libelle)}>
                  <p className="text-titre-3 capitalize text-encre">{icone} {valeur}</p>
                  <p className="text-legende text-encre-3">{libelle}</p>
                </Carte>
              ))}
            </div>

            {(d.rythmeJours !== null || d.platSignature || d.meilleurResto) && (
              <Carte>
                {d.rythmeJours !== null && (
                  <p className="py-0.5 text-corps-2 text-encre">
                    🍽 Un nouveau resto tous les <strong>~{d.rythmeJours} jours</strong>
                    {d.prochainResto ? ` — le prochain devrait tomber vers le ${d.prochainResto.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} 😄` : ''}
                  </p>
                )}
                {d.meilleurResto && <p className="py-0.5 text-corps-2 text-encre">🏆 Votre table de cœur : <strong>{d.meilleurResto}</strong></p>}
                {d.cuisinePreferee && <p className="py-0.5 text-corps-2 capitalize text-encre">🥢 Cuisine favorite : <strong>{d.cuisinePreferee}</strong></p>}
                {d.platSignature && (
                  <p className="py-0.5 text-corps-2 text-encre">
                    👨‍🍳 Plat signature : <strong className="capitalize">{d.platSignature.nom}</strong> ({d.platSignature.fois} fois)
                  </p>
                )}
              </Carte>
            )}

            <Bouton pleineLargeur variante="primaire" desactive={enCours} onClick={() => void dresserPortrait()}>
              {enCours ? 'STG séquence votre ADN…' : portrait ? '🔄 Refaire le portrait' : '✨ STG, dresse notre portrait !'}
            </Bouton>

            {portrait && (
              <Carte>
                <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{portrait}</p>
              </Carte>
            )}
          </>
        )}
      </div>
    </div>
  )
}
