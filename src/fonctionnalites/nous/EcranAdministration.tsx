// Administration — réservée aux admins (rôle adult, appliqué par la RLS côté base).
// Les autres rôles consultent, créent, cochent — mais ne modifient rien : c'est la
// base qui refuse, pas l'interface.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { LigneIntegration } from '@/lib/basedonnees.types'
import { utiliserSession } from '@/etat/session'
import type { CouleurMembre, LigneMembre, RoleMembre } from '@/lib/basedonnees.types'
import { couleurMembre } from '@/lib/couleurs'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { BarreRetour } from '@/design/composants/BarreRetour'

const COULEURS: CouleurMembre[] = ['ambre', 'sauge', 'ardoise', 'prune', 'corail', 'or']
const ROLES: { valeur: RoleMembre; libelle: string }[] = [
  { valeur: 'adult', libelle: 'Admin (adulte)' },
  { valeur: 'child', libelle: 'Enfant' },
  { valeur: 'guest', libelle: 'Invité' },
]

interface LigneJournal {
  id: number
  acteur_id: string | null
  action: string
  cible: string
  cree_le: string
}

export function EcranAdministration() {
  const { membre, membres, foyer } = utiliserSession()
  const [nomFoyer, setNomFoyer] = useState(foyer?.nom ?? '')
  const [memoire, setMemoire] = useState(
    typeof foyer?.reglages['memoire'] === 'string' ? (foyer.reglages['memoire'] as string) : '',
  )
  const [enEdition, setEnEdition] = useState<LigneMembre | null>(null)
  const [creation, setCreation] = useState(false)
  const [journal, setJournal] = useState<LigneJournal[]>([])
  const [calendriers, setCalendriers] = useState<LigneIntegration[]>([])
  const [urlIcs, setUrlIcs] = useState('')
  const [membresIcs, setMembresIcs] = useState<string[]>([])
  const [appleId, setAppleId] = useState('')
  const [mdpApp, setMdpApp] = useState('')
  const [nomCalendrier, setNomCalendrier] = useState('Family')
  const [importEnCours, setImportEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('integrations')
      .select('*')
      .eq('fournisseur', 'icloud_caldav')
      .then(({ data }) => setCalendriers(data ?? []))
    void supabase
      .from('journal_audit' as never)
      .select('id, acteur_id, action, cible, cree_le')
      .order('cree_le', { ascending: false })
      .limit(30)
      .then(({ data }) => setJournal((data as unknown as LigneJournal[]) ?? []))
  }, [])

  if (membre?.role !== 'adult') {
    return (
      <div className="px-5 pt-8 text-center">
        <p className="text-corps text-encre-2">Cette page est réservée aux admins du foyer.</p>
      </div>
    )
  }

  const confirmer = (texte: string) => {
    setMessage(texte)
    setTimeout(() => setMessage(null), 7000)
  }

  const enregistrerFoyer = async () => {
    if (!foyer || !nomFoyer.trim()) return
    await supabase.from('foyers').update({ nom: nomFoyer.trim() }).eq('id', foyer.id)
    confirmer('Nom du foyer enregistré.')
  }

  return (
    <div className="flex flex-col gap-4 px-5 pt-3 pb-8">
      <BarreRetour vers="/nous" />
      <h2 className="text-titre-3 text-encre">🛠️ Administration</h2>
      {message && (
        <p
          role="status"
          className="au-dessus-onglets fixed inset-x-4 z-50 rounded-lg bg-encre px-4 py-3 text-center
            text-note font-[590] text-fond shadow-feuille"
        >
          {message}
        </p>
      )}

      <Carte>
        <h3 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">Le foyer</h3>
        <div className="flex gap-2">
          <input
            value={nomFoyer}
            onChange={(e) => setNomFoyer(e.target.value)}
            aria-label="Nom du foyer"
            className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps"
          />
          <Bouton variante="valider" onClick={() => void enregistrerFoyer()}>OK</Bouton>
        </div>
      </Carte>

      <Carte>
        <h3 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">
          Mémoire de StiGa
        </h3>
        <p className="mb-2 text-note text-encre-3">
          Ce que StiGa doit savoir pour toujours — il le relit à chaque question.
          Ex. : « Gabriel ne mange pas de poisson. Les courses se font le samedi matin.
          Le mercredi est chargé. »
        </p>
        <textarea
          value={memoire}
          onChange={(e) => setMemoire(e.target.value)}
          rows={4}
          aria-label="Mémoire de StiGa"
          className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2"
        />
        <div className="mt-2">
          <Bouton
            variante="valider"
            onClick={() => {
              if (!foyer) return
              void supabase
                .from('foyers')
                .update({ reglages: { ...foyer.reglages, memoire } })
                .eq('id', foyer.id)
                .then(() => confirmer('Mémoire de StiGa enregistrée.'))
            }}
          >
            Enregistrer la mémoire
          </Bouton>
        </div>
      </Carte>

      <Carte>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-note font-[590] uppercase tracking-wide text-encre-3">Membres</h3>
          <Bouton variante="discret" onClick={() => setCreation(true)} etiquette="Ajouter un membre">+</Bouton>
        </div>
        <ul>
          {membres.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-trait py-2 last:border-0">
              <PastilleMembre membre={m} taille={34} />
              <div className="flex-1">
                <p className="text-corps text-encre">{m.prenom}</p>
                <p className="text-legende text-encre-3">
                  {ROLES.find((r) => r.valeur === m.role)?.libelle}
                  {m.email_invitation ? ` · ${m.email_invitation}` : ''}
                  {m.role === 'guest' && m.actif_jusqu_au
                    ? ` · expire le ${new Date(m.actif_jusqu_au).toLocaleDateString('fr-FR')}`
                    : ''}
                </p>
              </div>
              <Bouton variante="discret" onClick={() => setEnEdition(m)}>Modifier</Bouton>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-legende text-encre-3">
          Admins : accès complet. Enfant et invités : lecture, création et coches uniquement —
          la base refuse le reste, quelle que soit l’interface.
        </p>
      </Carte>

      <Carte>
        <h3 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">
          📅 Calendriers Apple (auto : chaque matin + à l’ouverture de l’app)
        </h3>
        <p className="mb-2 text-note text-encre-3">
          🔑 <strong>Connexion directe iCloud</strong> — la voie simple, qui marche AUSSI avec le
          calendrier « Famille » : sur <strong>appleid.apple.com</strong> → Connexion et sécurité →
          <strong> Mots de passe d’app</strong> → crée-en un (nomme-le StiGa) et colle-le ici.
          Lecture seule, révocable quand tu veux.
        </p>
        <div className="mb-3 flex flex-col gap-2">
          <input
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
            placeholder="Identifiant Apple (adresse e-mail)"
            aria-label="Identifiant Apple"
            inputMode="email"
            autoCapitalize="none"
            className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-note"
          />
          <input
            value={mdpApp}
            onChange={(e) => setMdpApp(e.target.value)}
            placeholder="Mot de passe d’app (xxxx-xxxx-xxxx-xxxx)"
            aria-label="Mot de passe d’application Apple"
            autoCapitalize="none"
            className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-note"
          />
          <input
            value={nomCalendrier}
            onChange={(e) => setNomCalendrier(e.target.value)}
            placeholder="Nom du calendrier (vide = tous)"
            aria-label="Nom du calendrier à importer"
            className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-note"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-note text-encre-3">Pour :</span>
            {membres.filter((m) => m.role !== 'guest').map((m) => (
              <PastilleMembre
                key={`caldav-${m.id}`}
                membre={m}
                taille={30}
                estompee={membresIcs.length > 0 && !membresIcs.includes(m.id)}
                onClick={() =>
                  setMembresIcs((actuels) =>
                    actuels.includes(m.id) ? actuels.filter((id) => id !== m.id) : [...actuels, m.id],
                  )
                }
              />
            ))}
            <Bouton
              variante="valider"
              desactive={!appleId.trim() || !mdpApp.trim()}
              onClick={() => {
                if (!foyer) return
                void supabase.from('integrations').insert({
                  id: crypto.randomUUID(), foyer_id: foyer.id, membre_id: membresIcs[0] ?? null,
                  fournisseur: 'icloud_caldav', vault_ref: null,
                  reglages: {
                    apple_id: appleId.normalize('NFKD').replace(/[^\x21-\x7E]/g, '').toLowerCase(),
                    mdp_app: mdpApp.normalize('NFKD').replace(/[^\x21-\x7E]/g, ''),
                    nom_calendrier: nomCalendrier.trim(), membre_ids: membresIcs,
                  },
                  statut: 'active', derniere_sync: null,
                } as never).then(({ error }) => {
                  if (error) {
                    confirmer(`⚠️ Connexion refusée : ${error.message}`)
                    return
                  }
                  setAppleId('')
                  setMdpApp('')
                  setMembresIcs([])
                  confirmer('✓ Connexion iCloud ajoutée — touche « Importer maintenant » pour tester.')
                  void supabase.from('integrations').select('*').eq('fournisseur', 'icloud_caldav')
                    .then(({ data }) => setCalendriers(data ?? []))
                })
              }}
            >
              Connecter
            </Bouton>
          </div>
        </div>
        <p className="mb-2 border-t border-trait pt-2 text-note text-encre-3">
          Ou par lien public : Calendrier → ⓘ → « Calendrier public » → colle le lien webcal://…
          (ne marche pas pour « Famille »).
        </p>
        {calendriers.map((c) => (
          <div key={c.id} className="flex items-center gap-2 border-b border-trait py-1.5 last:border-0">
            <span className="flex-1 truncate text-note text-encre-2">
              {(() => {
                const ids = c.reglages.membre_ids ?? (c.membre_id ? [c.membre_id] : [])
                const prenoms = ids
                  .map((id) => membres.find((m) => m.id === id)?.prenom)
                  .filter(Boolean)
                const qui = prenoms.length > 0 ? prenoms.join(' + ') : 'Tout le foyer'
                const source = c.reglages.apple_id
                  ? `🔑 iCloud direct (${c.reglages.nom_calendrier || 'tous les calendriers'})`
                  : `${c.reglages.ics_url?.slice(0, 36)}…`
                return `${qui} · ${source}`
              })()}
            </span>
            <span className="text-legende text-encre-3">
              {c.derniere_sync ? `sync ${new Date(c.derniere_sync).toLocaleDateString('fr-FR')}` : 'jamais'}
            </span>
            <button
              aria-label="Retirer ce calendrier"
              className="min-h-[32px] min-w-[32px] text-note text-encre-3"
              onClick={() =>
                void supabase.from('integrations').delete().eq('id', c.id).then(() =>
                  setCalendriers(calendriers.filter((x) => x.id !== c.id)),
                )
              }
            >
              ✕
            </button>
          </div>
        ))}
        <div className="mt-2 flex flex-col gap-2">
          <input
            value={urlIcs}
            onChange={(e) => setUrlIcs(e.target.value)}
            placeholder="webcal://p123-caldav.icloud.com/published/…"
            aria-label="Lien du calendrier public"
            inputMode="url"
            className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-note"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-note text-encre-3">Pour :</span>
            {membres.filter((m) => m.role !== 'guest').map((m) => (
              <PastilleMembre
                key={m.id}
                membre={m}
                taille={30}
                estompee={membresIcs.length > 0 && !membresIcs.includes(m.id)}
                onClick={() =>
                  setMembresIcs((actuels) =>
                    actuels.includes(m.id) ? actuels.filter((id) => id !== m.id) : [...actuels, m.id],
                  )
                }
              />
            ))}
            <Bouton
              variante="valider"
              onClick={() => {
                if (!foyer || !urlIcs.trim()) return
                void supabase.from('integrations').insert({
                  id: crypto.randomUUID(), foyer_id: foyer.id, membre_id: membresIcs[0] ?? null,
                  fournisseur: 'icloud_caldav', vault_ref: null,
                  reglages: { ics_url: urlIcs.trim(), membre_ids: membresIcs },
                  statut: 'active', derniere_sync: null,
                } as never).then(({ error }) => {
                  if (error) {
                    confirmer(`⚠️ Ajout refusé : ${error.message}`)
                    return
                  }
                  setUrlIcs('')
                  setMembresIcs([])
                  confirmer('✓ Calendrier ajouté — import chaque matin.')
                  void supabase.from('integrations').select('*').eq('fournisseur', 'icloud_caldav')
                    .then(({ data }) => setCalendriers(data ?? []))
                })
              }}
            >
              Ajouter
            </Bouton>
          </div>
          <p className="text-legende text-encre-3">
            Un calendrier commun (Family) ? Touche PLUSIEURS prénoms — chaque événement portera
            leurs pastilles partout. Aucun prénom = tout le foyer.
          </p>
          {calendriers.length > 0 && (
            <Bouton
              variante="discret"
              desactive={importEnCours}
              onClick={() => {
                setImportEnCours(true)
                void supabase.auth.getSession().then(({ data }) =>
                  fetch('/api/importer-ics', {
                    method: 'POST',
                    headers: { authorization: `Bearer ${data.session?.access_token ?? ''}` },
                  })
                    .then(async (r) => {
                      const texte = await r.text()
                      try {
                        return JSON.parse(texte) as { importes?: number; erreurs?: string[]; version?: number }
                      } catch {
                        throw new Error(`serveur ${r.status}`)
                      }
                    })
                    .then((r) =>
                      confirmer(
                        `${r.importes ?? 0} événement(s) importé(s).${
                          r.erreurs && r.erreurs.length > 0 ? ` ⚠️ ${r.erreurs[0]}` : ''
                        } · serveur v${r.version ?? '1'}`,
                      ),
                    )
                    .catch((e) =>
                      confirmer(`⚠️ Import impossible (${e instanceof Error ? e.message : 'réseau'}) — réessaie.`),
                    )
                    .finally(() => setImportEnCours(false)),
                )
              }}
            >
              {importEnCours ? 'Import…' : 'Importer maintenant'}
            </Bouton>
          )}
        </div>
      </Carte>

      <Carte>
        <h3 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">
          Journal d’audit — qui a touché aux données sensibles
        </h3>
        {journal.length === 0 ? (
          <p className="text-corps-2 text-encre-3">Rien à signaler.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {journal.map((l) => {
              const acteur = membres.find((m) => m.id === l.acteur_id)
              return (
                <li key={l.id} className="chiffres flex justify-between text-legende text-encre-2">
                  <span>
                    {acteur?.prenom ?? 'système'} · {l.action} · {l.cible.split(':')[0]}
                  </span>
                  <span className="text-encre-3">
                    {new Date(l.cree_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Carte>

      <Feuille ouverte={enEdition !== null} onFermer={() => setEnEdition(null)} titre={`Modifier ${enEdition?.prenom ?? ''}`}>
        {enEdition && (
          <FormMembre
            initial={enEdition}
            surEnregistrement={async (valeurs) => {
              await supabase.from('membres').update(valeurs).eq('id', enEdition.id)
              setEnEdition(null)
              window.location.reload()
            }}
          />
        )}
      </Feuille>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouveau membre">
        {foyer && (
          <FormMembre
            surEnregistrement={async (valeurs) => {
              await supabase.from('membres').insert({
                id: crypto.randomUUID(),
                foyer_id: foyer.id,
                prenom: valeurs.prenom ?? 'Nouveau',
                role: valeurs.role ?? 'guest',
                couleur: valeurs.couleur ?? 'prune',
                email_invitation: valeurs.email_invitation ?? null,
                actif_jusqu_au: valeurs.actif_jusqu_au ?? null,
                points: 0,
                modules_autorises: valeurs.role === 'guest' ? ['evenements', 'routines', 'mur'] : [],
              })
              setCreation(false)
              window.location.reload()
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormMembre({
  initial,
  surEnregistrement,
}: {
  initial?: LigneMembre
  surEnregistrement: (valeurs: {
    prenom?: string
    role?: RoleMembre
    couleur?: CouleurMembre
    email_invitation?: string | null
    actif_jusqu_au?: string | null
    points?: number
  }) => Promise<void>
}) {
  const [prenom, setPrenom] = useState(initial?.prenom ?? '')
  const [role, setRole] = useState<RoleMembre>(initial?.role ?? 'guest')
  const [couleur, setCouleur] = useState<CouleurMembre>(initial?.couleur ?? 'prune')
  const [email, setEmail] = useState(initial?.email_invitation ?? '')
  const [expiration, setExpiration] = useState(initial?.actif_jusqu_au?.slice(0, 10) ?? '')
  const [enCours, setEnCours] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
      <div className="flex gap-1">
        {ROLES.map((r) => (
          <button
            key={r.valeur}
            onClick={() => setRole(r.valeur)}
            aria-pressed={role === r.valeur}
            className={`min-h-sur-tactile flex-1 rounded-xl text-note font-[590]
              ${role === r.valeur ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
          >
            {r.libelle}
          </button>
        ))}
      </div>
      <div>
        <span className="mb-1 block text-note font-[500] text-encre-2">Couleur du fil</span>
        <div className="flex gap-2">
          {COULEURS.map((c) => (
            <button
              key={c}
              onClick={() => setCouleur(c)}
              aria-label={c}
              aria-pressed={couleur === c}
              className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center"
            >
              <span
                className="h-8 w-8 rounded-full"
                style={{
                  background: couleurMembre(c),
                  outline: couleur === c ? '3px solid var(--encre)' : 'none',
                  outlineOffset: 2,
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <ChampTexte
        etiquette="Email de connexion (facultatif — relie un compte)"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {role === 'guest' && (
        <ChampTexte
          etiquette="Accès jusqu'au (invités)"
          type="date"
          value={expiration}
          onChange={(e) => setExpiration(e.target.value)}
        />
      )}
      <Bouton
        pleineLargeur
        variante="valider"
        desactive={enCours}
        onClick={() => {
          if (!prenom.trim()) return
          setEnCours(true)
          void surEnregistrement({
            prenom: prenom.trim(),
            role,
            couleur,
            email_invitation: email.trim() || null,
            actif_jusqu_au: role === 'guest' && expiration ? new Date(`${expiration}T23:59:59`).toISOString() : null,
          })
        }}
      >
        {enCours ? 'Enregistrement…' : 'Enregistrer'}
      </Bouton>
    </div>
  )
}
