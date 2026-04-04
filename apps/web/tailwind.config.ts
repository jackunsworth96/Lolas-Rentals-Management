import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8f0',
          100: '#f9eddb',
          200: '#f2d7b3',
          300: '#e9bc85',
          400: '#de9a55',
          500: '#d68035',
          600: '#c8672a',
          700: '#a64f25',
          800: '#864024',
          900: '#6d3620',
        },
        'teal-brand': '#00577C',
        'gold-brand': '#FCBC5A',
        'sand-brand': '#f1e6d6',
        'cream-brand': '#FAF6F0',
        'charcoal-brand': '#363737',
      },
      fontFamily: {
        sans: ['"Alegreya Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        headline: ['"Alegreya Sans"', 'ui-sans-serif', 'system-serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        lato: ['Lato', 'Nunito', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'page-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'card-enter': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'badge-pop': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.25)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateX(0px) translateY(0px)' },
          '33%': { transform: 'translateX(15px) translateY(-8px)' },
          '66%': { transform: 'translateX(-10px) translateY(5px)' },
        },
        'float-medium': {
          '0%, 100%': { transform: 'translateX(0px) translateY(0px)' },
          '50%': { transform: 'translateX(-20px) translateY(-12px)' },
        },
        'float-fast': {
          '0%, 100%': { transform: 'translateX(0px) translateY(0px)' },
          '50%': { transform: 'translateX(12px) translateY(-6px)' },
        },
        cloudDriftLegacy: {
          '0%': { transform: 'translateX(-220px)', opacity: '0' },
          '5%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateX(110vw)', opacity: '0' },
        },
        scooterDrive: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animationDuration: {
        '8s': '8s',
        '12s': '12s',
        '14s': '14s',
        '16s': '16s',
        '20s': '20s',
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'page-fade-in': 'page-fade-in 600ms ease-out both',
        'fade-up': 'fade-up 500ms ease-out both',
        'toast-slide-up': 'toast-slide-up 300ms ease-out forwards',
        'card-enter': 'card-enter 500ms ease-out both',
        'badge-pop': 'badge-pop 400ms ease-out',
        'float-slow': 'float-slow 16s ease-in-out infinite',
        'float-medium': 'float-medium 12s ease-in-out infinite',
        'float-fast': 'float-fast 8s ease-in-out infinite',
        'float-slow-delayed': 'float-slow 20s ease-in-out 4s infinite',
        'float-medium-delayed': 'float-medium 14s ease-in-out 2s infinite',
        'cloud-slow': 'cloudDriftLegacy 28s linear infinite',
        'cloud-medium': 'cloudDriftLegacy 18s linear infinite',
        'cloud-fast': 'cloudDriftLegacy 12s linear infinite',
        'cloud-slow-delay': 'cloudDriftLegacy 28s linear 14s infinite',
        'cloud-medium-delay': 'cloudDriftLegacy 18s linear 9s infinite',
        'scooter-drive': 'scooterDrive 12s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
