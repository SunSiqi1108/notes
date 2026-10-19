# TECH_DESIGN.md

## 一、技术栈
| 层 | 选型 | 理由 |
|---|---|---|
| 桌面框架 | Electron | 生态成熟，Builder打包简单 |
| 前端 | React 18 + TypeScript + Vite | 组件化 |
| 样式 | Tailwind CSS | 快速统一 |
| Markdown渲染 | react-markdown + remark-gfm | 支持GFM表格代码块 |
| 存储 | 本地文件系统（notes-data目录，一笔记一文件，front-matter存标签） | 纯本地，用户可见可读 |
| 主进程 | electron/main.js（CJS） | 省去编译链，dev更稳 |

## 二、目录结构
notes/
├── electron/main.js        # 主进程：窗口、文件读写ipc、对话框
├── electron/preload.js     # 上下文桥接
├── src/
│   ├── pages/Editor.tsx    # 三栏主界面
│   ├── components/         # NoteList/EditorPane/PreviewPane/SearchBar/TagBar
│   └── lib/markdown.ts     # markdown工具
├── notes-data/             # 用户笔记数据（运行时创建）
└── package.json

## 三、关键技术点
1. 文件读写走主进程ipc（listNotes/readNote/writeNote/createNote/deleteNote/renameNote/exportHtml），渲染进程不直接碰fs
2. 标签存每个md文件头部的front-matter（---\ntags: a, b\n---），读写时解析
3. 自动保存：编辑器onChange防抖1秒写盘，状态栏显示"保存中…/已保存 HH:MM"
4. 搜索：主进程读取全部笔记内容，前端过滤并生成高亮片段
5. 主题：暗色通过给body加class切换Tailwind dark模式
6. 导出：把react-markdown渲染结果包上内联样式模板写为.html文件