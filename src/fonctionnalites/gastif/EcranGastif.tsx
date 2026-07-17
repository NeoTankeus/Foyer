// Gastif — l'intendant du foyer. Il lit l'état réel de la maison à chaque question.
// Cerveau : Gemini (gratuit) via la fonction serveur /api/gastif — la clé reste côté serveur.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { utiliserSession } from '@/etat/session'
import { assemblerContexte } from './contexte'
import { Bouton } from '@/design/composants/Bouton'

interface MessageGastif {
  role: 'utilisateur' | 'gastif'
  texte: string
  a: string
}

export function EcranGastif() {
  const { membre, membres, foyer } = utiliserSession()
  const [messages, setMessages] = useState<MessageGastif[]>([])
  const [saisie, setSaisie] = useState('')
  const [reflechit, setReflechit] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [erreurConfig, setErreurConfig] = useState<string | null>(null)
  const basListe = useRef<HTMLDivElement>(null)

  // Recharge la conversation du membre (une conversation continue par personne).
  useEffect(() => {
    if (!membre) return
    void supabase
      .from('gastif_conversations')
      .select('*')
      .eq('membre_id', membre.id)
      .order('modifie_le', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const existante = data?.[0]
        if (existante) {
          setConversationId(existante.id)
          setMessages((existante.messages as unknown as MessageGastif[]) ?? [])
        }
      })
  }, [membre])

  useEffect(() => {
    basListe.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, reflechit])

  // Une question posée depuis la recherche globale arrive pré-remplie ici.
  useEffect(() => {
    const question = sessionStorage.getItem('question-gastif')
    if (question) {
      sessionStorage.removeItem('question-gastif')
      setSaisie(question)
    }
  }, [])

  const envoyer = async () => {
    const question = saisie.trim()
    if (!question || !membre || !foyer || reflechit) return
    setSaisie('')
    setErreurConfig(null)
    const aJour: MessageGastif[] = [
      ...messages,
      { role: 'utilisateur', texte: question, a: new Date().toISOString() },
    ]
    setMessages(aJour)
    setReflechit(true)

    try {
      const [{ data: session }, contexte] = await Promise.all([
        supabase.auth.getSession(),
        assemblerContexte(membres, foyer),
      ])
      const reponse = await fetch('/api/gastif', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          messages: aJour.map((m) => ({ role: m.role, texte: m.texte })),
          contexte,
          role_membre: membre.role,
        }),
      })
      const donnees = (await reponse.json()) as { reponse?: string; erreur?: string; message?: string }

      if (!reponse.ok) {
        if (donnees.erreur === 'cle_absente') {
          setErreurConfig(
            'Le cerveau de Gastif n’est pas encore branché : ajoute la variable GEMINI_API_KEY dans Vercel (clé gratuite sur aistudio.google.com), puis redéploie.',
          )
        } else {
          setErreurConfig(donnees.message ?? 'Gastif n’a pas pu répondre. Réessaie.')
        }
        setMessages(messages)
        return
      }

      const final: MessageGastif[] = [
        ...aJour,
        { role: 'gastif', texte: donnees.reponse ?? '…', a: new Date().toISOString() },
      ]
      setMessages(final)

      // Persistance de la conversation (chacun la sienne, RLS).
      if (conversationId) {
        await muter({
          table: 'gastif_conversations', type: 'update', cible_id: conversationId,
          charge: { messages: final },
        })
      } else {
        const id = crypto.randomUUID()
        setConversationId(id)
        await muter({
          table: 'gastif_conversations', type: 'insert', cible_id: id,
          charge: { id, foyer_id: foyer.id, membre_id: membre.id, messages: final },
        })
      }
    } catch {
      setErreurConfig('Pas de réseau — Gastif a besoin d’internet pour réfléchir.')
      setMessages(messages)
    } finally {
      setReflechit(false)
    }
  }

  const SUGGESTIONS = [
    'Qu’est-ce qu’on mange ce soir ?',
    'Résume-moi la semaine',
    'Je suis débordé cette semaine',
    'Une idée de sortie avec Gabriel ce week-end ?',
  ]

  return (
    <div className="flex min-h-dvh flex-col pb-24">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 flex items-center gap-3 px-5 pb-2 pt-3">
        {/* Le logo de Gastif : ILY — il respire pendant qu'il réfléchit */}
        <span
          className={`badge-ily h-11 w-14 text-[17px] ${reflechit ? 'gastif-respire' : ''}`}
          aria-hidden="true"
        >
          ILY
        </span>
        <div>
          <h1 className="text-titre-3 text-encre">Gastif</h1>
          <p className="text-legende text-encre-3">
            {reflechit ? 'réfléchit…' : 'l’intendant du foyer'}
          </p>
        </div>
      </header>

      <div className="flex-1 px-5 pb-36 pt-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 py-6">
            <p className="text-corps-2 text-encre-3">
              Gastif connaît l’agenda, les tâches, les courses et les menus du foyer. Demande-lui :
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSaisie(s)}
                className="min-h-sur-tactile rounded-md bg-fond-eleve px-4 py-2 text-left text-corps-2 text-encre shadow-carte"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-corps leading-snug
                ${m.role === 'utilisateur' ? 'self-end bg-encre text-fond' : 'self-start bg-fond-eleve text-encre shadow-carte'}`}
            >
              {m.texte}
            </div>
          ))}
          {reflechit && (
            <div className="self-start rounded-lg bg-fond-eleve px-4 py-2.5 shadow-carte">
              <span className="badge-ily gastif-respire h-6 w-9 text-[11px]">ILY</span>
            </div>
          )}
          {erreurConfig && (
            <p role="alert" className="rounded-md bg-fond-sourd px-4 py-3 text-note text-encre-2">
              {erreurConfig}
            </p>
          )}
          <div ref={basListe} />
        </div>
      </div>

      <form
        className="verre verre-clair au-dessus-onglets fixed inset-x-0 z-20 flex gap-2 border-t border-trait px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          void envoyer()
        }}
      >
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Demande à Gastif…"
          aria-label="Message à Gastif"
          className="min-h-sur-tactile flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps"
        />
        <Bouton type="submit" desactive={reflechit || !saisie.trim()}>
          →
        </Bouton>
      </form>
    </div>
  )
}
