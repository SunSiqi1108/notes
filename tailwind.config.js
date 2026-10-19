/** @type {import('tailwindcss').Config} */
module.exports = {
  // 暗色主题通过给 html 加 .dark 类切换
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {}
  },
  plugins: []
};
