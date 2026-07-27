// Catégorisation par rayon : dictionnaire local d'abord (Gastif en secours, phase 2).
// L'ordre de RAYONS est l'ordre de parcours du magasin — c'est ce qui rend la
// liste utilisable une fois dans les allées.

export const RAYONS = [
  'fruits & légumes',
  'boulangerie',
  'crèmerie',
  'boucherie & poisson',
  'épicerie salée',
  'épicerie sucrée',
  'surgelés',
  'boissons',
  'hygiène & beauté',
  'entretien',
  'bébé & enfant',
  'divers',
] as const

export type Rayon = (typeof RAYONS)[number]

const DICTIONNAIRE: Record<string, Rayon> = {
  pomme: 'fruits & légumes', banane: 'fruits & légumes', tomate: 'fruits & légumes',
  salade: 'fruits & légumes', carotte: 'fruits & légumes', courgette: 'fruits & légumes',
  oignon: 'fruits & légumes', ail: 'fruits & légumes', citron: 'fruits & légumes',
  pomme_de_terre: 'fruits & légumes', avocat: 'fruits & légumes', fraise: 'fruits & légumes',
  pain: 'boulangerie', baguette: 'boulangerie', brioche: 'boulangerie', croissant: 'boulangerie',
  lait: 'crèmerie', beurre: 'crèmerie', yaourt: 'crèmerie', fromage: 'crèmerie',
  creme: 'crèmerie', oeuf: 'crèmerie', oeufs: 'crèmerie', emmental: 'crèmerie',
  comte: 'crèmerie', mozzarella: 'crèmerie',
  poulet: 'boucherie & poisson', boeuf: 'boucherie & poisson', jambon: 'boucherie & poisson',
  saumon: 'boucherie & poisson', steak: 'boucherie & poisson', lardons: 'boucherie & poisson',
  pates: 'épicerie salée', riz: 'épicerie salée', farine: 'épicerie salée',
  huile: 'épicerie salée', sel: 'épicerie salée', conserve: 'épicerie salée',
  sauce: 'épicerie salée', lasagnes: 'épicerie salée',
  sucre: 'épicerie sucrée', chocolat: 'épicerie sucrée', confiture: 'épicerie sucrée',
  cereales: 'épicerie sucrée', miel: 'épicerie sucrée', gateau: 'épicerie sucrée',
  biscuits: 'épicerie sucrée', compote: 'épicerie sucrée',
  glace: 'surgelés', surgele: 'surgelés', pizza: 'surgelés',
  eau: 'boissons', jus: 'boissons', cafe: 'boissons', the: 'boissons', sirop: 'boissons',
  dentifrice: 'hygiène & beauté', shampoing: 'hygiène & beauté', savon: 'hygiène & beauté',
  gel_douche: 'hygiène & beauté', coton: 'hygiène & beauté',
  lessive: 'entretien', eponge: 'entretien', javel: 'entretien',
  liquide_vaisselle: 'entretien', essuie_tout: 'entretien', sac_poubelle: 'entretien',
  piles: 'divers', ampoule: 'divers',
  couches: 'bébé & enfant',
}

function normaliser(texte: string | null | undefined): string {
  // Un libellé nul venu de la base ne doit jamais faire tomber l'écran
  // (`.toLowerCase()` sur null = page blanche).
  return String(texte ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\W+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Devine le rayon d'un libellé ; « divers » si le dictionnaire ne sait pas. */
export function devinerRayon(libelle: string | null | undefined): Rayon {
  const cle = normaliser(libelle)
  if (!cle) return 'divers'
  const direct = DICTIONNAIRE[cle]
  if (direct) return direct
  // Singulier naïf sur la clé ENTIÈRE avant de découper : « pommes de terre »
  // (→ pommes_de_terre) ne trouvait rien et finissait en « divers ».
  const singulier = DICTIONNAIRE[cle.replace(/s$/, '')]
  if (singulier) return singulier
  for (const mot of cle.split('_')) {
    const parMot = DICTIONNAIRE[mot] ?? DICTIONNAIRE[mot.replace(/s$/, '')]
    if (parMot) return parMot
  }
  return 'divers'
}

/** Trie des articles dans l'ordre de parcours du magasin. */
export function indexRayon(rayon: string | null | undefined): number {
  const index = (RAYONS as readonly string[]).indexOf(rayon ?? '')
  return index === -1 ? RAYONS.length : index
}
