// La chronologie du jour : une ligne verticale douce, l'heure à gauche,
// les rendez-vous en cartes — passé estompé, « en ce moment » qui respire.
import type { LigneEvenement, LigneMembre } from '@/lib/basedonnees.types'
import { formatHeure, maintenantLocal } from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'

interface Props {
  evenements: LigneEvenement[]
  membres: LigneMembre[]
}

export function ChronologieJour({ evenements, membres }: Props) {
  const maintenant = maintenantLocal().getTime()
  const horaires = evenements
    .filter((e) => !e.journee_entiere)
    .sort((a, b) => a.debut_a.localeCompare(b.debut_a))
  const journeeEntiere = evenements.filter((e) => e.journee_entiere)

  const membresDe = (e: LigneEvenement) =>
    e.participants.length === 0
      ? membres.filter((m) => m.role !== 'guest')
      : membres.filter((m) => e.participants.includes(m.id))

  if (horaires.length === 0 && journeeEntiere.length === 0) {
    return (
      <p className="py-6 text-center text-corps-2 text-encre-3">
        Journée libre — rien sur la chronologie. 🌤
      </p>
    )
  }

  return (
    <div className="pb-1">
      {journeeEntiere.map((e) => (
        <div
          key={e.id}
          className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: 'color-mix(in srgb, var(--ardoise) 10%, transparent)' }}
        >
          <span aria-hidden="true">📌</span>
          <span className="flex-1 text-corps-2 font-[590] text-encre">{e.titre}</span>
          <span className="text-legende text-encre-3">toute la journée</span>
        </div>
      ))}

      <ol className="relative ml-14">
        {/* Le fil conducteur : un dégradé discret qui traverse la journée */}
        <span
          aria-hidden="true"
          className="absolute -left-[7px] bottom-2 top-2 w-[2px] rounded-full opacity-30"
          style={{ background: 'linear-gradient(180deg, var(--corail), var(--ardoise), var(--sauge))' }}
        />
        {horaires.map((e) => {
          const debut = new Date(e.debut_a).getTime()
          const fin = new Date(e.fin_a).getTime()
          const passe = fin < maintenant
          const enCours = debut <= maintenant && maintenant <= fin
          const couleurs = membresDe(e).map((m) => couleurMembre(m.couleur))
          return (
            <li key={e.id} className={`relative pb-3 last:pb-0 ${passe ? 'opacity-50' : ''}`}>
              {/* L'heure, calée à gauche du fil */}
              <span className="chiffres absolute -left-14 top-1.5 w-11 text-right text-note font-[590] text-encre-3">
                {formatHeure(e.debut_a)}
              </span>
              {/* Le point sur le fil — il respire pendant l'événement */}
              <span
                aria-hidden="true"
                className={`absolute -left-[13px] top-2 h-3.5 w-3.5 rounded-full border-2 border-fond-eleve
                  ${enCours ? 'animate-pulse' : ''}`}
                style={{ background: couleurs[0] ?? 'var(--ardoise)' }}
              />
              <div
                className={`ml-3 rounded-lg px-3 py-2 ${enCours ? 'shadow-carte' : ''}`}
                style={{
                  background: enCours
                    ? `color-mix(in srgb, ${couleurs[0] ?? 'var(--ardoise)'} 14%, var(--fond-eleve))`
                    : 'color-mix(in srgb, var(--encre-3) 7%, transparent)',
                }}
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-corps-2 font-[590] text-encre">{e.titre}</p>
                  {enCours && (
                    <span className="shrink-0 text-legende font-[700]" style={{ color: couleurs[0] }}>
                      en ce moment
                    </span>
                  )}
                  <span className="flex shrink-0 gap-0.5">
                    {couleurs.map((c, i) => (
                      <span key={i} className="h-2 w-2 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                </div>
                <p className="chiffres text-legende text-encre-3">
                  {formatHeure(e.debut_a)} – {formatHeure(e.fin_a)}
                  {e.lieu ? ` · ${e.lieu}` : ''}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
