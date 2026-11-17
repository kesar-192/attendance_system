/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#13294B', 700: '#1C3862', 600: '#2A4A7C', 300: '#8FA3C2', 100: '#DCE4F0' },
        paper: '#F4F6F9',
        brand: { DEFAULT: '#0E7C7B', dark: '#0A5F5E', soft: '#E3F2F1' },
        shortage: { DEFAULT: '#B42318', soft: '#FDECEA' },
        healthy: { DEFAULT: '#1F7A4D', soft: '#E6F4EC' },
        caution: { DEFAULT: '#A15C07', soft: '#FDF3E1' },
        line: '#DDE2EA',
        muted: '#5B6678'
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif']
      },
      boxShadow: { panel: '0 1px 2px rgba(19,41,75,0.06), 0 0 0 1px #DDE2EA' }
    }
  },
  plugins: []
};
