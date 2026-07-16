// Le Fil — le tissage de la journée, de 6 h à 22 h.
// Toute la boldness de l'app passe ici. Le reste est silencieux.
import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { LigneEvenement, LigneMembre } from '@/lib/basedonnees.types'
import { couleurMembre } from '@/lib/couleurs'
import { formatHeure, maintenantLocal } from '@/lib/dates'
import { tresser } from './tressage'

const LARGEUR = 360
const HAUTEUR = 900
const HEURE_DEBUT = 6
const HEURE_FIN = 22

interface Props {
  membres: LigneMembre[]
  evenements: LigneEvenement[]
  onSelection?: (evenement: LigneEvenement) => void
}

export function LeFil({ membres, evenements, onSelection }: Props) {
  const mouvementReduit = useReducedMotion()

  const filants = useMemo(
    () => membres.filter((m) => m.role !== 'guest'),
    [membres],
  )

  const tissage = useMemo(
    () =>
      tresser({
        membres: filants.map((m) => ({ id: m.id, couleur: m.couleur, prenom: m.prenom })),
        evenements,
        largeur: LARGEUR,
        hauteur: HAUTEUR,
        heureDebut: HEURE_DEBUT,
        heureFin: HEURE_FIN,
      }),
    [filants, evenements],
  )

  const maintenant = maintenantLocal()
  const heureActuelle = maintenant.getHours() + maintenant.getMinutes() / 60
  const yMaintenant =
    heureActuelle >= HEURE_DEBUT && heureActuelle <= HEURE_FIN
      ? tissage.yPourHeure(heureActuelle)
      : null

  const heures = Array.from(
    { length: (HEURE_FIN - HEURE_DEBUT) / 2 + 1 },
    (_, i) => HEURE_DEBUT + i * 2,
  )

  return (
    <div>
      {tissage.journeesEntieres.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {tissage.journeesEntieres.map((evenement) => (
            <button
              key={evenement.id}
              onClick={() => onSelection?.(evenement)}
              className="rounded-full bg-fond-sourd px-3 py-2 text-note font-[500] text-encre-2"
            >
              {evenement.titre}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="w-full"
        role="img"
        aria-label="La journée de la famille, tissée heure par heure"
      >
        {/* L'axe des heures, discret */}
        {heures.map((heure) => (
          <g key={heure}>
            <text
              x={8}
              y={tissage.yPourHeure(heure) + 4}
              className="chiffres"
              fontSize="11"
              fill="var(--encre-3)"
            >
              {String(heure).padStart(2, '0')} h
            </text>
            <line
              x1={40}
              x2={LARGEUR - 12}
              y1={tissage.yPourHeure(heure)}
              y2={tissage.yPourHeure(heure)}
              stroke="var(--trait)"
              strokeWidth="0.5"
            />
          </g>
        ))}

        {/* La ligne de l'heure actuelle traverse le fil, en discret */}
        {yMaintenant !== null && (
          <g>
            <line
              x1={40}
              x2={LARGEUR - 12}
              y1={yMaintenant}
              y2={yMaintenant}
              stroke="var(--corail)"
              strokeWidth="1"
              strokeDasharray="2 4"
              opacity="0.8"
            />
            <circle cx={40} cy={yMaintenant} r="2.5" fill="var(--corail)" />
          </g>
        )}

        {/* Les fils — animation d'entrée au tracé */}
        {tissage.chemins.map((chemin, index) => (
          <motion.path
            key={chemin.membreId}
            d={chemin.d}
            fill="none"
            stroke={couleurMembre(chemin.couleur)}
            strokeWidth="3"
            strokeLinecap="round"
            initial={mouvementReduit ? { opacity: 0 } : { pathLength: 0 }}
            animate={mouvementReduit ? { opacity: 1 } : { pathLength: 1 }}
            transition={
              mouvementReduit
                ? { duration: 0.12 }
                : { duration: 1.1, delay: index * 0.12, ease: 'easeInOut' }
            }
          />
        ))}

        {/* Les perles */}
        {tissage.perles.map((perle) => {
          const versLaDroite = perle.x < LARGEUR * 0.55
          return (
            <g
              key={perle.evenement.id}
              onClick={() => onSelection?.(perle.evenement)}
              style={{ cursor: 'pointer' }}
            >
              {/* zone tactile large autour de la perle */}
              <circle cx={perle.x} cy={perle.y} r="22" fill="transparent" />
              <circle
                cx={perle.x}
                cy={perle.y}
                r={perle.partagee ? 7 : 5.5}
                fill={perle.partagee ? 'var(--fond-eleve)' : couleurMembre(perle.couleur ?? 'or')}
                stroke={perle.partagee ? 'var(--encre-2)' : 'var(--fond-eleve)'}
                strokeWidth="2"
              />
              <text
                x={versLaDroite ? perle.x + 14 : perle.x - 14}
                y={perle.y - 2}
                fontSize="13"
                fontWeight="500"
                fill="var(--encre)"
                textAnchor={versLaDroite ? 'start' : 'end'}
              >
                {perle.evenement.titre}
              </text>
              <text
                x={versLaDroite ? perle.x + 14 : perle.x - 14}
                y={perle.y + 12}
                fontSize="11"
                fill="var(--encre-3)"
                textAnchor={versLaDroite ? 'start' : 'end'}
                className="chiffres"
              >
                {formatHeure(perle.evenement.debut_a)}
                {perle.evenement.lieu ? ` · ${perle.evenement.lieu}` : ''}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
