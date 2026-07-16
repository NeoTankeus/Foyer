// Génère les icônes PWA (PNG) sans aucune dépendance : trois fils tissés —
// ambre, sauge, ardoise — sur fond nuit. Le motif du Fil, réduit à l'essentiel.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const SORTIE = join(RACINE, 'public', 'icones')
mkdirSync(SORTIE, { recursive: true })

const FOND = [14, 14, 16]
const FILS = [
  [224, 155, 61], // ambre
  [110, 155, 122], // sauge
  [91, 127, 166], // ardoise
]

function crc32(donnees) {
  let crc = 0xffffffff
  for (const octet of donnees) {
    crc ^= octet
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function morceau(type, contenu) {
  const longueur = Buffer.alloc(4)
  longueur.writeUInt32BE(contenu.length)
  const typeEtContenu = Buffer.concat([Buffer.from(type, 'ascii'), contenu])
  const somme = Buffer.alloc(4)
  somme.writeUInt32BE(crc32(typeEtContenu))
  return Buffer.concat([longueur, typeEtContenu, somme])
}

function ecrirePng(chemin, taille, pixels) {
  const enTete = Buffer.alloc(13)
  enTete.writeUInt32BE(taille, 0)
  enTete.writeUInt32BE(taille, 4)
  enTete[8] = 8 // profondeur
  enTete[9] = 6 // RGBA
  const lignes = Buffer.alloc(taille * (taille * 4 + 1))
  for (let y = 0; y < taille; y++) {
    const debut = y * (taille * 4 + 1)
    lignes[debut] = 0 // filtre : aucun
    pixels.copy(lignes, debut + 1, y * taille * 4, (y + 1) * taille * 4)
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', enTete),
    morceau('IDAT', deflateSync(lignes, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ])
  writeFileSync(chemin, png)
  console.log(`✓ ${chemin} (${taille}×${taille})`)
}

/** Dessine les trois fils tissés. `marge` réduit le motif (zone sûre maskable). */
function dessiner(taille, marge) {
  const pixels = Buffer.alloc(taille * taille * 4)
  const epaisseur = taille * 0.045
  const amplitude = taille * (0.5 - marge) * 0.55
  const centre = taille / 2
  const periode = taille / 1.35

  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      let couleur = FOND
      // ordre de dessin fixe + phase décalée = impression de tissage
      for (let fil = 0; fil < FILS.length; fil++) {
        const phase = (fil * 2 * Math.PI) / 3
        const cx = centre + amplitude * Math.sin((2 * Math.PI * y) / periode + phase)
        if (Math.abs(x - cx) < epaisseur) {
          // le fil « dessous » laisse passer celui du dessus une période sur deux
          const dessus = Math.floor(y / (periode / 2) + fil) % FILS.length
          couleur = FILS[(fil + dessus) % FILS.length] ?? FILS[fil]
        }
      }
      const index = (y * taille + x) * 4
      pixels[index] = couleur[0]
      pixels[index + 1] = couleur[1]
      pixels[index + 2] = couleur[2]
      pixels[index + 3] = 255
    }
  }
  return pixels
}

for (const [nom, taille, marge] of [
  ['icone-192.png', 192, 0.08],
  ['icone-512.png', 512, 0.08],
  ['icone-180.png', 180, 0.08],
  ['icone-maskable-192.png', 192, 0.22],
  ['icone-maskable-512.png', 512, 0.22],
]) {
  ecrirePng(join(SORTIE, nom), taille, dessiner(taille, marge))
}
