// 🎒 La Garde de Gabriel : le planning partagé façon Doodle — QUI le dépose,
// QUI le récupère, OÙ. Vue SEMAINE (détail) et vue MOIS (calendrier), avec
// navigation ‹ › propre. En plus de Stéphane et Tiphaine, on peut ajouter
// ses propres personnes : Mamie, la nounou, un copain…
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { Feuille } from '@/design/composants/Feuille'
import { PastilleMembre } from '@/design/composants/PastilleMembre'

// Un créneau : qui s'en occupe, où, à quelle heure, une note.
// `qui` contient l'id d'un membre du foyer, OU « perso:Nom » pour une
// personne ajoutée à la main (Mamie, nounou…).
export interface CreneauGarde {
  qui: string | null
  lieu: string
  heure: string
  note: string
}

type JourGarde = { matin?: CreneauGarde; soir?: CreneauGarde }
type PlanningGarde = Record<string, JourGarde> // clé : AAAA-MM-JJ

const MOMENTS = [
  { cle: 'matin' as const, libelle: 'Dépôt', icone: '🌅' },
  { cle: 'soir' as const, libelle: 'Récupération', icone: '🌆' },
]

const dateIso = (d: Date) => {
  const decale = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return decale.toISOString().slice(0, 10)
}

// Le lundi de la semaine du jour donné.
const debutSemaine = (d: Date) => {
  const copie = new Date(d)
  copie.setHours(12, 0, 0, 0)
  copie.setDate(copie.getDate() - ((copie.getDay() + 6) % 7))
  return copie
}

const ajouterJours = (d: Date, n: number) => {
  const copie = new Date(d)
  copie.setDate(copie.getDate() + n)
  return copie
}

export function EcranGarde() {
  const { foyer, membres } = utiliserSession()
  const clientRequetes = useQueryClient()
  const adultes = membres.filter((m) => m.role === 'adult')

  // Le planning ET les personnes ajoutées, relus du serveur (ce que l'autre
  // parent vient de cocher apparaît au retour au premier plan).
  const donnees = useQuery({
    queryKey: ['garde'],
    enabled: !!foyer,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<{ plan: PlanningGarde; gardiens: string[] }> => {
      const { data } = await supabase.from('foyers').select('reglages').eq('id', foyer?.id ?? '').single()
      const reglages = (data?.reglages as Record<string, unknown> | null) ?? {}
      return {
        plan: (reglages['garde'] ?? {}) as PlanningGarde,
        gardiens: Array.isArray(reglages['garde_gardiens']) ? (reglages['garde_gardiens'] as string[]) : [],
      }
    },
  })
  const plan = donnees.data?.plan ?? {}
  const gardiens = donnees.data?.gardiens ?? []

  const [vue, setVue] = useState<'semaine' | 'mois'>(() => {
    try {
      return localStorage.getItem('stg-garde-vue') === 'mois' ? 'mois' : 'semaine'
    } catch {
      return 'semaine'
    }
  })
  const changerVue = (v: 'semaine' | 'mois') => {
    setVue(v)
    try {
      localStorage.setItem('stg-garde-vue', v)
    } catch {
      // sans mémoire, tant pis
    }
  }
  // L'ancre de navigation : un jour de la semaine (ou du mois) affiché.
  const [ancre, setAncre] = useState(() => new Date())
  const [edition, setEdition] = useState<{ date: string; moment: 'matin' | 'soir' } | null>(null)
  const [jourOuvert, setJourOuvert] = useState<string | null>(null)

  const lieuxRecents = [
    ...new Set(
      Object.values(plan)
        .flatMap((j) => [j.matin?.lieu, j.soir?.lieu])
        .filter((l): l is string => !!l?.trim()),
    ),
  ].slice(0, 8)

  const enregistrer = async (date: string, moment: 'matin' | 'soir', creneau: CreneauGarde | null) => {
    if (!foyer) return
    // Relecture fraîche : on n'écrase JAMAIS ce que l'autre vient de cocher.
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    const suivant: PlanningGarde = { ...((base['garde'] ?? {}) as PlanningGarde) }
    const jour: JourGarde = { ...(suivant[date] ?? {}) }
    if (creneau) jour[moment] = creneau
    else delete jour[moment]
    if (jour.matin || jour.soir) suivant[date] = jour
    else delete suivant[date]
    const limite = dateIso(new Date(Date.now() - 60 * 86400000))
    for (const cle of Object.keys(suivant)) if (cle < limite) delete suivant[cle]
    await supabase.from('foyers').update({ reglages: { ...base, garde: suivant } }).eq('id', foyer.id)
    await clientRequetes.invalidateQueries({ queryKey: ['garde'] })
  }

  const ajouterGardien = async (nom: string) => {
    const propre = nom.trim()
    if (!foyer || !propre) return
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    const actuels = Array.isArray(base['garde_gardiens']) ? (base['garde_gardiens'] as string[]) : []
    if (actuels.some((g) => g.toLowerCase() === propre.toLowerCase())) return
    await supabase.from('foyers').update({ reglages: { ...base, garde_gardiens: [...actuels, propre] } }).eq('id', foyer.id)
    await clientRequetes.invalidateQueries({ queryKey: ['garde'] })
  }

  const retirerGardien = async (nom: string) => {
    if (!foyer) return
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    const actuels = Array.isArray(base['garde_gardiens']) ? (base['garde_gardiens'] as string[]) : []
    await supabase.from('foyers').update({ reglages: { ...base, garde_gardiens: actuels.filter((g) => g !== nom) } }).eq('id', foyer.id)
    await clientRequetes.invalidateQueries({ queryKey: ['garde'] })
  }

  // Qui est-ce ? (membre du foyer ou personne ajoutée « perso:Nom »)
  const afficherQui = (qui: string | null | undefined): { nom: string; membre?: (typeof adultes)[number] } | null => {
    if (!qui) return null
    if (qui.startsWith('perso:')) return { nom: qui.slice(6) }
    const membre = adultes.find((a) => a.id === qui)
    return membre ? { nom: membre.prenom, membre } : null
  }

  const aujourdhui = dateIso(new Date())
  const lundi = debutSemaine(ancre)
  const joursSemaine = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i))

  // La grille du mois : toutes les semaines qui touchent le mois de l'ancre.
  const premierDuMois = new Date(ancre.getFullYear(), ancre.getMonth(), 1, 12)
  const grille: Date[][] = []
  let curseur = debutSemaine(premierDuMois)
  while (curseur.getMonth() === ancre.getMonth() || grille.length === 0 || ajouterJours(curseur, 6).getMonth() === ancre.getMonth()) {
    grille.push(Array.from({ length: 7 }, (_, i) => ajouterJours(curseur, i)))
    curseur = ajouterJours(curseur, 7)
    if (grille.length > 6) break
  }

  const naviguerPeriode = (sens: -1 | 1) => {
    navigator.vibrate?.(4)
    setAncre((a) =>
      vue === 'semaine' ? ajouterJours(a, sens * 7) : new Date(a.getFullYear(), a.getMonth() + sens, 15, 12),
    )
  }

  const titrePeriode =
    vue === 'semaine'
      ? `${lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${ajouterJours(lundi, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
      : ancre.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const surPeriodeActuelle =
    vue === 'semaine'
      ? dateIso(debutSemaine(new Date())) === dateIso(lundi)
      : new Date().getMonth() === ancre.getMonth() && new Date().getFullYear() === ancre.getFullYear()

  const creneauEnEdition = edition ? plan[edition.date]?.[edition.moment] : undefined

  // Une ligne de créneau (utilisée par la semaine ET la fiche d'un jour du mois).
  const LigneCreneau = ({ date, moment }: { date: string; moment: (typeof MOMENTS)[number] }) => {
    const creneau = plan[date]?.[moment.cle]
    const personne = afficherQui(creneau?.qui)
    return (
      <button
        onClick={() => {
          setJourOuvert(null)
          setEdition({ date, moment: moment.cle })
        }}
        className="flex min-h-sur-tactile w-full items-center gap-2 rounded-lg bg-fond-sourd px-3 py-2 text-left active:opacity-80"
      >
        <span aria-hidden="true">{moment.icone}</span>
        <span className="w-24 shrink-0 text-legende text-encre-3">{moment.libelle}</span>
        {personne ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {personne.membre ? (
              <PastilleMembre membre={personne.membre} taille={24} />
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-encre-2/15 text-[12px] font-[700] text-encre-2">
                {personne.nom.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-corps-2 text-encre">
              <strong>{personne.nom}</strong>
              {creneau?.lieu ? ` · ${creneau.lieu}` : ''}
              {creneau?.heure ? ` · ${creneau.heure}` : ''}
            </span>
          </span>
        ) : (
          <span className="flex-1 text-corps-2 font-[590] text-ambre">À décider ›</span>
        )}
      </button>
    )
  }

  // La petite pastille d'un créneau dans la grille du mois.
  const PastilleMois = ({ creneau }: { creneau: CreneauGarde | undefined }) => {
    const personne = afficherQui(creneau?.qui)
    if (!personne) return <span className="block h-4 rounded bg-ambre/25" aria-hidden="true" />
    return (
      <span
        className="block truncate rounded px-0.5 text-center text-[10px] font-[700] leading-4 text-encre"
        style={{
          background: personne.membre
            ? `color-mix(in srgb, var(--${personne.membre.couleur}) 30%, transparent)`
            : 'color-mix(in srgb, var(--encre-2) 18%, transparent)',
        }}
      >
        {personne.nom.slice(0, 4)}
      </span>
    )
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🎒 La Garde de Gabriel</h1>
        <p className="text-legende text-encre-3">Qui dépose, qui récupère, où — à deux (ou plus).</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {/* La barre de pilotage : Semaine / Mois, ‹ période ›, Aujourd'hui. */}
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-trait bg-fond-eleve">
            {(['semaine', 'mois'] as const).map((v) => (
              <button
                key={v}
                onClick={() => changerVue(v)}
                aria-pressed={vue === v}
                className={`min-h-sur-tactile px-4 text-corps-2 font-[590] capitalize
                  ${vue === v ? 'bg-ardoise text-white' : 'text-encre-2'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex flex-1 items-center justify-end gap-1">
            <button onClick={() => naviguerPeriode(-1)} aria-label="Période précédente" className="flex h-11 w-11 items-center justify-center rounded-full bg-fond-eleve text-encre shadow-carte">
              ‹
            </button>
            <span className="min-w-[92px] text-center text-corps-2 font-[590] capitalize text-encre">{titrePeriode}</span>
            <button onClick={() => naviguerPeriode(1)} aria-label="Période suivante" className="flex h-11 w-11 items-center justify-center rounded-full bg-fond-eleve text-encre shadow-carte">
              ›
            </button>
          </div>
        </div>
        {!surPeriodeActuelle && (
          <Bouton variante="discret" onClick={() => setAncre(new Date())}>
            ↩︎ Revenir à aujourd'hui
          </Bouton>
        )}

        {/* ——— VUE SEMAINE : le détail, jour par jour. */}
        {vue === 'semaine' &&
          joursSemaine.map((d) => {
            const cle = dateIso(d)
            const estAujourdhui = cle === aujourdhui
            return (
              <div key={cle} className={`rounded-xl bg-fond-eleve p-3 shadow-carte ${estAujourdhui ? 'ring-2 ring-[var(--sauge)]' : ''}`}>
                <p className="mb-2 text-corps-2 font-[590] capitalize text-encre">
                  {d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {estAujourdhui && <span className="ml-2 rounded-full bg-sauge/15 px-2 py-0.5 text-legende font-[700] text-fait">aujourd'hui</span>}
                </p>
                <div className="flex flex-col gap-1.5">
                  {MOMENTS.map((moment) => (
                    <LigneCreneau key={moment.cle} date={cle} moment={moment} />
                  ))}
                </div>
              </div>
            )
          })}

        {/* ——— VUE MOIS : le calendrier — un appui sur un jour l'ouvre. */}
        {vue === 'mois' && (
          <div className="rounded-xl bg-fond-eleve p-2 shadow-carte">
            <div className="grid grid-cols-7 gap-1">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => (
                <span key={i} className="py-1 text-center text-legende font-[590] text-encre-3">{j}</span>
              ))}
              {grille.flat().map((d) => {
                const cle = dateIso(d)
                const jour = plan[cle]
                const dansLeMois = d.getMonth() === ancre.getMonth()
                const estAujourdhui = cle === aujourdhui
                return (
                  <button
                    key={cle}
                    onClick={() => setJourOuvert(cle)}
                    aria-label={`Ouvrir le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                    className={`flex min-h-[64px] flex-col gap-0.5 rounded-lg p-1 text-left
                      ${dansLeMois ? '' : 'opacity-35'}
                      ${estAujourdhui ? 'bg-sauge/15 ring-1 ring-[var(--sauge)]' : 'bg-fond-sourd'}`}
                  >
                    <span className={`chiffres text-legende ${estAujourdhui ? 'font-[700] text-fait' : 'text-encre-3'}`}>
                      {d.getDate()}
                    </span>
                    {jour ? (
                      <>
                        <PastilleMois creneau={jour.matin} />
                        <PastilleMois creneau={jour.soir} />
                      </>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <p className="px-1 pb-1 pt-2 text-legende text-encre-3">
              Pastille du haut : 🌅 dépôt · pastille du bas : 🌆 récupération. Orange = à décider.
            </p>
          </div>
        )}
      </div>

      {/* La fiche d'un jour (depuis le calendrier du mois). */}
      <Feuille
        ouverte={jourOuvert !== null}
        onFermer={() => setJourOuvert(null)}
        titre={jourOuvert ? new Date(`${jourOuvert}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
      >
        {jourOuvert && (
          <div className="flex flex-col gap-1.5">
            {MOMENTS.map((moment) => (
              <LigneCreneau key={moment.cle} date={jourOuvert} moment={moment} />
            ))}
          </div>
        )}
      </Feuille>

      {/* Le choix : qui, où, à quelle heure — en trois appuis. */}
      <Feuille
        ouverte={edition !== null}
        onFermer={() => setEdition(null)}
        titre={
          edition
            ? `${MOMENTS.find((m) => m.cle === edition.moment)?.icone} ${MOMENTS.find((m) => m.cle === edition.moment)?.libelle} — ${new Date(`${edition.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
            : ''
        }
      >
        {edition && (
          <FormCreneau
            cleFeuille={`${edition.date}-${edition.moment}`}
            initial={creneauEnEdition ?? null}
            adultes={adultes}
            gardiens={gardiens}
            lieuxRecents={lieuxRecents}
            surAjoutGardien={ajouterGardien}
            surRetraitGardien={retirerGardien}
            surEnregistrement={async (creneau) => {
              await enregistrer(edition.date, edition.moment, creneau)
              setEdition(null)
            }}
            surEffacement={
              creneauEnEdition
                ? async () => {
                    await enregistrer(edition.date, edition.moment, null)
                    setEdition(null)
                  }
                : undefined
            }
          />
        )}
      </Feuille>
    </div>
  )
}

function FormCreneau({
  cleFeuille,
  initial,
  adultes,
  gardiens,
  lieuxRecents,
  surAjoutGardien,
  surRetraitGardien,
  surEnregistrement,
  surEffacement,
}: {
  cleFeuille: string
  initial: CreneauGarde | null
  adultes: { id: string; prenom: string; couleur: string; role: string }[]
  gardiens: string[]
  lieuxRecents: string[]
  surAjoutGardien: (nom: string) => Promise<void>
  surRetraitGardien: (nom: string) => Promise<void>
  surEnregistrement: (c: CreneauGarde) => Promise<void>
  surEffacement?: () => Promise<void>
}) {
  const [qui, setQui] = useState<string | null>(initial?.qui ?? null)
  const [lieu, setLieu] = useState(initial?.lieu ?? '')
  const [heure, setHeure] = useState(initial?.heure ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [confirme, setConfirme] = useState(false)
  const [ajout, setAjout] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')

  return (
    <div key={cleFeuille} className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-legende font-[590] text-encre-3">Qui s'en occupe ?</p>
        <div className="flex flex-wrap gap-2">
          {adultes.map((a) => (
            <button
              key={a.id}
              onClick={() => setQui((q) => (q === a.id ? null : a.id))}
              aria-pressed={qui === a.id}
              className={`flex min-h-sur-tactile items-center gap-2 rounded-full border px-4 py-2 text-corps-2 font-[590]
                ${qui === a.id ? 'border-transparent bg-sauge/20 text-encre shadow-carte' : 'border-trait bg-fond-eleve text-encre-2'}`}
            >
              <PastilleMembre membre={a as never} taille={26} />
              {a.prenom}
              {qui === a.id && ' ✓'}
            </button>
          ))}
          {gardiens.map((g) => {
            const valeur = `perso:${g}`
            return (
              <button
                key={valeur}
                onClick={() => setQui((q) => (q === valeur ? null : valeur))}
                aria-pressed={qui === valeur}
                className={`flex min-h-sur-tactile items-center gap-2 rounded-full border px-4 py-2 text-corps-2 font-[590]
                  ${qui === valeur ? 'border-transparent bg-sauge/20 text-encre shadow-carte' : 'border-trait bg-fond-eleve text-encre-2'}`}
              >
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-encre-2/15 text-[13px] font-[700] text-encre-2">
                  {g.charAt(0).toUpperCase()}
                </span>
                {g}
                {qui === valeur && ' ✓'}
              </button>
            )
          })}
          <button
            onClick={() => setAjout((a) => !a)}
            className="flex min-h-sur-tactile items-center rounded-full border border-dashed border-trait px-4 py-2 text-corps-2 font-[590] text-encre-3"
          >
            + Quelqu'un d'autre
          </button>
        </div>
        {ajout && (
          <div className="mt-2 flex items-end gap-2">
            <div className="flex-1">
              <ChampTexte
                etiquette="Son prénom (Mamie, la nounou…)"
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                placeholder="Mamie"
              />
            </div>
            <BoutonEnvoi
              variante="valider"
              enfantsPendant="…"
              onEnvoi={async () => {
                const nom = nouveauNom.trim()
                if (!nom) return
                await surAjoutGardien(nom)
                setQui(`perso:${nom}`)
                setNouveauNom('')
                setAjout(false)
              }}
            >
              Ajouter
            </BoutonEnvoi>
          </div>
        )}
        {ajout && gardiens.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gardiens.map((g) => (
              <button
                key={g}
                onClick={() => void surRetraitGardien(g)}
                className="rounded-full bg-fond-sourd px-3 py-1.5 text-legende text-encre-3"
                aria-label={`Retirer ${g} de la liste`}
              >
                {g} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <ChampTexte
          etiquette="Où ? (école, judo, chez Mamie…)"
          value={lieu}
          onChange={(e) => setLieu(e.target.value)}
          placeholder="Le nom de l'endroit suffit"
        />
        {lieuxRecents.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {lieuxRecents.map((l) => (
              <button
                key={l}
                onClick={() => setLieu(l)}
                className="rounded-full bg-fond-sourd px-3 py-1.5 text-legende text-encre-2"
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      <ChampTexte etiquette="À quelle heure ? (facultatif)" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
      <ChampTexte etiquette="Une note ? (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Prendre le sac de sport…" />

      <BoutonEnvoi
        pleineLargeur
        variante="valider"
        enfantsPendant="Enregistrement…"
        onEnvoi={() => surEnregistrement({ qui, lieu: lieu.trim(), heure, note: note.trim() })}
      >
        Enregistrer ✓
      </BoutonEnvoi>
      {surEffacement && (
        <Bouton
          pleineLargeur
          variante={confirme ? 'urgent' : 'discret'}
          onClick={() => {
            if (!confirme) {
              setConfirme(true)
              window.setTimeout(() => setConfirme(false), 3000)
              return
            }
            void surEffacement()
          }}
        >
          {confirme ? 'Confirmer l’effacement ?' : 'Effacer ce créneau'}
        </Bouton>
      )}
    </div>
  )
}
