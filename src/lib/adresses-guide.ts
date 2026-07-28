// 🍽 LE GUIDE DE STG — les adresses qu'on ne veut pas louper.
//
// Ce ne sont pas les « attractions touristiques » : ce sont les maisons, les
// tables et les lieux qui font l'âme d'une région, ceux dont les gens du coin
// parlent. Chaque fiche dit CE QUE C'EST et POURQUOI on y va.
//
// ⚠️ Une adresse peut fermer, changer de chef, de jour de repos. Chaque fiche
// ouvre en un appui les avis Google, le site et Instagram : on vérifie
// toujours avant de partir. L'app ne prétend pas connaître les horaires.

export type CategorieAdresse =
  | 'table'
  | 'bistrot'
  | 'sucre'
  | 'marche'
  | 'producteur'
  | 'bar'
  | 'spot'
  | 'nature'
  | 'culture'
  | 'boutique'

export const CATEGORIES: { cle: CategorieAdresse; emoji: string; libelle: string }[] = [
  { cle: 'table', emoji: '🍽', libelle: 'Belles tables' },
  { cle: 'bistrot', emoji: '🍷', libelle: 'Bistrots & tapas' },
  { cle: 'sucre', emoji: '🍫', libelle: 'Sucré & chocolat' },
  { cle: 'marche', emoji: '🧺', libelle: 'Marchés & halles' },
  { cle: 'producteur', emoji: '🧀', libelle: 'Producteurs' },
  { cle: 'bar', emoji: '🥂', libelle: 'Bars & apéro' },
  { cle: 'spot', emoji: '🏄', libelle: 'Spots & plages' },
  { cle: 'nature', emoji: '⛰', libelle: 'Nature & balades' },
  { cle: 'culture', emoji: '🎭', libelle: 'Culture & traditions' },
  { cle: 'boutique', emoji: '🛍', libelle: 'Boutiques' },
]

export const emojiCategorie = (c: string): string =>
  CATEGORIES.find((x) => x.cle === c)?.emoji ?? '📍'
export const libelleCategorie = (c: string): string =>
  CATEGORIES.find((x) => x.cle === c)?.libelle ?? 'Adresse'

export interface AdresseGuide {
  nom: string
  categorie: CategorieAdresse
  commune: string
  /** Ce que c'est, en une ligne. */
  quoi: string
  /** Pourquoi il ne faut pas le louper — le vrai argument. */
  pourquoi: string
  prix?: '€' | '€€' | '€€€' | '€€€€'
  /** Un conseil pratique : réserver, jour de fermeture, meilleur moment. */
  conseil?: string
  instagram?: string
}

export interface RegionGuide {
  cle: string
  libelle: string
  resume: string
  /** Les communes couvertes — sert aussi à reconnaître une destination. */
  communes: string[]
  adresses: AdresseGuide[]
}

// ————————————————————— Côte basque & sud des Landes —————————————————————

const PAYS_BASQUE: RegionGuide = {
  cle: 'pays-basque',
  libelle: 'Côte basque & sud des Landes',
  resume:
    'Entre Hossegor et la frontière, une bande de 50 km où l’on mange debout au comptoir des halles, où le piment ' +
    'd’Espelette sèche sur les façades et où l’océan dicte le rythme. La règle locale : on réserve, on arrive tôt aux ' +
    'halles, et on ne dîne jamais avant 20 h 30.',
  communes: [
    'Bayonne', 'Biarritz', 'Anglet', 'Saint-Jean-de-Luz', 'Ciboure', 'Guéthary', 'Bidart', 'Hendaye',
    'Ahetze', 'Ascain', 'Sare', 'Ainhoa', 'Espelette', 'Saint-Jean-Pied-de-Port', 'Saint-Étienne-de-Baïgorry',
    'Hossegor', 'Seignosse', 'Capbreton', 'Soorts-Hossegor', 'Urrugne', 'Arcangues', 'Bidache',
  ],
  adresses: [
    // ——— Bayonne ———
    {
      nom: 'Les Halles de Bayonne',
      categorie: 'marche',
      commune: 'Bayonne',
      quoi: 'Le marché couvert au bord de la Nive, et les bars à tapas tout autour.',
      pourquoi:
        'C’est LE point de départ de tout séjour. On y goûte le jambon coupé devant soi, les piquillos, le fromage ' +
        'de brebis d’estive, et on prend le pouls de la ville. Le samedi matin, c’est toute la région qui s’y donne rendez-vous.',
      prix: '€',
      conseil: 'Samedi matin pour l’ambiance, mais y aller AVANT 10 h. Fermé le lundi.',
    },
    {
      nom: 'Cazenave',
      categorie: 'sucre',
      commune: 'Bayonne',
      quoi: 'Salon de chocolat sous les arceaux de la rue Port-Neuf, maison du XIXᵉ siècle.',
      pourquoi:
        'Le chocolat mousseux servi dans un décor de bois et de miroirs inchangé depuis toujours, avec les toasts ' +
        'beurrés. C’est une institution bayonnaise, pas une boutique à touristes : les familles d’ici y vont depuis trois générations.',
      prix: '€€',
      conseil: 'Petites salles, ça se remplit vite le week-end. Fermé le dimanche et le lundi.',
    },
    {
      nom: 'Pierre Ibaialde',
      categorie: 'producteur',
      commune: 'Bayonne',
      quoi: 'Conserverie artisanale et séchoir à jambons, en plein centre.',
      pourquoi:
        'On visite le séchoir, on comprend enfin ce qui distingue un vrai jambon de Bayonne d’un jambon industriel, ' +
        'et on repart avec des conserves qu’on ne trouve nulle part ailleurs. La visite est gratuite et passionnante.',
      prix: '€€',
      conseil: 'Demander la visite du séchoir — elle ne se voit pas depuis la rue.',
    },
    {
      nom: 'Chocolaterie Daranatz',
      categorie: 'sucre',
      commune: 'Bayonne',
      quoi: 'Chocolatier bayonnais historique.',
      pourquoi:
        'Bayonne est la première ville de France où l’on a travaillé le chocolat. Daranatz perpétue les ganaches et ' +
        'les palets d’or à l’ancienne — le vrai goût, sans sucre inutile.',
      prix: '€€',
    },
    {
      nom: 'Bar du Marché',
      categorie: 'bistrot',
      commune: 'Bayonne',
      quoi: 'Bar à tapas face aux halles, dans le quartier des bars du Petit Bayonne.',
      pourquoi:
        'Le rituel local : un txakoli ou un verre d’Irouléguy debout, deux ou trois pintxos, puis on change de bar. ' +
        'C’est là qu’on comprend que le repas basque se marche autant qu’il se mange.',
      prix: '€',
      conseil: 'Faire la tournée des bars autour des halles plutôt que s’installer dans un seul.',
    },

    // ——— Biarritz ———
    {
      nom: 'Les Halles de Biarritz',
      categorie: 'marche',
      commune: 'Biarritz',
      quoi: 'Marché couvert et sa ceinture de bars à huîtres et à tapas.',
      pourquoi:
        'Le meilleur déjeuner improvisé de la côte : on achète au producteur à l’intérieur, on s’assied au comptoir ' +
        'à l’extérieur. Ambiance vraie, prix honnêtes, ouvert tous les matins.',
      prix: '€€',
      conseil: 'Le midi en semaine est bien plus agréable que le week-end.',
    },
    {
      nom: 'Chez Albert',
      categorie: 'table',
      commune: 'Biarritz',
      quoi: 'Table de poissons et fruits de mer, sur le port des Pêcheurs.',
      pourquoi:
        'Le port des Pêcheurs est un village de crampottes coincé sous la falaise, un des plus beaux endroits de la ' +
        'côte. Ici on mange le poisson du jour face aux bateaux, sans chichi.',
      prix: '€€€',
      conseil: 'Réserver longtemps à l’avance en été, et demander une table dehors.',
    },
    {
      nom: 'Casa Juan Pedro',
      categorie: 'bistrot',
      commune: 'Biarritz',
      quoi: 'Cabane de pêcheurs du port, grillades de poisson et chipirons.',
      pourquoi:
        'La version simple et populaire du port des Pêcheurs : nappes en papier, chipirons à la plancha, verre de ' +
        'blanc. C’est exactement ce que les Biarrots viennent y chercher.',
      prix: '€€',
    },
    {
      nom: 'Miremont',
      categorie: 'sucre',
      commune: 'Biarritz',
      quoi: 'Salon de thé Belle Époque face à la Grande Plage, ouvert depuis 1872.',
      pourquoi:
        'Les dorures, les vitrines de pâtisseries et la vue sur l’océan : c’est le Biarritz impérial qui n’a pas ' +
        'bougé. On y prend un chocolat ou un gâteau basque en regardant les surfeurs.',
      prix: '€€',
    },
    {
      nom: 'Étxola Bibi',
      categorie: 'bar',
      commune: 'Biarritz',
      quoi: 'Guinguette en bois au-dessus de la Côte des Basques.',
      pourquoi:
        'Le coucher de soleil sur la Côte des Basques avec un verre à la main, c’est le moment que tout le monde ' +
        'garde en tête au retour. Simple, pieds dans le sable, sans réservation.',
      prix: '€',
      conseil: 'Y être une heure avant le coucher du soleil pour avoir une place.',
    },

    // ——— Saint-Jean-de-Luz & Ciboure ———
    {
      nom: 'Maison Adam',
      categorie: 'sucre',
      commune: 'Saint-Jean-de-Luz',
      quoi: 'Macarons de Saint-Jean-de-Luz, recette de famille depuis 1660.',
      pourquoi:
        'Ce ne sont pas les macarons parisiens : ici c’est un biscuit rond à l’amande, moelleux, sans crème. Ceux ' +
        'servis au mariage de Louis XIV. Rien à voir avec ce qu’on croit connaître.',
      prix: '€',
      conseil: 'Les acheter le jour même, ils ne se gardent pas.',
    },
    {
      nom: 'Pâtisserie Pariès',
      categorie: 'sucre',
      commune: 'Saint-Jean-de-Luz',
      quoi: 'Kanougas (caramels tendres) et gâteau basque.',
      pourquoi:
        'Le kanouga est une invention luzienne : un caramel mou au chocolat qui ne ressemble à rien d’autre. Et le ' +
        'gâteau basque à la cerise noire d’Itxassou tranche avec la version à la crème.',
      prix: '€',
      conseil: 'Goûter LES DEUX gâteaux basques : crème et cerise noire. On a toujours une préférence.',
    },
    {
      nom: 'Les Halles de Saint-Jean-de-Luz',
      categorie: 'marche',
      commune: 'Saint-Jean-de-Luz',
      quoi: 'Halles quotidiennes en plein centre, poissons de la criée d’à côté.',
      pourquoi:
        'Saint-Jean-de-Luz est encore un vrai port de pêche : le thon, le merlu et les chipirons arrivent d’en face. ' +
        'On voit la différence tout de suite.',
      prix: '€€',
      conseil: 'Tôt le matin pour le poisson ; le mardi et le vendredi le marché déborde dans les rues.',
    },
    {
      nom: 'Chez Pablo',
      categorie: 'bistrot',
      commune: 'Saint-Jean-de-Luz',
      quoi: 'Petite salle de quartier, cuisine basque sans détour.',
      pourquoi:
        'Le genre d’endroit où l’on mange le ttoro (soupe de poisson basque) et les chipirons comme à la maison, ' +
        'entouré d’habitués. Aucun décor, tout dans l’assiette.',
      prix: '€€',
      conseil: 'Très petit : réserver, ou venir dès l’ouverture.',
    },
    {
      nom: 'Kaiku',
      categorie: 'table',
      commune: 'Saint-Jean-de-Luz',
      quoi: 'Table gastronomique dans la plus vieille maison de la ville.',
      pourquoi:
        'Pour le repas « qui compte » du séjour : produits de la côte travaillés finement, dans des murs du XVIᵉ ' +
        'siècle à deux pas du port. C’est la table qu’on cite quand on parle de Saint-Jean-de-Luz.',
      prix: '€€€€',
      conseil: 'Réservation indispensable, souvent plusieurs semaines à l’avance.',
    },
    {
      nom: 'Chez Mattin',
      categorie: 'bistrot',
      commune: 'Ciboure',
      quoi: 'Maison basque familiale dans une ruelle de Ciboure.',
      pourquoi:
        'De l’autre côté du port, loin de la foule luzienne : cuisine de famille, ardoise selon la marée, accueil ' +
        'qui donne l’impression d’être invité.',
      prix: '€€',
      conseil: 'Réserver — la salle est minuscule.',
    },

    // ——— Guéthary, Bidart, Ahetze ———
    {
      nom: 'Ostalapia',
      categorie: 'table',
      commune: 'Ahetze',
      quoi: 'Ferme du XVIᵉ siècle transformée en auberge, dans la campagne derrière la côte.',
      pourquoi:
        'À dix minutes de la plage mais dans un autre monde : vieilles pierres, feu de cheminée, cuisine du marché ' +
        'et légumes du potager. L’endroit où l’on comprend le Pays basque intérieur.',
      prix: '€€€',
      conseil: 'Réserver, et demander la terrasse ou la table près du feu selon la saison.',
    },
    {
      nom: 'Briketenia',
      categorie: 'table',
      commune: 'Guéthary',
      quoi: 'Maison de village devenue table gastronomique reconnue.',
      pourquoi:
        'Cuisine précise et très ancrée dans le territoire, dans un village qui a gardé son échelle. Une des tables ' +
        'les plus sûres de la côte pour un grand repas.',
      prix: '€€€€',
      conseil: 'Réserver bien à l’avance ; le menu déjeuner est nettement plus accessible.',
    },
    {
      nom: 'Bahia Beach — plage de Cénitz',
      categorie: 'bar',
      commune: 'Guéthary',
      quoi: 'Cabane de plage sur la petite crique de Cénitz.',
      pourquoi:
        'Cénitz est une crique confidentielle entre deux pointes rocheuses. Un verre les pieds dans le sable en fin ' +
        'de journée, c’est l’image qu’on garde de la côte basque.',
      prix: '€€',
      conseil: 'Accès à pied par le sentier littoral ; parking minuscule.',
    },
    {
      nom: 'Table des Frères Ibarboure',
      categorie: 'table',
      commune: 'Bidart',
      quoi: 'Grande maison familiale dans un parc, étoilée.',
      pourquoi:
        'La table de référence quand on veut marquer le coup : deux frères, une cuisine de haut vol qui reste ' +
        'lisible, et un cadre calme à l’écart de la côte.',
      prix: '€€€€',
      conseil: 'Réservation longtemps à l’avance. Menu déjeuner en semaine plus abordable.',
    },

    // ——— L'intérieur : Espelette, Sare, Ainhoa, Irouléguy ———
    {
      nom: 'L’Atelier du Piment',
      categorie: 'producteur',
      commune: 'Espelette',
      quoi: 'Producteur de piment d’Espelette AOP, visite des séchoirs et du champ.',
      pourquoi:
        'On croit connaître le piment d’Espelette : sur place on découvre qu’il n’est pas fort mais fruité, et on ' +
        'voit les cordes sécher sur les façades du village. Visite libre et gratuite.',
      prix: '€',
      conseil: 'Fin août à octobre : le village entier est tapissé de piments rouges.',
    },
    {
      nom: 'Cave d’Irouléguy',
      categorie: 'producteur',
      commune: 'Saint-Étienne-de-Baïgorry',
      quoi: 'La cave coopérative du plus petit vignoble de France.',
      pourquoi:
        'L’Irouléguy est un vin de montagne, tannique et salin, qu’on ne trouve quasiment pas ailleurs. Le rouge ' +
        'avec l’axoa, le blanc avec le fromage de brebis : c’est là que le repas basque prend son sens.',
      prix: '€€',
      conseil: 'Dégustation sur place ; la route depuis Saint-Jean-Pied-de-Port vaut le détour à elle seule.',
    },
    {
      nom: 'Le petit train de La Rhune',
      categorie: 'nature',
      commune: 'Sare',
      quoi: 'Train à crémaillère de 1924 qui monte au sommet de La Rhune (905 m).',
      pourquoi:
        'En haut : l’océan d’un côté, les Pyrénées de l’autre, les pottoks (petits chevaux basques) en liberté ' +
        'autour. C’est la carte postale, mais elle est méritée — et le train de bois d’origine fait le voyage.',
      prix: '€€',
      conseil: 'Réserver en ligne, partir au premier départ : les nuages montent dans la journée.',
    },
    {
      nom: 'Grottes de Sare et village de Sare',
      categorie: 'nature',
      commune: 'Sare',
      quoi: 'Un des plus beaux villages de France, maisons rouges et blanches, fronton au centre.',
      pourquoi:
        'Sare, Ainhoa et Ascain forment le triangle des villages basques restés intacts. On s’y arrête pour le ' +
        'fronton, l’église à galeries de bois et le silence.',
      prix: '€',
      conseil: 'Enchaîner Sare → Ainhoa → Espelette dans la même demi-journée.',
    },
    {
      nom: 'Saint-Jean-Pied-de-Port',
      categorie: 'culture',
      commune: 'Saint-Jean-Pied-de-Port',
      quoi: 'Cité fortifiée, dernière étape française du chemin de Compostelle.',
      pourquoi:
        'La rue de la Citadelle pavée, les pèlerins qui partent à l’aube, les remparts roses. Le lundi, le marché ' +
        'remplit toute la ville de fromages d’estive et de charcuterie de montagne.',
      prix: '€',
      conseil: 'Y aller un LUNDI pour le marché — c’est un tout autre endroit.',
    },

    // ——— Les Landes : Hossegor, Capbreton, Seignosse ———
    {
      nom: 'Marché de Capbreton',
      categorie: 'marche',
      commune: 'Capbreton',
      quoi: 'Halles et criée au bord du port, poisson débarqué du jour.',
      pourquoi:
        'Capbreton a un gouf (canyon sous-marin) juste devant le port : la pêche y est particulière et arrive ' +
        'directement aux halles. On achète, on fait griller, on n’a rien à ajouter.',
      prix: '€€',
      conseil: 'Voir rentrer les bateaux en fin de matinée, puis acheter à la criée.',
    },
    {
      nom: 'Le lac marin d’Hossegor',
      categorie: 'spot',
      commune: 'Soorts-Hossegor',
      quoi: 'Lac d’eau salée qui se remplit et se vide avec la marée, bordé de villas basco-landaises.',
      pourquoi:
        'La baignade calme quand l’océan est trop fort — parfait avec un enfant. Le tour du lac à pied ou à vélo ' +
        'passe devant les villas des années 1920, c’est une promenade en soi.',
      prix: '€',
      conseil: 'Se baigner à marée haute : à marée basse il se vide presque entièrement.',
    },
    {
      nom: 'La Plage des Culs Nus & les spots d’Hossegor',
      categorie: 'spot',
      commune: 'Soorts-Hossegor',
      quoi: 'La côte landaise, référence mondiale du surf de beach-break.',
      pourquoi:
        'Même sans surfer : la puissance de l’océan ici n’a rien à voir avec la Méditerranée. En septembre, on ' +
        'peut voir les meilleurs surfeurs du monde à la Gravière.',
      prix: '€',
      conseil: '⚠️ Baïnes et courants : ne se baigner QUE dans les zones surveillées, entre les drapeaux.',
    },
    {
      nom: 'Les Roseaux',
      categorie: 'bistrot',
      commune: 'Soorts-Hossegor',
      quoi: 'Table au bord du lac marin.',
      pourquoi:
        'Déjeuner face à l’eau, produits de la côte, ambiance landaise décontractée. Le bon compromis entre la ' +
        'plage et la table sérieuse.',
      prix: '€€€',
      conseil: 'Réserver une table côté lac.',
    },

    // ——— Traditions ———
    {
      nom: 'Une partie de pelote au fronton',
      categorie: 'culture',
      commune: 'Pays basque',
      quoi: 'Main nue, chistera ou pala — dans le fronton de n’importe quel village.',
      pourquoi:
        'C’est LE truc à ne pas louper, et personne n’y pense. Une partie de main nue un soir d’été dans un village, ' +
        'entouré des gens du coin, c’est le Pays basque en vrai — pas celui des cartes postales.',
      prix: '€',
      conseil: 'Demander à l’office de tourisme le calendrier des parties : il y en a presque tous les soirs en été.',
    },
    {
      nom: 'Les Fêtes de Bayonne',
      categorie: 'culture',
      commune: 'Bayonne',
      quoi: 'Cinq jours de fête en blanc et rouge, fin juillet.',
      pourquoi:
        'Un million de personnes, toute la ville en blanc avec le foulard rouge. Immense, épuisant, inoubliable — ' +
        'mais à savoir avant de réserver un séjour à cette date.',
      prix: '€',
      conseil: 'Avec un enfant : y aller la journée (peñas, cavalcade), pas la nuit.',
    },
  ],
}

export const REGIONS: RegionGuide[] = [PAYS_BASQUE]

/** La région du guide qui correspond à une destination écrite à la main. */
export function regionPour(destination: string | null | undefined): RegionGuide | null {
  const texte = String(destination ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!texte.trim()) return null
  for (const region of REGIONS) {
    const cles = [region.libelle, ...region.communes, 'pays basque', 'cote basque', 'landes']
    if (
      cles.some((c) =>
        texte.includes(
          c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        ),
      )
    ) {
      return region
    }
  }
  return null
}

// —————————————————————————— Les liens utiles ——————————————————————————
// On ne stocke jamais un numéro ou une adresse qu'on n'a pas vérifiés : on
// ouvre plutôt la recherche, où les avis et les horaires sont à jour.

const requete = (nom: string, commune: string) => encodeURIComponent(`${nom} ${commune}`.trim())

/** La fiche Google Maps : c'est là que sont les avis clients et les horaires. */
export const lienAvis = (nom: string, commune: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${requete(nom, commune)}`

/** Le site officiel (première réponse d'une recherche). */
export const lienSite = (nom: string, commune: string): string =>
  `https://duckduckgo.com/?q=${requete(nom, commune)}+site+officiel`

export const lienInstagram = (nom: string, commune: string, compte?: string): string =>
  compte
    ? `https://www.instagram.com/${compte.replace(/^@/, '')}`
    : `https://duckduckgo.com/?q=${requete(nom, commune)}+instagram`

/** L'itinéraire depuis là où l'on est. */
export const lienItineraire = (nom: string, commune: string): string =>
  `https://maps.apple.com/?q=${requete(nom, commune)}`
