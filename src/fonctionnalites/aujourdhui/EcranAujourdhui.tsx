// L'accueil : un tableau de bord. Le rouge n'apparaît que quand ça urge,
// chaque bloc se coche, se tape, se personnalise. Le Fil est un bloc optionnel.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import {
  basculerArticle,
  completerTache,
  utiliserCelebrationsProches,
  utiliserEvenementsDuJour,
  utiliserEvenementsPeriode,
  utiliserListeCourses,
  utiliserTachesOuvertes,
} from '@/lib/requetes'
import {
  bornesJourneeLocale,
  dateIsoJour,
  differenceInCalendarDays,
  formatHeure,
  formatJourLong,
  maintenantLocal,
} from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'
import type { LigneIdeeCadeau, LigneTache } from '@/lib/basedonnees.types'
import { ChronologieJour } from './ChronologieJour'
import { BriefGastif } from './BriefGastif'
import { Coche } from '@/design/composants/Coche'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonMiseAJour } from '@/design/composants/BoutonMiseAJour'
import { importerAgendaSiBesoin } from '@/lib/synchro-agenda'

type CleBloc = 'urgent' | 'brief' | 'prix' | 'agenda' | 'taches' | 'penser' | 'courses' | 'menus' | 'fil'

const BLOCS: { cle: CleBloc; libelle: string }[] = [
  { cle: 'urgent', libelle: '🔴 Relances urgentes' },
  { cle: 'brief', libelle: 'ILY Le brief de Gastif' },
  { cle: 'prix', libelle: '💸 Baisses de prix (cadeaux)' },
  { cle: 'agenda', libelle: '📅 La journée' },
  { cle: 'taches', libelle: '✅ À faire' },
  { cle: 'penser', libelle: '💡 À penser' },
  { cle: 'courses', libelle: '🛒 Courses' },
  { cle: 'menus', libelle: '🍽️ Ce soir on mange' },
  { cle: 'fil', libelle: '🕐 Chronologie du jour' },
]

const DEFAUT: Record<CleBloc, boolean> = {
  urgent: true, brief: true, prix: true, agenda: true, taches: true,
  penser: true, courses: true, menus: true, fil: false,
}

function chargerBlocs(): Record<CleBloc, boolean> {
  try {
    const brut = localStorage.getItem('foyer-blocs')
    return brut ? { ...DEFAUT, ...(JSON.parse(brut) as Record<CleBloc, boolean>) } : DEFAUT
  } catch {
    return DEFAUT
  }
}

export function EcranAujourdhui() {
  const { membre, membres } = utiliserSession()
  const clientRequetes = useQueryClient()
  const naviguer = useNavigate()
  const evenements = utiliserEvenementsDuJour()
  const taches = utiliserTachesOuvertes()
  const celebrations = utiliserCelebrationsProches(365)
  const courses = utiliserListeCourses()
  // Le prochain événement à venir (14 jours), pour qu'une entrée future se voie tout de suite.
  const finJournee = bornesJourneeLocale().fin
  const evenementsAVenir = utiliserEvenementsPeriode(
    finJournee,
    new Date(maintenantLocal().getTime() + 14 * 24 * 3600 * 1000).toISOString(),
  )
  const [blocs, setBlocs] = useState(chargerBlocs)
  const [personnaliser, setPersonnaliser] = useState(false)

  const estAdulte = membre?.role === 'adult'
  const aujourdHui = dateIsoJour(maintenantLocal())

  // Les calendriers Apple se resynchronisent tout seuls à l'ouverture
  // (au plus toutes les 4 h — la tournée de 7h complète le dispositif).
  useEffect(() => {
    importerAgendaSiBesoin(clientRequetes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const documents = useQuery({
    queryKey: ['documents', 'expirants'],
    queryFn: async () => {
      const limite = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('documents').select('*')
        .not('expire_le', 'is', null).lte('expire_le', limite).order('expire_le')
      if (error) return []
      return data
    },
    enabled: estAdulte,
  })

  // 💸 Les cadeaux suivis dont le prix est sous leur plus haut relevé.
  const baissesPrix = useQuery({
    queryKey: ['idees', 'baisses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('idees_cadeaux').select('*').eq('offert', false).not('url', 'is', null)
      if (error) return []
      const bonsPlans: { idee: LigneIdeeCadeau; plusHaut: number }[] = []
      for (const i of data) {
        const valeurs = (i.historique_prix ?? []).map((h) => h.prix)
        if (valeurs.length === 0 || i.prix === null) continue
        const plusHaut = Math.max(...valeurs)
        if (plusHaut - i.prix > 0.01) bonsPlans.push({ idee: i, plusHaut })
      }
      return bonsPlans.sort(
        (a, b) => (b.plusHaut - (b.idee.prix ?? 0)) - (a.plusHaut - (a.idee.prix ?? 0)),
      )
    },
    enabled: estAdulte,
  })

  const colis = useQuery({
    queryKey: ['colis', 'en-cours'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('colis').select('*').in('statut', ['attendu', 'en_transit'])
      if (error) return []
      return data
    },
    enabled: estAdulte,
  })

  const repasDuJour = useQuery({
    queryKey: ['repas', 'du-jour'],
    queryFn: async (): Promise<{ creneau: string; texte: string }[]> => {
      const { data, error } = await supabase.from('repas').select('*').eq('date', aujourdHui)
      if (error || data.length === 0) return []
      const resultats: { creneau: string; texte: string }[] = []
      for (const ligne of data) {
        let texte = ligne.notes ?? ''
        if (!texte && ligne.recette_id) {
          const { data: recettes } = await supabase.from('recettes').select('*').eq('id', ligne.recette_id)
          texte = recettes?.[0]?.titre ?? 'Recette prévue'
        }
        if (texte) resultats.push({ creneau: ligne.creneau, texte })
      }
      const ordre = ['matin', 'midi', 'gouter', 'soir']
      return resultats.sort((a, b) => ordre.indexOf(a.creneau) - ordre.indexOf(b.creneau))
    },
  })

  const enregistrerBlocs = (suivants: Record<CleBloc, boolean>) => {
    setBlocs(suivants)
    localStorage.setItem('foyer-blocs', JSON.stringify(suivants))
  }

  const completer = (tache: LigneTache) => {
    if (!membre) return
    void completerTache(tache, membre.id, membres).then(() =>
      clientRequetes.invalidateQueries({ queryKey: ['taches'] }),
    )
  }

  // Les relances : tout ce qui est en retard ou imminent, en rouge, une seule fois.
  const relances = useMemo(() => {
    const liste: { id: string; texte: string; action?: () => void }[] = []
    for (const t of taches.data ?? []) {
      if (t.echeance !== null && t.echeance < aujourdHui) {
        liste.push({ id: `t-${t.id}`, texte: `En retard : ${t.titre}` })
      }
    }
    for (const d of documents.data ?? []) {
      if (!d.expire_le) continue
      const dans = differenceInCalendarDays(new Date(`${d.expire_le}T12:00:00`), maintenantLocal())
      if (dans < 0) liste.push({ id: `d-${d.id}`, texte: `Expiré : ${d.titre}` })
      else if (dans <= 15) liste.push({ id: `d-${d.id}`, texte: `${d.titre} expire dans ${dans} j` })
    }
    for (const c of celebrations.data ?? []) {
      const date = new Date(c.date)
      const prochaine = new Date(maintenantLocal().getFullYear(), date.getMonth(), date.getDate())
      if (prochaine < new Date(maintenantLocal().getFullYear(), maintenantLocal().getMonth(), maintenantLocal().getDate()))
        prochaine.setFullYear(prochaine.getFullYear() + 1)
      const dans = differenceInCalendarDays(prochaine, maintenantLocal())
      if (dans <= 1) liste.push({ id: `c-${c.id}`, texte: dans === 0 ? `Aujourd’hui : ${c.nom} 🎂` : `Demain : ${c.nom} 🎂` })
    }
    return liste
  }, [taches.data, documents.data, celebrations.data, aujourdHui])

  // TOUT ce qui est ouvert apparaît — pas seulement ce qui est daté d'aujourd'hui.
  const tachesOuvertes = taches.data ?? []
  const articlesRestants = (courses.data?.articles ?? []).filter((a) => !a.coche)
  const articlesCoches = (courses.data?.articles ?? []).filter((a) => a.coche)

  const celebrationsTriees = (celebrations.data ?? [])
    .map((c) => {
      const date = new Date(c.date)
      const prochaine = new Date(maintenantLocal().getFullYear(), date.getMonth(), date.getDate())
      if (prochaine < new Date(maintenantLocal().getFullYear(), maintenantLocal().getMonth(), maintenantLocal().getDate()))
        prochaine.setFullYear(prochaine.getFullYear() + 1)
      return { c, dans: differenceInCalendarDays(prochaine, maintenantLocal()) }
    })
    .sort((a, b) => a.dans - b.dans)

  const evenementsDuJour = (evenements.data ?? [])
    .filter((e) => !e.journee_entiere)
    .sort((a, b) => a.debut_a.localeCompare(b.debut_a))

  return (
    <div>
      <header className="verre verre-clair safe-haut sticky top-0 z-10 flex items-center justify-between px-5 pb-2 pt-3">
        <div>
          <h1 className="text-titre-2 capitalize text-encre">{formatJourLong(maintenantLocal())}</h1>
          <p className="text-note text-encre-3">Salut {membre?.prenom} 👋</p>
        </div>
        <div className="flex gap-1">
          <BoutonMiseAJour />
          <button
            onClick={() => naviguer('/recherche')}
            aria-label="Recherche globale"
            className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[17px]"
          >
            🔍
          </button>
          <button
            onClick={() => setPersonnaliser(true)}
            aria-label="Personnaliser le tableau de bord"
            className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[17px]"
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-3">
        {/* 🔴 Relances — le seul endroit où le rouge existe */}
        {blocs.urgent && relances.length > 0 && (
          <section
            className="rounded-xl p-4 text-white shadow-carte"
            style={{ background: 'linear-gradient(135deg, #e0705e, var(--urgent))' }}
          >
            <h2 className="mb-1 text-note font-[700] uppercase tracking-wide opacity-90">
              🔴 Relances — {relances.length}
            </h2>
            {relances.map((r) => (
              <p key={r.id} className="text-corps-2 font-[590]">• {r.texte}</p>
            ))}
          </section>
        )}

        {blocs.brief && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte">
            <BriefGastif evenements={evenements.data ?? []} taches={taches.data ?? []} />
          </section>
        )}

        {/* 💸 Baisses de prix — les cadeaux suivis passés sous leur plus haut */}
        {blocs.prix && estAdulte && (baissesPrix.data?.length ?? 0) > 0 && (
          <section
            className="rounded-xl p-4 text-white shadow-carte"
            style={{ background: 'linear-gradient(135deg, var(--sauge), #4f7d5e)' }}
          >
            <button onClick={() => naviguer('/nous/celebrations')} className="flex w-full items-center justify-between text-left">
              <h2 className="text-note font-[700] uppercase tracking-wide opacity-90">
                💸 Baisses de prix — {baissesPrix.data?.length}
              </h2>
              <span aria-hidden="true">›</span>
            </button>
            {(baissesPrix.data ?? []).slice(0, 4).map(({ idee, plusHaut }) => (
              <button
                key={idee.id}
                onClick={() => naviguer('/nous/celebrations')}
                className="mt-1 block w-full text-left text-corps-2 font-[590]"
              >
                • {idee.libelle}{' '}
                <span className="chiffres opacity-90">
                  <s>{plusHaut.toFixed(2)} €</s> → {(idee.prix ?? 0).toFixed(2)} €
                  {' '}(−{Math.round(((plusHaut - (idee.prix ?? 0)) / plusHaut) * 100)} %)
                </span>
              </button>
            ))}
            {(baissesPrix.data?.length ?? 0) > 4 && (
              <p className="mt-1 text-legende opacity-90">et {(baissesPrix.data?.length ?? 0) - 4} de plus…</p>
            )}
          </section>
        )}

        {blocs.agenda && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte">
            <button onClick={() => naviguer('/agenda')} className="mb-2 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">📅 La journée</h2>
              <span className="text-encre-3">›</span>
            </button>
            {evenementsDuJour.length === 0 ? (
              <p className="text-corps-2 text-encre-3">Rien au programme aujourd’hui.</p>
            ) : (
              evenementsDuJour.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border-b border-trait py-1.5 last:border-0">
                  <span className="chiffres w-12 text-note font-[590] text-encre-3">{formatHeure(e.debut_a)}</span>
                  <span className="flex-1 text-corps text-encre">{e.titre}</span>
                  <span className="flex gap-0.5">
                    {(e.participants.length === 0
                      ? membres.filter((m) => m.role !== 'guest')
                      : membres.filter((m) => e.participants.includes(m.id))
                    ).map((m) => (
                      <span key={m.id} className="h-2 w-2 rounded-full" style={{ background: couleurMembre(m.couleur) }} />
                    ))}
                  </span>
                </div>
              ))
            )}
            {(() => {
              const prochain = evenementsAVenir.data?.[0]
              if (!prochain) return null
              return (
                <p className="mt-1 border-t border-trait pt-1.5 text-corps-2 text-encre-3">
                  À venir :{' '}
                  <span className="capitalize">
                    {new Date(prochain.debut_a).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  {prochain.journee_entiere ? '' : ` · ${formatHeure(prochain.debut_a)}`} — {prochain.titre}
                </p>
              )
            })()}
          </section>
        )}

        {blocs.taches && tachesOuvertes.length > 0 && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte">
            <button onClick={() => naviguer('/maison')} className="mb-1 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">
                ✅ À faire — {tachesOuvertes.length}
              </h2>
              <span className="text-encre-3">›</span>
            </button>
            {tachesOuvertes.slice(0, 8).map((t) => {
              const assignee = membres.find((m) => m.id === t.assignee_id)
              const echeance =
                t.echeance === null
                  ? 'un jour'
                  : t.echeance < aujourdHui
                    ? 'retard'
                    : t.echeance === aujourdHui
                      ? 'aujourd’hui'
                      : new Date(`${t.echeance}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
              return (
                <div key={t.id} className="flex items-center gap-1 border-b border-trait py-0.5 last:border-0">
                  <Coche
                    cochee={false}
                    onBascule={() => completer(t)}
                    etiquette={`Marquer « ${t.titre} » comme faite`}
                    couleur={assignee ? couleurMembre(assignee.couleur) : undefined}
                  />
                  <span className="flex-1 text-corps text-encre">{t.titre}</span>
                  <span
                    className={`text-legende ${echeance === 'retard' ? 'font-[700] text-urgent' : 'chiffres text-encre-3'}`}
                  >
                    {echeance}
                  </span>
                </div>
              )
            })}
            {tachesOuvertes.length > 8 && (
              <p className="mt-1 text-legende text-encre-3">et {tachesOuvertes.length - 8} de plus…</p>
            )}
          </section>
        )}

        {blocs.penser && (celebrationsTriees.length > 0 || (documents.data?.length ?? 0) > 0 || (colis.data?.length ?? 0) > 0) && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte">
            <h2 className="mb-1 text-note font-[700] uppercase tracking-wide text-encre-3">💡 À penser</h2>
            {celebrationsTriees.slice(0, 4).map(({ c, dans }) => (
              <button key={c.id} onClick={() => naviguer('/nous/celebrations')} className="block w-full py-0.5 text-left text-corps-2 text-encre">
                🎂 {c.nom} <span className="chiffres text-encre-3">{dans === 0 ? '— aujourd’hui !' : `— J-${dans}`}</span>
              </button>
            ))}
            {celebrationsTriees.length > 4 && (
              <button onClick={() => naviguer('/nous/celebrations')} className="block w-full py-0.5 text-left text-legende text-encre-3">
                et {celebrationsTriees.length - 4} autre{celebrationsTriees.length - 4 > 1 ? 's' : ''} anniversaire{celebrationsTriees.length - 4 > 1 ? 's' : ''}…
              </button>
            )}
            {(documents.data ?? []).map((d) => (
              <button key={d.id} onClick={() => naviguer('/nous/coffre')} className="block w-full py-0.5 text-left text-corps-2 text-encre">
                🗄️ {d.titre} <span className="chiffres text-encre-3">— expire le {new Date(`${d.expire_le}T12:00:00`).toLocaleDateString('fr-FR')}</span>
              </button>
            ))}
            {(colis.data ?? []).map((c) => (
              <button key={c.id} onClick={() => naviguer('/nous/colis')} className="block w-full py-0.5 text-left text-corps-2 text-encre">
                📦 {c.libelle ?? c.numero} <span className="text-encre-3">— {c.statut === 'attendu' ? 'attendu' : 'en route'}</span>
              </button>
            ))}
          </section>
        )}

        {blocs.courses && (articlesRestants.length > 0 || articlesCoches.length > 0) && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte">
            <button onClick={() => naviguer('/maison?ajout=courses')} className="mb-1 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">
                🛒 Courses — {articlesRestants.length} à prendre
              </h2>
              <span className="text-encre-3">›</span>
            </button>
            {articlesRestants.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center gap-1">
                <Coche
                  cochee={false}
                  onBascule={() => {
                    if (membre) void basculerArticle(a, membre.id).then(() => clientRequetes.invalidateQueries({ queryKey: ['courses'] }))
                  }}
                  etiquette={`Cocher ${a.libelle}`}
                />
                <span className="text-corps-2 text-encre">{a.libelle}</span>
              </div>
            ))}
            {articlesRestants.length > 8 && (
              <p className="mt-1 text-legende text-encre-3">et {articlesRestants.length - 8} de plus…</p>
            )}
            {articlesCoches.slice(-3).map((a) => (
              <div key={a.id} className="flex items-center gap-1 opacity-60">
                <Coche
                  cochee
                  onBascule={() => {
                    if (membre) void basculerArticle(a, membre.id).then(() => clientRequetes.invalidateQueries({ queryKey: ['courses'] }))
                  }}
                  etiquette={`Décocher ${a.libelle}`}
                />
                <span className="text-corps-2 text-encre-3 line-through">{a.libelle}</span>
              </div>
            ))}
          </section>
        )}

        {blocs.menus && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte">
            <button onClick={() => naviguer('/maison')} className="flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">🍽️ Aujourd’hui on mange</h2>
              <span className="text-encre-3">›</span>
            </button>
            {(repasDuJour.data?.length ?? 0) === 0 ? (
              <p className="mt-1 text-corps text-encre">Rien de prévu — tape ici pour poser le menu.</p>
            ) : (
              (repasDuJour.data ?? []).map((r) => (
                <p key={r.creneau} className="mt-1 text-corps text-encre">
                  <span className="text-note font-[590] uppercase text-encre-3">
                    {{ matin: 'Matin', midi: 'Midi', gouter: 'Goûter', soir: 'Soir' }[r.creneau] ?? r.creneau}
                  </span>{' '}
                  — {r.texte}
                </p>
              ))
            )}
          </section>
        )}

        {blocs.fil && (
          <section className="rounded-xl bg-fond-eleve p-4 shadow-carte">
            <button onClick={() => naviguer('/agenda')} className="mb-2 flex w-full items-center justify-between">
              <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">🕐 Chronologie du jour</h2>
              <span className="text-encre-3">›</span>
            </button>
            <ChronologieJour membres={membres} evenements={evenements.data ?? []} />
          </section>
        )}
      </div>

      <Feuille ouverte={personnaliser} onFermer={() => setPersonnaliser(false)} titre="Personnaliser l’accueil">
        <div className="flex flex-col gap-1">
          {BLOCS.map((b) => (
            <label key={b.cle} className="flex min-h-sur-tactile items-center justify-between rounded-md px-2">
              <span className="text-corps text-encre">{b.libelle}</span>
              <input
                type="checkbox"
                checked={blocs[b.cle]}
                onChange={(e) => enregistrerBlocs({ ...blocs, [b.cle]: e.target.checked })}
                className="h-6 w-6 accent-[#6e9b7a]"
              />
            </label>
          ))}
          <p className="mt-2 text-legende text-encre-3">
            Chaque téléphone garde son propre réglage. Un bloc vide ne s’affiche pas, même activé.
          </p>
          <Bouton pleineLargeur variante="valider" onClick={() => setPersonnaliser(false)}>
            C’est réglé
          </Bouton>
        </div>
      </Feuille>
    </div>
  )
}
