// Le mode Rendez-vous : une soirée à deux, organisée de bout en bout —
// vérif d'agenda, idées de Gastif, événement posé, baby-sitter prévenue.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { creerEvenement, creerTache, utiliserEvenementsPeriode } from '@/lib/requetes'
import { assemblerContexte } from '@/fonctionnalites/gastif/contexte'
import { dateIsoJour, formatHeure, maintenantLocal, versUtc } from '@/lib/dates'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranRendezVous() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [date, setDate] = useState(dateIsoJour(maintenantLocal()))
  const [heure, setHeure] = useState('20:00')
  const [envie, setEnvie] = useState('')
  const [ville, setVille] = useState('')
  const [reflechit, setReflechit] = useState(false)
  const [idees, setIdees] = useState<string | null>(null)
  const [pose, setPose] = useState(false)

  // Les événements du soir choisi — pour voir les conflits d'un coup d'œil.
  const debutSoir = versUtc(new Date(`${date}T17:00:00`))
  const finSoir = versUtc(new Date(`${date}T23:59:00`))
  const soiree = utiliserEvenementsPeriode(debutSoir, finSoir)
  const conflits = (soiree.data ?? []).filter((e) => !e.journee_entiere)

  const demanderIdees = async () => {
    if (!membre || !foyer) return
    setReflechit(true)
    setIdees(null)
    try {
      const [{ data: session }, contexte] = await Promise.all([
        supabase.auth.getSession(),
        assemblerContexte(membres, foyer),
      ])
      const question =
        `Soirée en amoureux le ${new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} vers ${heure}` +
        (ville ? ` à ${ville} ou autour` : '') +
        (envie ? `. Envie : ${envie}` : '') +
        `. Propose exactement 3 idées de sorties/restaurants numérotées, une ligne chacune, concrètes et différentes (avec le style d'endroit à chercher). Termine par un conseil de réservation en une phrase.`
      const reponse = await fetch('/api/gastif', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'utilisateur', texte: question }],
          contexte,
          role_membre: membre.role,
        }),
      })
      const donnees = (await reponse.json()) as { reponse?: string; message?: string }
      setIdees(donnees.reponse ?? donnees.message ?? 'Gastif n’a pas répondu — réessaie.')
    } catch {
      setIdees('Pas de réseau — réessaie.')
    } finally {
      setReflechit(false)
    }
  }

  const poserLaSoiree = async () => {
    if (!membre || !foyer) return
    const debut = new Date(`${date}T${heure}:00`)
    const adultes = membres.filter((m) => m.role === 'adult').map((m) => m.id)
    await creerEvenement(foyer.id, membre.id, {
      titre: '💞 Soirée à deux',
      debut_a: versUtc(debut),
      fin_a: versUtc(new Date(debut.getTime() + 3 * 3600 * 1000)),
      lieu: ville.trim() || null,
      participants: adultes,
      journee_entiere: false,
    })
    await creerTache(foyer.id, membre.id, {
      titre: 'Réserver la baby-sitter + le resto 💞',
      assignee_id: membre.id,
      echeance: dateIsoJour(maintenantLocal()),
      rrule: null,
      effort_minutes: 10,
      groupe_rotation: null,
    })
    await clientRequetes.invalidateQueries({ queryKey: ['evenements'] })
    await clientRequetes.invalidateQueries({ queryKey: ['taches'] })
    setPose(true)
  }

  const messageBabySitter = encodeURIComponent(
    `Bonjour ! Seriez-vous disponible le ${new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à partir de ${heure} pour garder Gabriel ? Merci ! — Tiphaine & Stéphane`,
  )

  return (
    <div className="px-5 pb-6 pt-3">
      <BarreRetour vers="/nous" />
      <h2 className="pb-1 text-titre-3 text-encre">💞 Mode Rendez-vous</h2>
      <p className="pb-3 text-note text-encre-3">
        Une soirée à deux, organisée de bout en bout : agenda vérifié, idées, baby-sitter.
      </p>

      <Carte>
        <div className="flex gap-3">
          <ChampTexte etiquette="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <ChampTexte etiquette="Heure" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <ChampTexte etiquette="Envie (facultatif)" value={envie} onChange={(e) => setEnvie(e.target.value)} placeholder="italien, ciné, concert, surprise…" />
          <ChampTexte etiquette="Ville (facultatif)" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="autour de chez nous…" />
        </div>
        {conflits.length > 0 ? (
          <p className="mt-2 text-corps-2 font-[590] text-ambre">
            ⚠️ Ce soir-là : {conflits.map((c) => `${c.titre} (${formatHeure(c.debut_a)})`).join(' · ')}
          </p>
        ) : (
          <p className="mt-2 text-corps-2 text-fait">✓ Soirée libre à l’agenda.</p>
        )}
        <div className="mt-3">
          <Bouton pleineLargeur variante="primaire" desactive={reflechit} onClick={() => void demanderIdees()}>
            {reflechit ? 'Gastif réfléchit…' : '✨ Demander 3 idées à Gastif'}
          </Bouton>
        </div>
      </Carte>

      {idees && (
        <Carte>
          <h3 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">Les idées de Gastif</h3>
          <p className="whitespace-pre-wrap text-corps-2 leading-snug text-encre">{idees}</p>
        </Carte>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <Bouton pleineLargeur variante="valider" desactive={pose} onClick={() => void poserLaSoiree()}>
          {pose ? '✓ Soirée posée à l’agenda (+ tâche réservation)' : '📅 Poser la soirée à l’agenda'}
        </Bouton>
        <a
          href={`sms:?&body=${messageBabySitter}`}
          className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-center text-corps-2 leading-tight"
        >
          💬 Prévenir la baby-sitter (SMS prêt)
        </a>
      </div>
    </div>
  )
}
