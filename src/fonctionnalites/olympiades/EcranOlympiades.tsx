// 🏅 Les Olympiades du dimanche : STG invente des mini-épreuves maison,
// vous tenez les scores sur l'année, et les titres absurdes pleuvent.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { demanderAStiga } from '@/lib/stiga'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

interface Scores { points: Record<string, number>; titres: string[] }

export function EcranOlympiades() {
  const { membres, foyer } = utiliserSession()
  const participants = membres.filter((m) => m.role !== 'guest')
  const [scores, setScores] = useState<Scores>(() => {
    const brut = foyer?.reglages['olympiades']
    return brut && typeof brut === 'object'
      ? { points: {}, titres: [], ...(brut as Partial<Scores>) }
      : { points: {}, titres: [] }
  })
  const [epreuve, setEpreuve] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const enregistrer = async (suivants: Scores) => {
    if (!foyer) return
    setScores(suivants)
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    await supabase.from('foyers').update({ reglages: { ...base, olympiades: suivants } }).eq('id', foyer.id)
  }

  const tirerEpreuve = async () => {
    setEnCours(true)
    try {
      setEpreuve(
        await demanderAStiga(
          `Invente UNE mini-épreuve d'Olympiades familiales à faire MAINTENANT à la maison, pour 2 adultes et un enfant de 7 ans, ` +
            `sans matériel spécial, en 5-10 minutes, sans écran, drôle et un peu absurde ` +
            `(genre : lancer de chaussettes en boule dans le panier à linge à 3 mètres, marche du crabe chronométrée dans le couloir, ` +
            `concours d'imitation d'animaux jugé à l'applaudimètre…). ` +
            `Donne : 🏅 LE NOM (pompeux), 📏 LA RÈGLE (3 lignes max), ⚖️ COMMENT ON COMPTE LES POINTS (1er = 3 pts, 2e = 2 pts, 3e = 1 pt). ` +
            `Varie à chaque fois, sois créatif.`,
        ),
      )
    } catch {
      setEpreuve('🏅 LE LANCER DE CHAUSSETTES — 3 paires en boule, le panier à linge à 3 mètres. Chacun 3 lancers, un point par panier. Le juge est incorruptible.')
    } finally {
      setEnCours(false)
    }
  }

  const classement = [...participants].sort(
    (a, b) => (scores.points[b.id] ?? 0) - (scores.points[a.id] ?? 0),
  )
  const medailles = ['🥇', '🥈', '🥉']

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🏅 Les Olympiades</h1>
        <p className="text-legende text-encre-3">La gloire éternelle se joue dans le salon.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Bouton pleineLargeur variante="primaire" desactive={enCours} onClick={() => void tirerEpreuve()}>
          {enCours ? 'Le comité olympique délibère…' : '🎲 Tire une épreuve !'}
        </Bouton>

        {epreuve && (
          <Carte>
            <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{epreuve}</p>
          </Carte>
        )}

        <Carte>
          <p className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">🏆 Le classement de l'année</p>
          {classement.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 border-b border-trait py-2 last:border-0">
              <span className="w-7 text-[20px]" aria-hidden="true">{medailles[i] ?? `${i + 1}.`}</span>
              <PastilleMembre membre={m} taille={30} />
              <p className="flex-1 text-corps-2 font-[590] text-encre">{m.prenom}</p>
              <p className="chiffres text-corps font-[700] text-encre">{scores.points[m.id] ?? 0} pts</p>
              <div className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      navigator.vibrate?.(4)
                      void enregistrer({
                        ...scores,
                        points: { ...scores.points, [m.id]: (scores.points[m.id] ?? 0) + n },
                      })
                    }}
                    aria-label={`Donner ${n} point${n > 1 ? 's' : ''} à ${m.prenom}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-fond-sourd text-note font-[700] text-encre-2"
                  >
                    +{n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-2">
            <Bouton
              variante="discret"
              onClick={() => {
                if (confirm('Remettre tous les scores à zéro ? (nouvelle saison olympique)'))
                  void enregistrer({ ...scores, points: {} })
              }}
            >
              Nouvelle saison (remise à zéro)
            </Bouton>
          </div>
        </Carte>

        <p className="text-legende text-encre-3">
          Après chaque épreuve : +3 au vainqueur, +2 au deuxième, +1 au troisième. Les scores sont partagés entre
          vos téléphones. Le titre suprême se remet au réveillon. 🏆
        </p>
      </div>
    </div>
  )
}
