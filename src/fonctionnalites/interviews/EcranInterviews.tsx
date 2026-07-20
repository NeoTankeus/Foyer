// 🎤 Les Interviews : tous les 6 mois, STG pose 5 questions à chacun —
// « c'est quoi le bonheur ? » à Gabriel, 7 ans — et archive les réponses
// année après année. Les relire dans 10 ans : le vrai trésor.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { demanderAStiga } from '@/lib/stiga'
import { demarrerDictee, dicteePossible } from '@/fonctionnalites/courses/dictee'
import type { LigneInterview } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranInterviews() {
  const { membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const prenoms = membres.filter((m) => m.role !== 'guest').map((m) => m.prenom)
  const annee = new Date().getFullYear()
  const [personne, setPersonne] = useState(prenoms[0] ?? '')
  const [questions, setQuestions] = useState<string[]>([])
  const [reponses, setReponses] = useState<Record<number, string>>({})
  const [enCours, setEnCours] = useState(false)
  const [ecoute, setEcoute] = useState<number | null>(null)
  const [merci, setMerci] = useState(false)

  const archives = useQuery({
    queryKey: ['interviews'],
    queryFn: () =>
      lireAvecRepli<LigneInterview>('interviews', async () => {
        const { data, error } = await supabase.from('interviews').select('*').order('cree_le', { ascending: false }).limit(200)
        if (error) throw error
        return data
      }),
  })

  const estEnfant = membres.find((m) => m.prenom === personne)?.role === 'child'

  const preparerQuestions = async () => {
    setEnCours(true)
    setQuestions([])
    setReponses({})
    setMerci(false)
    try {
      const dejaPosees = (archives.data ?? [])
        .filter((i) => i.personne === personne && i.annee === annee)
        .map((i) => i.question)
        .join(' · ')
      const brut = await demanderAStiga(
        `Prépare EXACTEMENT 5 questions d'interview pour ${personne}` +
          `${estEnfant ? ' (enfant de 7 ans — questions poétiques et simples : bonheur, rêves, quand tu seras grand, ta famille, ce qui te fait rire)' : ' (adulte — questions profondes mais chaleureuses : fierté de l\'année, ce que tu dirais à toi-même il y a 10 ans, ta définition du bonheur en ce moment…)'}. ` +
          `Ces réponses seront relues dans 10 ans : vise l'émotion et le concret. ` +
          `${dejaPosees ? `Ne repose PAS celles-ci : ${dejaPosees}. ` : ''}` +
          `Réponds UNIQUEMENT avec les 5 questions, une par ligne, sans numérotation ni commentaire.`,
      )
      const liste = brut
        .split('\n')
        .map((l) => l.replace(/^[\s\-•\d.)]+/, '').trim())
        .filter((l) => l.length > 8 && l.includes('?'))
        .slice(0, 5)
      if (liste.length === 0) throw new Error('vide')
      setQuestions(liste)
    } catch {
      setQuestions([
        `C'est quoi le bonheur pour toi, ${personne} ?`,
        'De quoi es-tu le plus fier·e cette année ?',
        'Qu’est-ce qui te fait le plus rire dans la famille ?',
        'Si tu pouvais faire un vœu, ce serait quoi ?',
        'Qu’est-ce que tu voudrais dire à la famille du futur ?',
      ])
    } finally {
      setEnCours(false)
    }
  }

  const archiver = async () => {
    if (!foyer) return
    let n = 0
    for (const [index, question] of questions.entries()) {
      const reponse = (reponses[index] ?? '').trim()
      if (!reponse) continue
      const id = crypto.randomUUID()
      await muter({
        table: 'interviews', type: 'insert', cible_id: id,
        charge: { id, foyer_id: foyer.id, personne, question, reponse, annee, cree_le: new Date().toISOString() },
      })
      n += 1
    }
    if (n > 0) {
      await clientRequetes.invalidateQueries({ queryKey: ['interviews'] })
      setQuestions([])
      setReponses({})
      setMerci(true)
      window.setTimeout(() => setMerci(false), 3000)
    }
  }

  const archivesDe = (archives.data ?? []).filter((i) => i.personne === personne)
  const parAnnee = [...new Set(archivesDe.map((i) => i.annee))].sort((a, b) => b - a)

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🎤 Les Interviews</h1>
        <p className="text-legende text-encre-3">Les mêmes questions, année après année. Frissons dans 10 ans.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="flex gap-2">
          {prenoms.map((p) => (
            <button
              key={p}
              onClick={() => { setPersonne(p); setQuestions([]); setReponses({}) }}
              aria-pressed={personne === p}
              className={`min-h-sur-tactile flex-1 rounded-full px-3 text-note font-[590]
                ${personne === p ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {questions.length === 0 && (
          <Bouton pleineLargeur variante="primaire" desactive={enCours} onClick={() => void preparerQuestions()}>
            {enCours ? '🎤 STG prépare ses questions…' : `🎤 Interviewer ${personne} (${annee})`}
          </Bouton>
        )}
        {merci && <p className="text-center text-corps font-[590] text-fait">🎤 Interview archivée pour la postérité ✓</p>}

        {questions.map((q, index) => (
          <Carte key={index}>
            <p className="mb-1 text-corps-2 font-[590] text-encre">{index + 1}. {q}</p>
            <div className="flex items-start gap-2">
              <textarea
                value={reponses[index] ?? ''}
                onChange={(e) => setReponses({ ...reponses, [index]: e.target.value })}
                rows={2}
                placeholder={estEnfant ? `Les mots exacts de ${personne}…` : 'Ta réponse, sincère…'}
                aria-label={`Réponse à : ${q}`}
                className="w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2"
              />
              {dicteePossible() && (
                <button
                  aria-label="Dicter la réponse"
                  onClick={() => {
                    setEcoute(index)
                    demarrerDictee(
                      (t) => {
                        setReponses((r) => ({ ...r, [index]: r[index] ? `${r[index]} ${t}` : t }))
                        setEcoute(null)
                      },
                      () => setEcoute(null),
                    )
                  }}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[18px] ${ecoute === index ? 'animate-pulse bg-urgent/20' : 'bg-fond-sourd'}`}
                >
                  {ecoute === index ? '👂' : '🎙'}
                </button>
              )}
            </div>
          </Carte>
        ))}

        {questions.length > 0 && (
          <Bouton
            pleineLargeur
            variante="valider"
            desactive={Object.values(reponses).every((r) => !r.trim())}
            onClick={() => void archiver()}
          >
            💾 Archiver pour la postérité
          </Bouton>
        )}

        {parAnnee.length > 0 && (
          <>
            <p className="mt-2 text-note font-[590] uppercase tracking-wide text-encre-3">📼 Les archives de {personne}</p>
            {parAnnee.map((a) => (
              <Carte key={a}>
                <p className="mb-1 text-corps font-[700] text-encre">{personne}, en {a}</p>
                {archivesDe
                  .filter((i) => i.annee === a)
                  .map((i) => (
                    <div key={i.id} className="border-b border-trait py-1.5 last:border-0">
                      <p className="text-legende text-encre-3">{i.question}</p>
                      <p className="text-corps-2 italic text-encre">« {i.reponse} »</p>
                    </div>
                  ))}
              </Carte>
            ))}
          </>
        )}
        {!archives.isLoading && archivesDe.length === 0 && questions.length === 0 && (
          <EtatVide
            titre={`Aucune interview de ${personne}`}
            message="Lance la première — dans un an, tu poseras les mêmes genres de questions, et la comparaison des réponses sera un trésor."
          />
        )}
      </div>
    </div>
  )
}
