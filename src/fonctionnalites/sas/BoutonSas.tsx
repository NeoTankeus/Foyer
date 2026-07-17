// Le Sas — capture éclair, partout. Photo/dictée/texte → routé en un tap.
// Rien ne se perd jamais.
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { muter } from '@/lib/sync'
import { ajouterArticle, creerEvenement, creerTache, utiliserListeCourses } from '@/lib/requetes'
import { devinerRayon } from '@/fonctionnalites/courses/rayons'
import { demarrerDictee, dicteePossible } from '@/fonctionnalites/courses/dictee'
import { maintenantLocal, versUtc } from '@/lib/dates'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'

type Destination = 'courses' | 'tache' | 'evenement' | 'mur'

export function BoutonSas() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const courses = utiliserListeCourses()
  // Le raccourci PWA « Le Sas » (appui long sur l'icône) ouvre directement la capture.
  const [ouvert, setOuvert] = useState(() => new URLSearchParams(window.location.search).has('sas'))
  const [texte, setTexte] = useState('')
  const [dicteeEnCours, setDicteeEnCours] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  if (!membre || !foyer) return null

  const enregistrerSas = async (destination: Destination) => {
    const contenu = texte.trim()
    if (!contenu) return
    const idSas = crypto.randomUUID()
    await muter({
      table: 'sas', type: 'insert', cible_id: idSas,
      charge: {
        id: idSas, foyer_id: foyer.id, auteur_id: membre.id,
        type: dicteeEnCours ? 'dictee' : 'texte', media_url: null,
        transcription: contenu, interpretation: { destination }, statut: 'valide',
      },
    })

    if (destination === 'courses' && courses.data?.liste) {
      const morceaux = contenu
        .split(/\s+et\s+|,|\n/)
        .map((m) => m.replace(/^(des?|du|de la|de l'|acheter|racheter|prendre)\s+/i, '').trim())
        .filter(Boolean)
      for (const morceau of morceaux) {
        await ajouterArticle(courses.data.liste.id, membre.id, morceau, devinerRayon(morceau))
      }
      await clientRequetes.invalidateQueries({ queryKey: ['courses'] })
      setConfirmation(`${morceaux.length} article${morceaux.length > 1 ? 's' : ''} → Courses`)
    } else if (destination === 'tache') {
      await creerTache(foyer.id, membre.id, {
        titre: contenu, assignee_id: null, echeance: null, rrule: null,
        effort_minutes: 10, groupe_rotation: null,
      })
      await clientRequetes.invalidateQueries({ queryKey: ['taches'] })
      setConfirmation('Tâche créée')
    } else if (destination === 'evenement') {
      const debut = maintenantLocal()
      debut.setHours(debut.getHours() + 1, 0, 0, 0)
      const fin = new Date(debut.getTime() + 3600_000)
      await creerEvenement(foyer.id, membre.id, {
        titre: contenu, debut_a: versUtc(debut), fin_a: versUtc(fin),
        lieu: null, participants: [], journee_entiere: false,
      })
      await clientRequetes.invalidateQueries({ queryKey: ['evenements'] })
      setConfirmation('Événement posé (heure à ajuster dans l’Agenda)')
    } else {
      const idMur = crypto.randomUUID()
      await muter({
        table: 'mur', type: 'insert', cible_id: idMur,
        charge: {
          id: idMur, foyer_id: foyer.id, auteur_id: membre.id, type: 'note',
          contenu, media_url: null, epingle: false,
          expire_le: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        },
      })
      await clientRequetes.invalidateQueries({ queryKey: ['mur'] })
      setConfirmation('Posté sur le Mur')
    }
    setTexte('')
    setTimeout(() => {
      setConfirmation(null)
      setOuvert(false)
    }, 1200)
  }

  return (
    <>
      <motion.button
        onClick={() => setOuvert(true)}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        aria-label="Le Sas — capture rapide"
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center
          rounded-full bg-encre text-fond shadow-carte"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M11 4v14M4 11h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </motion.button>

      <Feuille ouverte={ouvert} onFermer={() => setOuvert(false)} titre="Le Sas">
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
              <div className="flex gap-2">
                <textarea
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  rows={3}
                  placeholder="« penser à racheter des piles », « RDV dentiste jeudi »…"
                  aria-label="Capture rapide"
                  className="flex-1 rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps"
                  autoFocus
                />
                {dicteePossible() && (
                  <Bouton
                    variante={dicteeEnCours ? 'urgent' : 'discret'}
                    etiquette="Dicter"
                    onClick={() => {
                      setDicteeEnCours(true)
                      demarrerDictee(
                        (t) => {
                          setTexte((actuel) => (actuel ? `${actuel} ${t}` : t))
                          setDicteeEnCours(false)
                        },
                        () => setDicteeEnCours(false),
                      )
                    }}
                  >
                    {dicteeEnCours ? '●' : '🎙'}
                  </Bouton>
                )}
              </div>
              <p className="text-note text-encre-3">Et ça devient :</p>
              <div className="grid grid-cols-2 gap-2">
                <Bouton variante="discret" onClick={() => void enregistrerSas('courses')}>Courses</Bouton>
                <Bouton variante="discret" onClick={() => void enregistrerSas('tache')}>Tâche</Bouton>
                <Bouton variante="discret" onClick={() => void enregistrerSas('evenement')}>Événement</Bouton>
                <Bouton variante="discret" onClick={() => void enregistrerSas('mur')}>Mot sur le Mur</Bouton>
              </div>
              <p className="text-legende text-encre-3">
                Pour les courses, « piles et lait » fait deux articles. La photo du mot de l’école arrive avec Gastif.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </Feuille>
    </>
  )
}
