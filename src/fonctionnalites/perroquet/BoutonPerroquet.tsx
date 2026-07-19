// 🦜 Le Perroquet — tu lui PARLES, il range tout : « ajoute lait et beurre,
// rendez-vous dentiste jeudi 14h, penser à appeler papi » → Courses + Agenda
// + Tâches, sans toucher le clavier. Il a pris la place du Sas (qui vit
// maintenant en bas à gauche).
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { muter } from '@/lib/sync'
import { supabase } from '@/lib/supabase'
import { ajouterArticle, creerEvenement, creerTache, utiliserListeCourses } from '@/lib/requetes'
import { devinerRayon } from '@/fonctionnalites/courses/rayons'
import { demarrerDictee, dicteePossible } from '@/fonctionnalites/courses/dictee'
import { versUtc } from '@/lib/dates'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'

interface Proposition {
  resume?: string
  evenements?: { titre: string; date: string; heure: string | null; lieu: string | null }[]
  taches?: { titre: string; echeance: string | null }[]
  articles?: string[]
  mur?: string[]
}

export function BoutonPerroquet() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const courses = utiliserListeCourses()
  const [ouvert, setOuvert] = useState(false)
  const [texte, setTexte] = useState('')
  const [ecoute, setEcoute] = useState(false)
  const [analyse, setAnalyse] = useState(false)
  const [proposition, setProposition] = useState<Proposition | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const { pathname } = useLocation()

  if (!membre || !foyer) return null
  if (pathname === '/gastif') return null

  const ecouter = () => {
    setErreur(null)
    setEcoute(true)
    demarrerDictee(
      (t) => {
        setTexte((actuel) => (actuel ? `${actuel} ${t}` : t))
        setEcoute(false)
      },
      () => {
        setEcoute(false)
        setErreur('Je n’ai rien entendu — réessaie, ou tape le texte ci-dessous.')
      },
    )
  }

  const ranger = async () => {
    if (!texte.trim()) return
    setAnalyse(true)
    setErreur(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/perroquet', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          texte,
          aujourdhui: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        }),
      })
      const donnees = (await reponse.json()) as { proposition?: Proposition; message?: string }
      if (donnees.proposition) setProposition(donnees.proposition)
      else setErreur(donnees.message ?? 'Le Perroquet n’a pas compris — reformule.')
    } catch {
      setErreur('Pas de réseau — réessaie.')
    } finally {
      setAnalyse(false)
    }
  }

  const toutCreer = async () => {
    if (!proposition) return
    let creations = 0
    for (const e of proposition.evenements ?? []) {
      if (!e.date) continue
      const debutLocal = new Date(`${e.date}T${e.heure ?? '09:00'}:00`)
      const finLocal = new Date(debutLocal.getTime() + 3600_000)
      await creerEvenement(foyer.id, membre.id, {
        titre: e.titre, debut_a: versUtc(debutLocal), fin_a: versUtc(finLocal),
        lieu: e.lieu, participants: [], journee_entiere: false,
      })
      creations += 1
    }
    for (const t of proposition.taches ?? []) {
      await creerTache(foyer.id, membre.id, {
        titre: t.titre, assignee_id: null, echeance: t.echeance,
        rrule: null, effort_minutes: 10, groupe_rotation: null,
      })
      creations += 1
    }
    if (courses.data?.liste) {
      for (const a of proposition.articles ?? []) {
        await ajouterArticle(courses.data.liste.id, membre.id, a, devinerRayon(a))
        creations += 1
      }
    }
    for (const mot of proposition.mur ?? []) {
      const idMur = crypto.randomUUID()
      await muter({
        table: 'mur', type: 'insert', cible_id: idMur,
        charge: {
          id: idMur, foyer_id: foyer.id, auteur_id: membre.id, type: 'note',
          contenu: mot, media_url: null, epingle: false,
          expire_le: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        },
      })
      creations += 1
    }
    await Promise.all([
      clientRequetes.invalidateQueries({ queryKey: ['evenements'] }),
      clientRequetes.invalidateQueries({ queryKey: ['taches'] }),
      clientRequetes.invalidateQueries({ queryKey: ['courses'] }),
      clientRequetes.invalidateQueries({ queryKey: ['mur'] }),
    ])
    setProposition(null)
    setTexte('')
    setConfirmation(`🦜 ${creations} chose${creations > 1 ? 's' : ''} rangée${creations > 1 ? 's' : ''} au bon endroit ✓`)
    setTimeout(() => {
      setConfirmation(null)
      setOuvert(false)
    }, 1600)
  }

  const p = proposition
  const rienDetecte =
    p && (p.evenements ?? []).length + (p.taches ?? []).length + (p.articles ?? []).length + (p.mur ?? []).length === 0

  return (
    <>
      <motion.button
        onClick={() => setOuvert(true)}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        aria-label="Le Perroquet — dicter à STG"
        className="degrade-froid fixed right-4 z-30 flex h-14 w-14 items-center justify-center
          rounded-full text-[26px] shadow-carte"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      >
        🦜
      </motion.button>

      <Feuille ouverte={ouvert} onFermer={() => setOuvert(false)} titre="🦜 Le Perroquet">
        <AnimatePresence mode="wait">
          {confirmation ? (
            <motion.p
              key="ok"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center text-corps font-[590] text-fait"
            >
              {confirmation}
            </motion.p>
          ) : (
            <motion.div key="saisie" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
              <p className="text-corps-2 text-encre-2">
                Parle-lui comme à quelqu'un de la maison : <em>« ajoute lait et beurre, rendez-vous dentiste jeudi
                14h, penser à appeler papi »</em> — il découpe tout seul et range chaque chose au bon endroit :
                🛒 Courses, 📅 Agenda, ✅ Tâches, 🧲 Mur. Zéro clavier.
              </p>

              {p ? (
                <div className="flex flex-col gap-3">
                  {p.resume && <p className="text-corps-2 text-encre-2">🦜 « {p.resume} »</p>}
                  <div className="rounded-xl bg-fond-sourd p-3 text-corps-2 text-encre">
                    {(p.evenements ?? []).map((e, i) => (
                      <p key={`e${i}`}>📅 {e.titre} — {new Date(`${e.date}T12:00:00`).toLocaleDateString('fr-FR')}{e.heure ? ` à ${e.heure}` : ''}{e.lieu ? ` (${e.lieu})` : ''}</p>
                    ))}
                    {(p.taches ?? []).map((t, i) => (
                      <p key={`t${i}`}>✅ {t.titre}{t.echeance ? ` (avant le ${new Date(`${t.echeance}T12:00:00`).toLocaleDateString('fr-FR')})` : ''}</p>
                    ))}
                    {(p.articles ?? []).map((a, i) => (
                      <p key={`a${i}`}>🛒 {a}</p>
                    ))}
                    {(p.mur ?? []).map((m, i) => (
                      <p key={`m${i}`}>🧲 {m}</p>
                    ))}
                    {rienDetecte && <p className="text-encre-3">Rien d'actionnable compris — reformule ou complète le texte.</p>}
                  </div>
                  <div className="flex gap-2">
                    <Bouton variante="valider" pleineLargeur desactive={!!rienDetecte} onClick={() => void toutCreer()}>
                      Tout ranger ✓
                    </Bouton>
                    <Bouton variante="discret" onClick={() => setProposition(null)}>
                      Corriger
                    </Bouton>
                  </div>
                </div>
              ) : (
                <>
                  {dicteePossible() && (
                    <button
                      onClick={ecouter}
                      aria-label="Parler au Perroquet"
                      className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-[40px] shadow-carte transition
                        ${ecoute ? 'animate-pulse bg-urgent/20' : 'degrade-froid'}`}
                    >
                      {ecoute ? '👂' : '🎙'}
                    </button>
                  )}
                  <p className="text-center text-legende text-encre-3">
                    {ecoute ? 'Le Perroquet écoute… parle !' : dicteePossible() ? 'Touche le micro et parle — ou tape ci-dessous.' : 'Tape ta phrase ci-dessous.'}
                  </p>
                  <textarea
                    value={texte}
                    onChange={(e) => setTexte(e.target.value)}
                    rows={3}
                    placeholder="« ajoute lait et beurre, RDV dentiste jeudi 14h, penser à appeler papi »"
                    aria-label="Texte à faire ranger par le Perroquet"
                    className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps"
                  />
                  {erreur && <p className="text-legende text-urgent">{erreur}</p>}
                  <Bouton pleineLargeur variante="primaire" desactive={!texte.trim() || analyse} onClick={() => void ranger()}>
                    {analyse ? '🦜 Le Perroquet trie…' : '🦜 STG, range tout !'}
                  </Bouton>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Feuille>
    </>
  )
}
