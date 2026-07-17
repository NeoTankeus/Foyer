// Le Mur — le côté frigo. Éphémère par défaut (30 j), épinglable.
// Le seul module inutile de l'app, et peut-être celui qui la fera aimer.
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { versLocal } from '@/lib/dates'
import { couleurMembre } from '@/lib/couleurs'
import type { LigneMur } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranMur() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [texte, setTexte] = useState('')

  const mur = useQuery({
    queryKey: ['mur'],
    queryFn: async () => {
      const lignes = await lireAvecRepli<LigneMur>('mur', async () => {
        const { data, error } = await supabase
          .from('mur')
          .select('*')
          .order('epingle', { ascending: false })
          .order('cree_le', { ascending: false })
        if (error) throw error
        return data
      })
      const maintenant = new Date().toISOString()
      return lignes
        .filter((l) => l.epingle || l.expire_le > maintenant)
        .sort((a, b) => Number(b.epingle) - Number(a.epingle) || b.cree_le.localeCompare(a.cree_le))
    },
  })

  useEffect(() => {
    const canal = supabase
      .channel('mur-temps-reel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mur' }, () =>
        void clientRequetes.invalidateQueries({ queryKey: ['mur'] }),
      )
      .subscribe()
    return () => void supabase.removeChannel(canal)
  }, [clientRequetes])

  const poster = async () => {
    if (!texte.trim() || !membre || !foyer) return
    const id = crypto.randomUUID()
    await muter({
      table: 'mur',
      type: 'insert',
      cible_id: id,
      charge: {
        id, foyer_id: foyer.id, auteur_id: membre.id, type: 'note',
        contenu: texte.trim(), media_url: null, epingle: false,
        expire_le: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      },
    })
    setTexte('')
    await clientRequetes.invalidateQueries({ queryKey: ['mur'] })
  }

  const basculerEpingle = async (note: LigneMur) => {
    await muter({ table: 'mur', type: 'update', cible_id: note.id, charge: { epingle: !note.epingle } })
    await clientRequetes.invalidateQueries({ queryKey: ['mur'] })
  }

  const retirer = async (note: LigneMur) => {
    await muter({ table: 'mur', type: 'delete', cible_id: note.id, charge: {} })
    await clientRequetes.invalidateQueries({ queryKey: ['mur'] })
  }

  return (
    <div>
      <h2 className="px-1 pb-2 text-titre-3 text-encre">Le Mur</h2>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void poster()
        }}
      >
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Un mot pour la maison…"
          aria-label="Poster sur le Mur"
          className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps"
        />
        <Bouton type="submit" variante="discret">Poster</Bouton>
      </form>

      {(mur.data?.length ?? 0) === 0 && !mur.isLoading && (
        <EtatVide titre="Le Mur est nu" message="Un mot doux, une info, un dessin raconté — tout le monde le verra." />
      )}

      <div className="columns-2 gap-2">
        {(mur.data ?? []).map((note) => {
          const auteur = membres.find((m) => m.id === note.auteur_id)
          const mienne = note.auteur_id === membre?.id
          return (
            <div
              key={note.id}
              className="mb-2 break-inside-avoid rounded-md bg-fond-eleve p-3 shadow-carte"
              style={{ borderTop: `3px solid ${auteur ? couleurMembre(auteur.couleur) : 'var(--trait)'}` }}
            >
              <p className="whitespace-pre-wrap text-corps-2 text-encre">{note.contenu}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-legende text-encre-3">
                  {auteur?.prenom ?? '—'} · {versLocal(note.cree_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
                <span className="flex gap-1">
                  <button
                    onClick={() => void basculerEpingle(note)}
                    aria-label={note.epingle ? 'Désépingler' : 'Épingler'}
                    aria-pressed={note.epingle}
                    className={`min-h-[32px] min-w-[32px] rounded-full text-note ${note.epingle ? 'text-encre' : 'text-encre-3'}`}
                  >
                    ⌖
                  </button>
                  {(mienne || membre?.role === 'adult') && (
                    <button
                      onClick={() => void retirer(note)}
                      aria-label="Retirer"
                      className="min-h-[32px] min-w-[32px] rounded-full text-note text-encre-3"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
