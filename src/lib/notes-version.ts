// Les nouveautés de la version en cours — affichées UNE fois dans le pop-up
// « Quoi de neuf », signé ILY. Mises à jour à chaque déploiement.
export const NOTES_VERSION: string[] = [
  '✈️ Les voyages se modifient et se suppriment : ✏️ dans la liste (ou depuis la fiche du voyage) — titre, destination, dates. La suppression demande confirmation et prévient de ce qui part avec (les photos souvenirs, elles, restent).',
  '🚦 Trafic réparé : TomTom ne renvoyait pas le temps « sans bouchons » — l’app le demande désormais explicitement et sait le déduire.',
  '🛡️ GRANDE RÉVISION : toute l’application a été passée au peigne fin, écran par écran, bouton par bouton. Une centaine de bugs corrigés — sans toucher à la moindre de vos données.',
  '🚫 Une page qui plante ne bloque PLUS l’app : elle seule est concernée, la barre du bas reste utilisable et un bouton ramène au tableau de bord sans recharger.',
  '💾 Vos saisies ne peuvent plus se perdre : une coupure réseau est désormais reconnue comme telle et la modification est réessayée au lieu d’être abandonnée.',
  '📅 Calendriers Apple : une synchro qui échouait pouvait effacer des événements — c’est réparé, plus rien n’est supprimé si la lecture ne réussit pas.',
  '⚡ Tableau de bord plus rapide et plus juste : fini le rechargement en boucle, les événements « toute la journée » réapparaissent, et plus aucune date bizarre.',
  '🗓 Agenda : une heure effacée ne fait plus écran blanc, et « tous les mois » depuis un 31 tombe enfin au bon jour.',
  '🛣 Chaque voyage affiche l’ÉTAT DE LA ROUTE depuis la maison : durée réelle, kilomètres et bouchons en direct.',
  '🏖 Les Plages (eaux de baignade + webcams) et 🏠 Autour de chez nous (ventes immobilières réelles du quartier).',
  '💊 Photographie une boîte de médicament → fiche claire · 🖼 photo d’astronomie du jour · 🕰 le temps qu’il faisait il y a un an.',
]
