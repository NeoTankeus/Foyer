// Aperçu autonome du Fil (données factices) — pour visualiser sans backend.
// Non référencé par l'app ; sert aux captures d'écran.
import { createRoot } from 'react-dom/client'
import { LeFil } from './fonctionnalites/aujourdhui/fil/LeFil'
import { BriefGastif } from './fonctionnalites/aujourdhui/BriefGastif'
import { formatJourLong, maintenantLocal, versUtc } from './lib/dates'
import type { LigneEvenement, LigneMembre } from './lib/basedonnees.types'
import './design/tokens.css'

const foyer = '00000000-0000-4000-8000-000000000001'

function membre(id: string, prenom: string, role: LigneMembre['role'], couleur: LigneMembre['couleur']): LigneMembre {
  return {
    id, foyer_id: foyer, auth_user_id: null, email_invitation: null, prenom,
    naissance: null, role, couleur, avatar_url: null, points: 0,
    modules_autorises: [], actif_jusqu_au: null, cree_le: '',
  }
}

const membres = [
  membre('m1', 'Anna', 'adult', 'ambre'),
  membre('m2', 'Sam', 'adult', 'sauge'),
  membre('m3', 'Gabriel', 'child', 'ardoise'),
]

let n = 0
function evenement(titre: string, hDebut: number, hFin: number, participants: string[], lieu: string | null = null): LigneEvenement {
  // Heures « murales » Europe/Paris → stockage UTC, comme dans la vraie base.
  const jour = maintenantLocal()
  const a = new Date(jour); a.setHours(Math.floor(hDebut), Math.round((hDebut % 1) * 60), 0, 0)
  const b = new Date(jour); b.setHours(Math.floor(hFin), Math.round((hFin % 1) * 60), 0, 0)
  n += 1
  return {
    id: `e${n}`, foyer_id: foyer, titre, debut_a: versUtc(a), fin_a: versUtc(b),
    journee_entiere: false, lieu, notes: null, categorie: null, visible_enfant: true,
    source: 'foyer', source_id: null, sync_token: null, participants, cree_par: null,
    cree_le: '', modifie_le: '',
  }
}

const evenements: LigneEvenement[] = [
  evenement('Petit-déjeuner', 7.25, 8, []),
  evenement('École', 8.5, 16.5, ['m3']),
  evenement('Réunion budget', 10, 11.5, ['m1']),
  evenement('Marché', 10.5, 11.5, ['m2']),
  evenement('Piscine', 17, 18, ['m3'], 'bassin 2'),
  evenement('Dîner', 19.5, 20.5, []),
  evenement('Film', 21, 22, ['m1', 'm2']),
]

const racine = document.getElementById('racine')
if (racine) {
  createRoot(racine).render(
    <div className="mx-auto max-w-[420px] bg-fond px-4 pb-8">
      <header className="px-1 pb-2 pt-4">
        <h1 className="text-titre-2 capitalize text-encre">{formatJourLong(maintenantLocal())}</h1>
      </header>
      <LeFil membres={membres} evenements={evenements} />
      <div className="mt-2">
        <BriefGastif evenements={evenements} taches={[]} />
      </div>
    </div>,
  )
}
