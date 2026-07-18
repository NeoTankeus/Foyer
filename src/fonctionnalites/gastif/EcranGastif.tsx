// Gastif — l'intendant du foyer. Il lit l'état réel de la maison à chaque question.
// Cerveau : Gemini (gratuit) via la fonction serveur /api/gastif — la clé reste côté serveur.
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { utiliserSession } from '@/etat/session'
import { assemblerContexte } from './contexte'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'

interface MessageGastif {
  role: 'utilisateur' | 'gastif'
  texte: string
  a: string
}

interface ConversationGastif {
  id: string
  messages: MessageGastif[]
  cree_le: string
  modifie_le: string
}

/** Le titre d'une discussion : sa première question. */
function titreDe(c: ConversationGastif): string {
  const premiere = c.messages.find((m) => m.role === 'utilisateur')
  return premiere ? premiere.texte.slice(0, 60) : 'Discussion'
}

export function EcranGastif() {
  const { membre, membres, foyer } = utiliserSession()
  const [messages, setMessages] = useState<MessageGastif[]>([])
  const [saisie, setSaisie] = useState('')
  const [reflechit, setReflechit] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [erreurConfig, setErreurConfig] = useState<string | null>(null)
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  const [conversations, setConversations] = useState<ConversationGastif[]>([])
  const [confirmeSuppr, setConfirmeSuppr] = useState<string | null>(null)
  const basListe = useRef<HTMLDivElement>(null)

  // À l'arrivée : on reprend la discussion la plus récente (l'historique reste à portée).
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

  const chargerHistorique = async () => {
    if (!membre) return
    const { data } = await supabase
      .from('gastif_conversations')
      .select('*')
      .eq('membre_id', membre.id)
      .order('modifie_le', { ascending: false })
      .limit(30)
    setConversations((data as unknown as ConversationGastif[]) ?? [])
  }

  const nouvelleDiscussion = () => {
    navigator.vibrate?.(4)
    setConversationId(null)
    setMessages([])
    setErreurConfig(null)
    setHistoriqueOuvert(false)
  }

  const ouvrirDiscussion = (c: ConversationGastif) => {
    setConversationId(c.id)
    setMessages(c.messages ?? [])
    setErreurConfig(null)
    setHistoriqueOuvert(false)
  }

  const supprimerDiscussion = async (id: string) => {
    setConfirmeSuppr(null)
    // .select() vérifie qu'une ligne a VRAIMENT été supprimée (sinon la
    // politique SQL de suppression manque côté Supabase).
    const { data, error } = await supabase.from('gastif_conversations').delete().eq('id', id).select('id')
    if (error || (data?.length ?? 0) === 0) {
      setErreurConfig('Suppression impossible — colle la mise à jour SQL « suppression Gastif » dans Supabase (je te l’ai donnée).')
      return
    }
    setConversations((liste) => liste.filter((c) => c.id !== id))
    if (conversationId === id) {
      setConversationId(null)
      setMessages([])
    }
  }

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
    'Où en est la valise du prochain voyage ?',
    'Quels papiers expirent bientôt ?',
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
        <div className="min-w-0 flex-1">
          <h1 className="text-titre-3 text-encre">Gastif</h1>
          <p className="truncate text-legende text-encre-3">
            {reflechit ? 'réfléchit…' : 'l’intendant du foyer'}
          </p>
        </div>
        <button
          onClick={() => {
            navigator.vibrate?.(4)
            setHistoriqueOuvert(true)
            void chargerHistorique()
          }}
          aria-label="Historique des discussions"
          className="flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center rounded-full bg-fond-sourd text-[17px]"
        >
          🕘
        </button>
        <button
          onClick={nouvelleDiscussion}
          aria-label="Nouvelle discussion"
          className="flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center rounded-full bg-fond-sourd text-titre-3 font-[590] text-encre"
        >
          +
        </button>
      </header>

      <div className="flex-1 px-5 pb-36 pt-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 py-6">
            <p className="text-corps-2 text-encre-3">
              Gastif connaît tout le foyer : agenda, tâches, courses, menus, voyages, valises,
              souvenirs, papiers, colis, routines, points de Gabriel. Demande-lui :
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

      <Feuille ouverte={historiqueOuvert} onFermer={() => setHistoriqueOuvert(false)} titre="Discussions">
        <div className="flex flex-col gap-2">
          <Bouton pleineLargeur variante="valider" onClick={nouvelleDiscussion}>
            ＋ Nouvelle discussion
          </Bouton>
          {conversations.length === 0 && (
            <p className="py-4 text-center text-corps-2 text-encre-3">Aucune discussion enregistrée.</p>
          )}
          <ul className="flex flex-col gap-1">
            {conversations.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-md bg-fond-sourd px-2">
                <button
                  onClick={() => ouvrirDiscussion(c)}
                  className="min-w-0 flex-1 py-2 text-left"
                >
                  <p className={`truncate text-corps-2 ${c.id === conversationId ? 'font-[700]' : ''} text-encre`}>
                    {titreDe(c)}
                  </p>
                  <p className="text-legende text-encre-3">
                    {new Date(c.modifie_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ·{' '}
                    {Math.ceil(c.messages.length / 2)} échange{c.messages.length > 2 ? 's' : ''}
                    {c.id === conversationId ? ' · en cours' : ''}
                  </p>
                </button>
                <button
                  onClick={() => {
                    if (confirmeSuppr === c.id) void supprimerDiscussion(c.id)
                    else {
                      navigator.vibrate?.(4)
                      setConfirmeSuppr(c.id)
                    }
                  }}
                  aria-label={`Supprimer la discussion « ${titreDe(c)} »`}
                  className={`flex min-h-sur-tactile shrink-0 items-center justify-center rounded-md px-2 text-note
                    ${confirmeSuppr === c.id ? 'bg-urgent font-[700] text-white' : 'text-encre-3'}`}
                >
                  {confirmeSuppr === c.id ? 'Sûr ?' : '🗑'}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-legende text-encre-3">
            L’historique s’efface tout seul après 6 mois — chaque nuit, Gastif fait le ménage.
          </p>
        </div>
      </Feuille>

      <form
        className="au-dessus-onglets fixed inset-x-0 z-20 flex items-center gap-2 px-4 pb-1"
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
          className="verre verre-clair min-h-[52px] flex-1 rounded-full border border-trait px-5
            text-corps text-encre shadow-carte placeholder:text-encre-3"
        />
        {/* Le bouton d'envoi — rond, dégradé, à la place du + */}
        <motion.button
          type="submit"
          disabled={reflechit || !saisie.trim()}
          aria-label="Envoyer à Gastif"
          whileTap={{ scale: 0.88 }}
          animate={{ scale: saisie.trim() ? 1 : 0.92, opacity: saisie.trim() ? 1 : 0.55 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="degrade-chaud flex h-14 w-14 shrink-0 items-center justify-center rounded-full
            text-white shadow-carte disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path
              d="M11 17V5M5.5 10.5 11 5l5.5 5.5"
              fill="none" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </motion.button>
      </form>
    </div>
  )
}
