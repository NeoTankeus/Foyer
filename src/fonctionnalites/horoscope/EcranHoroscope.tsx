// 🔮 L'Horoscope du foyer : chaque matin, une prédiction écrite à partir de
// vos VRAIES données (« Vénus est dans le placard : la DLC des yaourts vous
// menace »). Généré une fois par jour, gardé en mémoire.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { demanderAStiga } from '@/lib/stiga'
import { previsions, iconeMeteo } from '@/lib/meteo'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

const CLE = 'stg-horoscope'

export function EcranHoroscope() {
  const { membres } = utiliserSession()
  const jour = new Date().toISOString().slice(0, 10)
  const [horoscope, setHoroscope] = useState<string | null>(() => {
    try {
      const memo = JSON.parse(localStorage.getItem(CLE) ?? 'null') as { jour: string; texte: string } | null
      return memo?.jour === jour ? memo.texte : null
    } catch {
      return null
    }
  })
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const matiere = useQuery({
    queryKey: ['horoscope-matiere', jour],
    staleTime: 3600 * 1000,
    queryFn: async () => {
      const [taches, inventaire, evenements, courses] = await Promise.all([
        supabase.from('taches').select('titre,echeance').eq('statut', 'a_faire').limit(10),
        supabase.from('inventaire').select('libelle,dlc').not('dlc', 'is', null).order('dlc').limit(5),
        supabase.from('evenements').select('titre,debut_a').gte('debut_a', new Date().toISOString()).order('debut_a').limit(5),
        supabase.from('articles').select('libelle').eq('coche', false).limit(10),
      ])
      return {
        taches: (taches.data ?? []).map((t) => t.titre).join(' · '),
        dlc: (inventaire.data ?? []).map((i) => `${i.libelle} (${i.dlc})`).join(' · '),
        evenements: (evenements.data ?? []).map((e) => `${e.titre} le ${e.debut_a.slice(0, 10)}`).join(' · '),
        courses: (courses.data ?? []).map((a) => a.libelle).join(' · '),
      }
    },
  })

  const consulter = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      const m = matiere.data
      const meteo = await previsions().catch(() => [])
      const texte = await demanderAStiga(
        `Écris L'HOROSCOPE DU FOYER du jour, dans le style mystique-parodique des vrais horoscopes, ` +
          `mais construit UNIQUEMENT sur nos vraies données du moment : ` +
          `tâches en cours : ${m?.taches || 'aucune'} ; DLC qui approchent : ${m?.dlc || 'aucune'} ; ` +
          `prochains événements : ${m?.evenements || 'aucun'} ; sur la liste de courses : ${m?.courses || 'rien'} ; ` +
          `météo : ${meteo[0] ? `${iconeMeteo(meteo[0].code)} ${meteo[0].tMin}-${meteo[0].tMax}°` : 'inconnue'}. ` +
          `Une section par personne (Stéphane ♈, Tiphaine ♎, Gabriel ♋ — les signes sont décoratifs) + « Astre du jour » ` +
          `(un objet du quotidien divinisé). Ton : « Vénus est dans le placard : la DLC des yaourts vous menace ». ` +
          `8-12 lignes, drôle, jamais méchant.`,
      )
      setHoroscope(texte)
      localStorage.setItem(CLE, JSON.stringify({ jour, texte }))
    } catch {
      setErreur('Les astres sont embouteillés — réessaie dans un instant.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🔮 L'Horoscope du foyer</h1>
        <p className="text-legende text-encre-3">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — les astres ont lu vos données.
        </p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {!horoscope && (
          <Bouton pleineLargeur variante="primaire" desactive={enCours || matiere.isLoading} onClick={() => void consulter()}>
            {enCours ? '🔮 Les astres consultent vos placards…' : '🔮 Consulter les astres du jour'}
          </Bouton>
        )}
        {erreur && <p className="text-corps-2 text-urgent">{erreur}</p>}
        {horoscope && (
          <>
            <Carte>
              <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{horoscope}</p>
            </Carte>
            <p className="text-legende text-encre-3">
              ✨ Un seul horoscope par jour — les astres reviennent demain matin. ({membres.length} destins scrutés.)
            </p>
          </>
        )}
      </div>
    </div>
  )
}
