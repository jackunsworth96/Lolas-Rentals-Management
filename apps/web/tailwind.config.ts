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
        'teal-brand': '#1A7A6E',
        'gold-brand': '#F5B731',
        'sand-brand': '#E8DFD0',
        'cream-brand': '#FAF6F0',
        'charcoal-brand': '#3D3D3D',
      },
      fontFamily: {
        headline: ['Epilogue', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
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
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'page-fade-in': 'page-fade-in 600ms ease-out both',
        'fade-up': 'fade-up 500ms ease-out both',
        'toast-slide-up': 'toast-slide-up 300ms ease-out forwards',
        'card-enter': 'card-enter 500ms ease-out both',
        'badge-pop': 'badge-pop 400ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
