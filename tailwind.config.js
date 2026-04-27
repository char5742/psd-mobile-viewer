/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#f8f9fa',
          100: '#1e1e2e',
          200: '#181825',
          300: '#11111b',
        },
        accent: {
          DEFAULT: '#89b4fa',
          light: '#cba6f7',
        },
      },
    },
  },
  plugins: [],
};
