# AGENTS.md

## 一、项目概述
本地Markdown笔记桌面应用。Electron + React18 + TS + Vite + Tailwind + react-markdown。数据只存本地md文件，无任何网络请求。

## 二、运行方式
npm install；npm run dev 启动；npm run build 打包exe到dist/。

## 三、硬性约定
1. 每次改动后提交一个git版本（中文提交信息）
2. 每完成一个功能先自测无报错再交付
3. 所有文件操作走主进程ipc
4. 界面简洁，关键操作配图标

## 四、代码风格
函数式组件+Hooks；文件与组件同名大驼峰；中文注释；改动前说明范围。