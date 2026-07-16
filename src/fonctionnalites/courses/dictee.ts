// Saisie vocale via la Web Speech API (fr-FR). Typée à la main : l'API n'est
// pas dans lib.dom et n'existe pas partout — on dégrade explicitement.

interface ResultatReconnaissance {
  readonly transcript: string
}

interface EvenementReconnaissance {
  readonly results: ArrayLike<ArrayLike<ResultatReconnaissance>>
}

interface ReconnaissanceVocale {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((evenement: EvenementReconnaissance) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
}

type ConstructeurReconnaissance = new () => ReconnaissanceVocale

function constructeur(): ConstructeurReconnaissance | null {
  const fenetre = window as unknown as {
    SpeechRecognition?: ConstructeurReconnaissance
    webkitSpeechRecognition?: ConstructeurReconnaissance
  }
  return fenetre.SpeechRecognition ?? fenetre.webkitSpeechRecognition ?? null
}

export function dicteePossible(): boolean {
  return constructeur() !== null
}

export function demarrerDictee(onTexte: (texte: string) => void, onEchec: () => void): void {
  const Reconnaissance = constructeur()
  if (!Reconnaissance) {
    onEchec()
    return
  }
  const reconnaissance = new Reconnaissance()
  reconnaissance.lang = 'fr-FR'
  reconnaissance.interimResults = false
  reconnaissance.maxAlternatives = 1
  let recu = false
  reconnaissance.onresult = (evenement) => {
    const texte = evenement.results[0]?.[0]?.transcript
    if (texte) {
      recu = true
      onTexte(texte)
    }
  }
  reconnaissance.onerror = () => onEchec()
  reconnaissance.onend = () => {
    if (!recu) onEchec()
  }
  reconnaissance.start()
}
