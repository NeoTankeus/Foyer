// Le Sas — capture éclair, partout. Photo/dictée/texte → routé en un tap.
// Rien ne se perd jamais.
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { muter } from '@/lib/sync'
import { ajouterArticle, creerEvenement, creerTache, utiliserListeCourses } from '@/lib/requetes'
import { devinerRayon } from '@/fonctionnalites/courses/rayons'
import { demarrerDictee, dicteePossible } from '@/fonctionnalites/courses/dictee'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import { supabase } from '@/lib/supabase'
import { useRef } from 'react'
import { maintenantLocal, versUtc } from '@/lib/dates'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'

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
  const champPhoto = useRef<HTMLInputElement>(null)
  const [lectureEnCours, setLectureEnCours] = useState(false)
  const [proposition, setProposition] = useState<{
    resume: string
    evenement: { titre: string; date: string; heure: string | null; lieu: string | null } | null
    taches: { titre: string; echeance: string | null }[]
    articles: string[]
    photo: string
  } | null>(null)

  const { pathname } = useLocation()

  if (!membre || !foyer) return null
  // Sur l'écran Gastif, c'est son bouton d'envoi qui occupe cette place.
  if (pathname === '/gastif') return null

  const lirePhoto = async (fichiers: FileList | null) => {
    const fichier = fichiers?.[0]
    if (!fichier) return
    setLectureEnCours(true)
    try {
      const image = await compresserImage(fichier)
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/analyser-photo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ image }),
      })
      const donnees = (await reponse.json()) as { proposition?: Omit<NonNullable<typeof proposition>, 'photo'>; message?: string }
      if (donnees.proposition) {
        setProposition({
          resume: donnees.proposition.resume ?? '',
          evenement: donnees.proposition.evenement ?? null,
          taches: donnees.proposition.taches ?? [],
          articles: donnees.proposition.articles ?? [],
          photo: image,
        })
      } else {
        setConfirmation(donnees.message ?? 'Photo illisible — réessaie de plus près.')
        setTimeout(() => setConfirmation(null), 2500)
      }
    } finally {
      setLectureEnCours(false)
    }
  }

  const validerProposition = async () => {
    if (!proposition) return
    let creations = 0
    if (proposition.evenement?.date) {
      const heure = proposition.evenement.heure ?? '09:00'
      const debutLocal = new Date(`${proposition.evenement.date}T${heure}:00`)
      const finLocal = new Date(debutLocal.getTime() + 3600_000)
      await creerEvenement(foyer.id, membre.id, {
        titre: proposition.evenement.titre, debut_a: versUtc(debutLocal), fin_a: versUtc(finLocal),
        lieu: proposition.evenement.lieu, participants: [], journee_entiere: false,
      })
      creations += 1
    }
    for (const tache of proposition.taches) {
      await creerTache(foyer.id, membre.id, {
        titre: tache.titre, assignee_id: null, echeance: tache.echeance,
        rrule: null, effort_minutes: 10, groupe_rotation: null,
      })
      creations += 1
    }
    if (courses.data?.liste) {
      for (const article of proposition.articles) {
        await ajouterArticle(courses.data.liste.id, membre.id, article, devinerRayon(article))
        creations += 1
      }
    }
    const idSas = crypto.randomUUID()
    await muter({
      table: 'sas', type: 'insert', cible_id: idSas,
      charge: {
        id: idSas, foyer_id: foyer.id, auteur_id: membre.id, type: 'photo',
        media_url: proposition.photo, transcription: proposition.resume,
        interpretation: { evenement: proposition.evenement, taches: proposition.taches, articles: proposition.articles },
        statut: 'valide',
      },
    })
    await Promise.all([
      clientRequetes.invalidateQueries({ queryKey: ['evenements'] }),
      clientRequetes.invalidateQueries({ queryKey: ['taches'] }),
      clientRequetes.invalidateQueries({ queryKey: ['courses'] }),
    ])
    setProposition(null)
    setConfirmation(`${creations} élément${creations > 1 ? 's' : ''} créé${creations > 1 ? 's' : ''} ✓`)
    setTimeout(() => {
      setConfirmation(null)
      setOuvert(false)
    }, 1400)
  }

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
      {/* Le Perroquet 🦜 a pris la grande place à droite — le Sas vit ici, discret. */}
      <motion.button
        onClick={() => setOuvert(true)}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        aria-label="Le Sas — capture rapide"
        className="degrade-froid calage-fixe fixed left-4 z-30 flex h-11 w-11 items-center justify-center
          rounded-full text-white opacity-90 shadow-carte"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      >
        <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true">
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
              {proposition ? (
                <div className="flex flex-col gap-3">
                  <p className="text-corps font-[590] text-encre">STG a lu :</p>
                  <p className="text-corps-2 text-encre-2">{proposition.resume}</p>
                  <div className="rounded-xl bg-fond-sourd p-3 text-corps-2 text-encre">
                    {proposition.evenement && (
                      <p>📅 {proposition.evenement.titre} — {proposition.evenement.date}{proposition.evenement.heure ? ` à ${proposition.evenement.heure}` : ''}</p>
                    )}
                    {proposition.taches.map((t, i) => (
                      <p key={i}>✅ {t.titre}{t.echeance ? ` (avant le ${t.echeance})` : ''}</p>
                    ))}
                    {proposition.articles.map((a, i) => (
                      <p key={i}>🛒 {a}</p>
                    ))}
                    {!proposition.evenement && proposition.taches.length === 0 && proposition.articles.length === 0 && (
                      <p className="text-encre-3">Rien d'actionnable détecté — la photo sera gardée dans le Sas.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <BoutonEnvoi variante="valider" pleineLargeur onEnvoi={validerProposition} enfantsPendant="Création…">
                      Tout créer
                    </BoutonEnvoi>
                    <Bouton variante="discret" onClick={() => setProposition(null)}>
                      Annuler
                    </Bouton>
                  </div>
                </div>
              ) : (
              <>
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
              <BoutonEnvoi
                variante="soleil"
                pleineLargeur
                enCours={lectureEnCours}
                onClick={() => champPhoto.current?.click()}
                enfantsPendant="STG lit la photo…"
              >
                📷 Photographier un document
              </BoutonEnvoi>
              <input
                ref={champPhoto} type="file" accept="image/*" capture="environment" hidden
                aria-hidden="true"
                onChange={(e) => {
                  void lirePhoto(e.target.files)
                  e.target.value = '' // pour pouvoir reprendre la même photo
                }}
              />
              <p className="text-legende text-encre-3">
                Pour les courses, « piles et lait » fait deux articles. Le mot de l’école en photo →
                événement + tâche + courses, d’un coup.
              </p>
              </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Feuille>
    </>
  )
}
