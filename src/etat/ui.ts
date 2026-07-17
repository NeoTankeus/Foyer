import { create } from 'zustand'

// Le mode enfant survit au rechargement : on tend le téléphone sans crainte.
const CLE_MODE_ENFANT = 'foyer-mode-enfant'

interface EtatUi {
  modeEnfant: boolean
  activerModeEnfant: () => void
  quitterModeEnfant: () => void
}

export const utiliserUi = create<EtatUi>((set) => ({
  modeEnfant: localStorage.getItem(CLE_MODE_ENFANT) === '1',
  activerModeEnfant: () => {
    localStorage.setItem(CLE_MODE_ENFANT, '1')
    set({ modeEnfant: true })
  },
  quitterModeEnfant: () => {
    localStorage.removeItem(CLE_MODE_ENFANT)
    set({ modeEnfant: false })
  },
}))
