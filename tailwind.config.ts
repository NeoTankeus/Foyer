import type { Config } from 'tailwindcss'

// Toutes les couleurs viennent des variables CSS (src/design/tokens.css) :
// une seule source de vérité, clair/sombre gérés par le média query.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      fond: 'var(--fond)',
      'fond-eleve': 'var(--fond-eleve)',
      'fond-sourd': 'var(--fond-sourd)',
      encre: 'var(--encre)',
      'encre-2': 'var(--encre-2)',
      'encre-3': 'var(--encre-3)',
      trait: 'var(--trait)',
      ambre: 'var(--ambre)',
      sauge: 'var(--sauge)',
      ardoise: 'var(--ardoise)',
      prune: 'var(--prune)',
      corail: 'var(--corail)',
      or: 'var(--or)',
      urgent: 'var(--urgent)',
      fait: 'var(--fait)',
    },
    fontFamily: {
      sans: [
        '-apple-system',
        'BlinkMacSystemFont',
        'SF Pro Display',
        'Inter',
        'system-ui',
        'sans-serif',
      ],
    },
    fontSize: {
      // L'échelle du brief : 34/28/22/17/15/13/11
      titre: ['34px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
      'titre-2': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '700' }],
      'titre-3': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '590' }],
      corps: ['17px', { lineHeight: '22px' }],
      'corps-2': ['15px', { lineHeight: '20px' }],
      note: ['13px', { lineHeight: '18px' }],
      legende: ['11px', { lineHeight: '13px' }],
    },
    borderRadius: {
      none: '0',
      sm: '10px',
      md: '14px',
      lg: '20px',
      xl: '28px',
      full: '9999px',
    },
    boxShadow: {
      // Deux couches très basses opacités, jamais une seule ombre grasse
      carte: '0 1px 1px rgb(0 0 0 / .05), 0 6px 16px rgb(0 0 0 / .05), 0 20px 44px rgb(0 0 0 / .06), inset 0 1px 0 rgb(255 255 255 / .04)',
      feuille: '0 -1px 2px rgb(0 0 0 / .05), 0 -12px 40px rgb(0 0 0 / .14)',
      none: 'none',
    },
    extend: {
      spacing: {
        'sur-tactile': '44px',
      },
    },
  },
  plugins: [],
} satisfies Config
