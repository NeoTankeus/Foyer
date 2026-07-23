// 🎒 La Garde de Gabriel : le planning partagé façon Doodle — jour par jour,
// QUI le dépose le matin, QUI le récupère le soir, et OÙ (école, judo, chez
// Mamie…). Chacun coche, l'autre voit tout de suite. Fini les « c'est toi
// qui y vas ce soir ? ».
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

// Un créneau : qui s'en occupe (id du membre), où, à quelle heure, une note.
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

const JOURS_AFFICHES = 14

const dateIso = (d: Date) => {
  const decale = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return decale.toISOString().slice(0, 10)
}

export function EcranGarde() {
  const { foyer, membres } = utiliserSession()
  const clientRequetes = useQueryClient()
  const adultes = membres.filter((m) => m.role === 'adult')

  // Le planning se relit du serveur (et à chaque retour au premier plan) :
  // ce que l'autre parent vient de cocher apparaît sans rien faire.
  const planning = useQuery({
    queryKey: ['garde'],
    enabled: !!foyer,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<PlanningGarde> => {
      const { data } = await supabase.from('foyers').select('reglages').eq('id', foyer?.id ?? '').single()
      const brut = (data?.reglages as Record<string, unknown> | null)?.['garde']
      return (brut ?? {}) as PlanningGarde
    },
  })
  const plan = planning.data ?? {}

  const [edition, setEdition] = useState<{ date: string; moment: 'matin' | 'soir' } | null>(null)

  // Les lieux déjà utilisés, proposés en un appui (école, judo, chez Mamie…).
  const lieuxRecents = [
    ...new Set(
      Object.values(plan)
        .flatMap((j) => [j.matin?.lieu, j.soir?.lieu])
        .filter((l): l is string => !!l?.trim()),
    ),
  ].slice(0, 8)

  const enregistrer = async (date: string, moment: 'matin' | 'soir', creneau: CreneauGarde | null) => {
    if (!foyer) return
    // Relecture fraîche pour ne JAMAIS écraser un autre réglage (ni la coche
    // que l'autre parent vient de poser sur un autre jour).
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    const suivant: PlanningGarde = { ...((base['garde'] ?? {}) as PlanningGarde) }
    const jour: JourGarde = { ...(suivant[date] ?? {}) }
    if (creneau) jour[moment] = creneau
    else delete jour[moment]
    if (jour.matin || jour.soir) suivant[date] = jour
    else delete suivant[date]
    // Ménage : les jours vieux de plus de 60 jours sortent tout seuls.
    const limite = dateIso(new Date(Date.now() - 60 * 86400000))
    for (const cle of Object.keys(suivant)) if (cle < limite) delete suivant[cle]
    await supabase.from('foyers').update({ reglages: { ...base, garde: suivant } }).eq('id', foyer.id)
    await clientRequetes.invalidateQueries({ queryKey: ['garde'] })
  }

  const aujourdhui = dateIso(new Date())
  const jours = Array.from({ length: JOURS_AFFICHES }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })

  const creneauEnEdition = edition ? plan[edition.date]?.[edition.moment] : undefined

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🎒 La Garde de Gabriel</h1>
        <p className="text-legende text-encre-3">Qui dépose, qui récupère, où — jour par jour, à deux.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {jours.map((d) => {
          const cle = dateIso(d)
          const jour = plan[cle]
          const estAujourdhui = cle === aujourdhui
          return (
            <div key={cle} className={`rounded-xl bg-fond-eleve p-3 shadow-carte ${estAujourdhui ? 'ring-2 ring-[var(--sauge)]' : ''}`}>
              <p className="mb-2 text-corps-2 font-[590] text-encre">
                {d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                {estAujourdhui && <span className="ml-2 rounded-full bg-sauge/15 px-2 py-0.5 text-legende font-[700] text-fait">aujourd'hui</span>}
              </p>
              <div className="flex flex-col gap-1.5">
                {MOMENTS.map((moment) => {
                  const creneau = jour?.[moment.cle]
                  const responsable = adultes.find((a) => a.id === creneau?.qui)
                  return (
                    <button
                      key={moment.cle}
                      onClick={() => setEdition({ date: cle, moment: moment.cle })}
                      className="flex min-h-sur-tactile w-full items-center gap-2 rounded-lg bg-fond-sourd px-3 py-2 text-left active:opacity-80"
                    >
                      <span aria-hidden="true">{moment.icone}</span>
                      <span className="w-24 shrink-0 text-legende text-encre-3">{moment.libelle}</span>
                      {responsable ? (
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <PastilleMembre membre={responsable} taille={24} />
                          <span className="min-w-0 flex-1 truncate text-corps-2 text-encre">
                            <strong>{responsable.prenom}</strong>
                            {creneau?.lieu ? ` · ${creneau.lieu}` : ''}
                            {creneau?.heure ? ` · ${creneau.heure}` : ''}
                          </span>
                        </span>
                      ) : (
                        <span className="flex-1 text-corps-2 font-[590] text-ambre">À décider ›</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

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
            lieuxRecents={lieuxRecents}
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
  lieuxRecents,
  surEnregistrement,
  surEffacement,
}: {
  cleFeuille: string
  initial: CreneauGarde | null
  adultes: { id: string; prenom: string; couleur: string; role: string }[]
  lieuxRecents: string[]
  surEnregistrement: (c: CreneauGarde) => Promise<void>
  surEffacement?: () => Promise<void>
}) {
  const [qui, setQui] = useState<string | null>(initial?.qui ?? null)
  const [lieu, setLieu] = useState(initial?.lieu ?? '')
  const [heure, setHeure] = useState(initial?.heure ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [confirme, setConfirme] = useState(false)

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
        </div>
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
