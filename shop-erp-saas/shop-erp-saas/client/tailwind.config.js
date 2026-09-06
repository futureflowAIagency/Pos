/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary — teal (was indigo). Every bg-brand-*/text-brand-*/ring-brand-*
        // class across the app picks this up automatically, so buttons, active
        // nav links, focus rings, spinners and badges all switch in one place.
        brand: {
          50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
          400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
          800: '#115e59', 900: '#134e4a', 950: '#042f2e',
        },
        // Secondary accent — coral. Used sparingly (Sidebar's active item,
        // a StatCard accent option) so it reads as a deliberate second color,
        // not a rainbow.
        coral: {
          50: '#fff4f2', 100: '#ffe3de', 200: '#ffc7bc', 300: '#ffa391',
          400: '#fb8268', 500: '#f97362', 600: '#e15a48', 700: '#c2432f',
          800: '#9a3423', 900: '#7a2a1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Hind Siliguri', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
