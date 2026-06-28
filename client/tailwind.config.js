/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        genie: {
          dark: '#0D0700',
          brown: '#1A0D00',
          mid: '#2D1A00',
          gold: '#D4A853',
          orange: '#C45A27',
          cream: '#F5E6D3',
          tan: '#C4A882',
          green: '#2D5016',
          magenta: '#8B1A4A',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'genie-gradient': 'linear-gradient(135deg, #D4A853 0%, #C45A27 50%, #8B1A4A 100%)',
        'genie-hero': 'radial-gradient(ellipse at top, #2D1A00 0%, #0D0700 70%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212, 168, 83, 0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(212, 168, 83, 0)' },
        },
      },
    },
  },
  plugins: [],
}
