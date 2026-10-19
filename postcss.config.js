// package.json 为 CommonJS，这里用 CJS 写法避免 Vite 加载 PostCSS 配置报错
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
