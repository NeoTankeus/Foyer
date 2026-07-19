// 🏆 Le Quiz du dîner : chaque soir à table, 3 questions — une sur VOTRE vie
// (tirée de vos vraies données STG !), une pour Gabriel (7 ans), une culture
// générale famille. Réponses cachées, à révéler quand tout le monde a parié.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { demanderAStiga } from '@/lib/stiga'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

interface Question { question: string; reponse: string }

function decouper(texte: string): Question[] {
  // Format attendu : « Q: … R: … » ligne à ligne.
  const questions: Question[] = []
  const motif = /Q\s*[:.]\s*([\s\S]+?)R\s*[:.]\s*([\s\S]+?)(?=Q\s*[:.]|$)/gi
  let m: RegExpExecArray | null
  while ((m = motif.exec(texte))) {
    const question = (m[1] ?? '').trim()
    const reponse = (m[2] ?? '').trim()
    if (question && reponse) questions.push({ question, reponse })
  }
  return questions.slice(0, 3)
}

export function EcranQuiz() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [revelees, setRevelees] = useState<Set<number>>(new Set())
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const matiere = useQuery({
    queryKey: ['quiz-matiere'],
    staleTime: 3600 * 1000,
    queryFn: async () => {
      const [restos, taches, souvenirs] = await Promise.all([
        supabase.from('restaurants').select('nom,note,cuisine,favori').limit(15),
        supabase.from('taches').select('titre,faite_le').not('faite_le', 'is', null).order('faite_le', { ascending: false }).limit(10),
        supabase.from('souvenirs').select('titre,lieu,pris_le').order('pris_le', { ascending: false }).limit(10),
      ])
      return {
        restos: (restos.data ?? []).map((r) => `${r.nom} (note ${r.note ?? '—'}, ${r.cuisine ?? '?'}${r.favori ? ', favori' : ''})`).join(' · '),
        taches: (taches.data ?? []).map((t) => t.titre).join(' · '),
        souvenirs: (souvenirs.data ?? []).map((s) => `${s.titre ?? s.lieu ?? 'photo'} (${s.pris_le?.slice(0, 10)})`).join(' · '),
      }
    },
  })

  const generer = async () => {
    setEnCours(true)
    setErreur(null)
    setRevelees(new Set())
    try {
      const m = matiere.data
      const reponse = await demanderAStiga(
        `Prépare le Quiz du dîner de ce soir : EXACTEMENT 3 questions, dans ce format strict, sans rien d'autre :\n` +
          `Q: … R: …\n` +
          `1) Une question sur NOTRE vie de famille, tirée de ces vraies données (choisis un détail amusant) — ` +
          `restos : ${m?.restos || 'aucun'} ; tâches récentes : ${m?.taches || 'aucune'} ; souvenirs : ${m?.souvenirs || 'aucun'}.\n` +
          `2) Une question de culture générale pour Gabriel, 7 ans (animaux, espace, corps humain…), formulée simplement.\n` +
          `3) Une question de culture générale familiale (histoire, géo, cinéma) niveau adulte accessible.\n` +
          `Les questions doivent être courtes et se poser à voix haute à table. Varie à chaque fois.`,
      )
      const decoupees = decouper(reponse)
      if (decoupees.length === 0) throw new Error('Le quiz est arrivé illisible — relance !')
      setQuestions(decoupees)
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
        <h1 className="text-titre-2 text-encre">🏆 Le Quiz du dîner</h1>
        <p className="text-legende text-encre-3">3 questions à table — dont une sur VOTRE vie.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Bouton pleineLargeur variante="primaire" desactive={enCours} onClick={() => void generer()}>
          {enCours ? 'STG prépare le quiz…' : questions.length > 0 ? '🔄 Un autre quiz !' : '🎲 Lance le quiz de ce soir'}
        </Bouton>

        {erreur && <p className="text-corps-2 text-urgent">{erreur}</p>}

        {questions.map((q, i) => (
          <Carte key={i}>
            <p className="text-note font-[590] uppercase tracking-wide text-encre-3">
              {i === 0 ? '👨‍👩‍👦 Notre vie' : i === 1 ? '🧒 Pour Gabriel' : '🌍 Culture G'}
            </p>
            <p className="mt-1 text-corps text-encre">{q.question}</p>
            {revelees.has(i) ? (
              <p className="mt-2 rounded-lg bg-sauge/15 px-3 py-2 text-corps-2 font-[590] text-encre">✅ {q.reponse}</p>
            ) : (
              <div className="mt-2">
                <Bouton
                  variante="discret"
                  onClick={() => {
                    navigator.vibrate?.(6)
                    setRevelees((s) => new Set(s).add(i))
                  }}
                >
                  👀 Révéler la réponse
                </Bouton>
              </div>
            )}
          </Carte>
        ))}

        {questions.length === 0 && !enCours && (
          <p className="text-legende text-encre-3">
            Règle du jeu maison : chacun parie sa réponse à voix haute AVANT de révéler. Le perdant débarrasse. 😄
          </p>
        )}
      </div>
    </div>
  )
}
