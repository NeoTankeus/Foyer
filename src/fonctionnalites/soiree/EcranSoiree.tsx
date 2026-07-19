// 🎬 La Soirée parfaite : un seul bouton, zéro décision fatigante — StiGa
// propose le film (et où le voir), le plat qui va avec, et l'option resto
// piochée dans VOS favoris avec le téléphone pour réserver.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lireAvecRepli } from '@/lib/lecture'
import { demanderAStiga } from '@/lib/stiga'
import { previsions, iconeMeteo } from '@/lib/meteo'
import type { LigneRestaurant } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

export function EcranSoiree() {
  const [avec, setAvec] = useState<'gabriel' | 'a-deux'>('gabriel')
  const [proposition, setProposition] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const restaurants = useQuery({
    queryKey: ['restaurants'],
    queryFn: () =>
      lireAvecRepli<LigneRestaurant>('restaurants', async () => {
        const { data, error } = await supabase.from('restaurants').select('*')
        if (error) throw error
        return data
      }),
  })

  const organiser = async () => {
    setEnCours(true)
    setErreur(null)
    setProposition(null)
    try {
      const meteo = await previsions().catch(() => [])
      const cesoir = meteo[0]
      const favoris = (restaurants.data ?? [])
        .filter((r) => r.favori || (r.note ?? 0) >= 4)
        .map((r) => `${r.nom} (${r.cuisine ?? '?'}${r.telephone ? `, tél ${r.telephone}` : ''}, note ${r.note ?? '—'}/5)`)
        .join(' · ')
      const jour = new Date().toLocaleDateString('fr-FR', { weekday: 'long' })
      const question =
        `Organise notre soirée de ce ${jour} soir${avec === 'gabriel' ? ' en famille avec Gabriel (7 ans)' : ' à deux (Gabriel est gardé)'}. ` +
        `Météo ce soir : ${cesoir ? `${iconeMeteo(cesoir.code)} ${cesoir.tMax}°, pluie ${cesoir.probaPluie}%` : 'inconnue'}. ` +
        `Nos restos favoris : ${favoris || 'aucun noté pour l’instant'}. ` +
        `Propose EXACTEMENT trois sections, dans ce format :\n` +
        `🎬 FILM — un titre${avec === 'gabriel' ? ' visible par un enfant de 7 ans' : ''}, une ligne sur pourquoi, et sur quelle plateforme le trouver (Netflix, Disney+, Prime…).\n` +
        `🍲 À LA MAISON — le plat simple qui va avec la soirée et la météo, en une ligne.\n` +
        `🍴 OU RESTO — ${favoris ? 'UN de nos favoris ci-dessus (redonne son téléphone pour réserver)' : 'dis simplement qu’on n’a pas encore de favoris dans le carnet'}.\n` +
        `Termine par une phrase d'ambiance courte. Pas de blabla autour.`
      setProposition(await demanderAStiga(question))
    } catch (e) {
      setErreur(String(e instanceof Error ? e.message : e))
    } finally {
      setEnCours(false)
    }
  }

  const telephone = /(?:0|\+33\s?)[1-9](?:[\s.-]?\d{2}){4}/.exec(proposition ?? '')?.[0]

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🎬 La Soirée parfaite</h1>
        <p className="text-legende text-encre-3">Un film, un plat, une table — décidé en 10 secondes.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="flex gap-2">
          {([['gabriel', '👨‍👩‍👦 En famille'], ['a-deux', '💞 À deux']] as const).map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => setAvec(cle)}
              aria-pressed={avec === cle}
              className={`min-h-sur-tactile flex-1 rounded-full px-4 text-note font-[590]
                ${avec === cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              {libelle}
            </button>
          ))}
        </div>

        <Bouton pleineLargeur variante="primaire" desactive={enCours} onClick={() => void organiser()}>
          {enCours ? 'StiGa prépare la soirée…' : proposition ? '🔄 Une autre proposition' : '✨ Organise notre soirée'}
        </Bouton>

        {erreur && <p className="text-corps-2 text-urgent">{erreur}</p>}

        {proposition && (
          <Carte>
            <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{proposition}</p>
            {telephone && (
              <a
                href={`tel:${telephone.replace(/[\s.-]/g, '')}`}
                className="btn-3d btn-clair mt-3 inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2"
              >
                📞 Réserver : {telephone}
              </a>
            )}
          </Carte>
        )}

        {!proposition && !enCours && (
          <p className="text-legende text-encre-3">
            StiGa croise vos restos favoris, la météo du soir et le jour de la semaine. Plus vous notez de tables et de goûts, plus il vise juste.
          </p>
        )}
      </div>
    </div>
  )
}
