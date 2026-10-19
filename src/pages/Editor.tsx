import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SearchBar from '../components/SearchBar';
import NoteList from '../components/NoteList';
import type { NoteListItem } from '../components/NoteList';
import TagBar from '../components/TagBar';
import type { TagCount } from '../components/TagBar';
import EditorPane from '../components/EditorPane';
import PreviewPane from '../components/PreviewPane';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  DownloadIcon,
  MoreIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  TagIcon,
  TrashIcon
} from '../components/Icons';
import type { NoteMeta, SaveStatus, SearchHit } from '../types';

/** 状态栏时间：HH:MM */
function formatTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** 逗号（中英文）分隔的标签输入 → 标签数组 */
function parseTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 三栏主界面：左侧笔记列表（含标签云）/ 中间编辑（含标签输入）/ 右侧预览
export default function Editor() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索、标签筛选与主题
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  const timer = useRef<number | null>(null);
  const pending = useRef<{ id: string; body: string; tags: string[] } | null>(null);
  const bodyRef = useRef('');
  const tagsRef = useRef('');
  const queryRef = useRef('');
  const renameCancelled = useRef(false);
  const committing = useRef(false);
  const noticeTimer = useRef<number | null>(null);

  const activeTitle = notes.find((n) => n.id === activeId)?.title ?? null;
  const searching = query.trim().length > 0;

  // 暗色主题：初始跟随系统偏好，顶部按钮可手动切换
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // 仅刷新列表元数据，不触碰正在编辑的正文；搜索进行中时同步刷新命中结果
  const refreshList = useCallback(async () => {
    setNotes(await window.notesApi.listNotes());
    const q = queryRef.current.trim();
    if (q) setHits(await window.notesApi.searchNotes(q));
  }, []);

  // 立即把待保存内容写盘（切换/删除/重命名/导出前调用）
  const flushPending = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    try {
      await window.notesApi.writeNote(p);
      setStatus('saved');
      setSavedAt(Date.now());
      await refreshList();
    } catch (e) {
      setError('保存失败：' + String(e));
    }
  }, [refreshList]);

  // 输入防抖：停止输入 1 秒后自动保存
  const scheduleSave = useCallback(
    (id: string, nextBody: string, nextTags: string[]) => {
      setStatus('saving');
      pending.current = { id, body: nextBody, tags: nextTags };
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flushPending();
      }, 1000);
    },
    [flushPending]
  );

  // 正文变化：记录并把当前标签一起送保存
  const handleChange = (value: string) => {
    if (!activeId) return;
    setBody(value);
    bodyRef.current = value;
    scheduleSave(activeId, value, parseTags(tagsRef.current));
  };

  // 标签变化：逗号分隔，先让标签云即时反映，再走同一个防抖写盘
  const handleTagsChange = (value: string) => {
    setTagsInput(value);
    tagsRef.current = value;
    if (!activeId) return;
    const tags = parseTags(value);
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, tags } : n)));
    scheduleSave(activeId, bodyRef.current, tags);
  };

  // 打开某篇笔记（先落盘未保存内容）
  const openNote = useCallback(
    async (id: string) => {
      await flushPending();
      try {
        const note = await window.notesApi.readNote(id);
        setActiveId(note.id);
        setBody(note.body);
        bodyRef.current = note.body;
        const ti = note.tags.join(', ');
        setTagsInput(ti);
        tagsRef.current = ti;
        setStatus('idle');
        setSavedAt(note.updatedAt);
        setError(null);
      } catch (e) {
        setError('打开笔记失败：' + String(e));
      }
    },
    [flushPending]
  );

  // 首次进入：加载列表并打开第一篇
  useEffect(() => {
    void (async () => {
      try {
        const list = await window.notesApi.listNotes();
        setNotes(list);
        if (list.length) await openNote(list[0].id);
      } catch (e) {
        setError('读取笔记列表失败：' + String(e));
      }
    })();
  }, [openNote]);

  // 搜索：输入即过滤（200ms 防抖，避免每次按键都读盘）
  useEffect(() => {
    queryRef.current = query;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          setHits(await window.notesApi.searchNotes(q));
          setError(null);
        } catch (e) {
          setError('搜索失败：' + String(e));
        }
      })();
    }, 200);
    return () => window.clearTimeout(t);
  }, [query]);

  // 标签云：按出现次数排序
  const tagCloud = useMemo<TagCount[]>(() => {
    const map = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) map.set(t, (map.get(t) || 0) + 1);
    return Array.from(map, ([name, count]) => ({ name, count })).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [notes]);

  // 侧栏实际展示：搜索结果（或全部）再按标签筛选
  const listForSidebar = useMemo<NoteListItem[]>(() => {
    const base: NoteListItem[] = searching ? hits : notes;
    return activeTag ? base.filter((n) => n.tags.includes(activeTag)) : base;
  }, [searching, hits, notes, activeTag]);

  const emptyText = searching
    ? '没有找到匹配的笔记'
    : activeTag
      ? '该标签下没有笔记'
      : '还没有笔记，点右上角「新建」开始记录';

  const toggleTag = (tag: string) => setActiveTag((cur) => (cur === tag ? null : tag));

  // 新建笔记
  const handleCreate = async () => {
    await flushPending();
    try {
      const note = await window.notesApi.createNote('未命名笔记');
      await refreshList();
      setActiveId(note.id);
      setBody(note.body);
      bodyRef.current = note.body;
      setTagsInput('');
      tagsRef.current = '';
      setStatus('saved');
      setSavedAt(note.updatedAt);
      setError(null);
    } catch (e) {
      setError('新建失败：' + String(e));
    }
  };

  // 重命名：顶部标题内联编辑
  const startRename = () => {
    if (!activeId || !activeTitle) return;
    renameCancelled.current = false;
    setRenameValue(activeTitle);
    setRenaming(true);
  };

  const commitRename = async () => {
    if (committing.current) return;
    if (renameCancelled.current) {
      renameCancelled.current = false;
      setRenaming(false);
      return;
    }
    committing.current = true;
    try {
      const next = renameValue.trim();
      setRenaming(false);
      if (!activeId || !next || next === activeTitle) return;
      await flushPending();
      const note = await window.notesApi.renameNote({ id: activeId, title: next });
      setActiveId(note.id);
      setBody(note.body);
      bodyRef.current = note.body;
      const ti = note.tags.join(', ');
      setTagsInput(ti);
      tagsRef.current = ti;
      setStatus('saved');
      setSavedAt(note.updatedAt);
      await refreshList();
      setError(null);
    } catch (e) {
      setError('重命名失败：' + String(e));
    } finally {
      committing.current = false;
    }
  };

  // 删除笔记（弹窗确认后执行）
  const handleDelete = async () => {
    setConfirmOpen(false);
    if (!activeId) return;
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
    try {
      await window.notesApi.deleteNote(activeId);
      const list = await window.notesApi.listNotes();
      setNotes(list);
      if (list.length) {
        await openNote(list[0].id);
      } else {
        setActiveId(null);
        setBody('');
        bodyRef.current = '';
        setTagsInput('');
        tagsRef.current = '';
        setStatus('idle');
        setSavedAt(null);
      }
      setError(null);
    } catch (e) {
      setError('删除失败：' + String(e));
    }
  };

  // 导出 HTML：用同一套 react-markdown 渲染结果，交给主进程写文件
  const handleExport = async () => {
    setMenuOpen(false);
    if (!activeId) return;
    await flushPending();
    try {
      const html = renderToStaticMarkup(
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyRef.current}</ReactMarkdown>
      );
      const res = await window.notesApi.exportHtml({ id: activeId, title: activeTitle ?? '', html });
      setError(null);
      setNotice('已导出 exports/' + res.fileName);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setNotice(null);
      setError('导出失败：' + String(e));
    }
  };

  const statusText = status === 'saving' ? '保存中…' : savedAt ? '已保存 ' + formatTime(savedAt) : '未修改';

  return (
    <div className="h-screen flex flex-col bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-200">
      {/* 顶部栏：标题 / 搜索 / 状态与操作 */}
      <header className="h-12 shrink-0 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 px-4">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="text-sm font-semibold text-gray-500 shrink-0 dark:text-gray-400">极简笔记</span>
          <span className="text-gray-300 shrink-0 dark:text-gray-600">/</span>
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename();
                if (e.key === 'Escape') {
                  renameCancelled.current = true;
                  setRenaming(false);
                }
              }}
              onBlur={() => void commitRename()}
              className="w-52 px-2 py-1 text-sm border border-blue-400 rounded outline-none dark:bg-gray-800 dark:text-gray-100"
            />
          ) : (
            <button
              type="button"
              onClick={startRename}
              disabled={!activeId}
              title={activeId ? '点击重命名' : ''}
              className="flex items-center gap-1 min-w-0 text-sm font-medium hover:text-blue-600 disabled:text-gray-300 dark:hover:text-blue-400 dark:disabled:text-gray-600"
            >
              <span className="truncate max-w-[16rem]">{activeTitle ?? '未选择笔记'}</span>
              {activeId && <PencilIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
            </button>
          )}
        </div>

        <div className="flex-1 min-w-[9rem] max-w-md">
          <SearchBar value={query} onChange={setQuery} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {notice ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 max-w-[24vw] truncate" title={notice}>
              {notice}
            </span>
          ) : error ? (
            <span className="text-xs text-red-500 max-w-[24vw] truncate" title={error}>
              {error}
            </span>
          ) : (
            <span
              className={
                'text-xs px-2 py-1 rounded ' +
                (status === 'saving'
                  ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30'
                  : 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800')
              }
            >
              {statusText}
            </span>
          )}

          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            title={dark ? '切换到明亮主题' : '切换到暗色主题'}
            className="p-2 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {dark ? <SunIcon className="w-3.5 h-3.5" /> : <MoonIcon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => void handleCreate()}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            新建
          </button>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!activeId}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            删除
          </button>

          {/* 单篇笔记菜单 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={!activeId}
              title="更多操作"
              className="p-2 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <MoreIcon className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-40 py-1 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <DownloadIcon className="w-3.5 h-3.5" />
                    导出 HTML
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 三栏主体 */}
      <main className="flex-1 flex overflow-hidden">
        <aside className="w-64 shrink-0 flex flex-col border-r border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-800/40">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <NoteList
              notes={listForSidebar}
              activeId={activeId}
              onSelect={(id) => void openNote(id)}
              query={query}
              emptyText={emptyText}
            />
          </div>
          <TagBar tags={tagCloud} activeTag={activeTag} onToggle={toggleTag} />
        </aside>

        {activeId ? (
          <>
            <section className="flex-1 min-w-0 flex flex-col border-r border-gray-200 dark:border-gray-700">
              <div className="h-9 shrink-0 px-4 flex items-center gap-2 border-b border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-900">
                <TagIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  value={tagsInput}
                  onChange={(e) => handleTagsChange(e.target.value)}
                  placeholder="添加标签，用逗号分隔…"
                  className="flex-1 min-w-0 text-xs bg-transparent outline-none placeholder-gray-400 text-gray-600 dark:text-gray-300 dark:placeholder-gray-500"
                />
              </div>
              <EditorPane value={body} onChange={handleChange} />
            </section>
            <section className="flex-1 min-w-0 flex flex-col bg-gray-50/40 dark:bg-gray-800/40">
              <div className="h-9 shrink-0 px-4 flex items-center text-xs text-gray-400 border-b border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-900">
                预览
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PreviewPane content={body} />
              </div>
            </section>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            还没有笔记，点击右上角「新建」创建第一篇
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmOpen}
        title="删除这篇笔记？"
        message={activeTitle ? '「' + activeTitle + '」将被永久删除，无法恢复。' : undefined}
        confirmText="删除"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
