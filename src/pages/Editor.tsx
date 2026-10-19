import { useCallback, useEffect, useRef, useState } from 'react';
import NoteList from '../components/NoteList';
import EditorPane from '../components/EditorPane';
import PreviewPane from '../components/PreviewPane';
import ConfirmDialog from '../components/ConfirmDialog';
import { PencilIcon, PlusIcon, TrashIcon } from '../components/Icons';
import type { NoteMeta, SaveStatus } from '../types';

/** 状态栏时间：HH:MM */
function formatTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 三栏主界面：左侧笔记列表 / 中间编辑 / 右侧预览
export default function Editor() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<number | null>(null);
  const pending = useRef<{ id: string; body: string; tags: string[] } | null>(null);
  const tagsRef = useRef<string[]>([]);
  const renameCancelled = useRef(false);
  const committing = useRef(false);

  const activeTitle = notes.find((n) => n.id === activeId)?.title ?? null;

  // 仅刷新列表元数据，不触碰正在编辑的正文
  const refreshList = useCallback(async () => {
    setNotes(await window.notesApi.listNotes());
  }, []);

  // 立即把待保存内容写盘（切换/删除/重命名前调用）
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
  const handleChange = (value: string) => {
    if (!activeId) return;
    setBody(value);
    setStatus('saving');
    pending.current = { id: activeId, body: value, tags: tagsRef.current };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void flushPending();
    }, 1000);
  };

  // 打开某篇笔记（先落盘未保存内容）
  const openNote = useCallback(
    async (id: string) => {
      await flushPending();
      try {
        const note = await window.notesApi.readNote(id);
        setActiveId(note.id);
        setBody(note.body);
        tagsRef.current = note.tags;
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

  // 新建笔记
  const handleCreate = async () => {
    await flushPending();
    try {
      const note = await window.notesApi.createNote('未命名笔记');
      await refreshList();
      setActiveId(note.id);
      setBody(note.body);
      tagsRef.current = note.tags;
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
      tagsRef.current = note.tags;
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
        tagsRef.current = [];
        setStatus('idle');
        setSavedAt(null);
      }
      setError(null);
    } catch (e) {
      setError('删除失败：' + String(e));
    }
  };

  const statusText = status === 'saving' ? '保存中…' : savedAt ? '已保存 ' + formatTime(savedAt) : '未修改';

  return (
    <div className="h-screen flex flex-col bg-white text-gray-800">
      {/* 顶部栏：当前笔记标题 + 保存状态 + 操作按钮 */}
      <header className="h-12 shrink-0 border-b border-gray-200 flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-500 shrink-0">极简笔记</span>
          <span className="text-gray-300 shrink-0">/</span>
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
              className="w-56 px-2 py-1 text-sm border border-blue-400 rounded outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startRename}
              disabled={!activeId}
              title={activeId ? '点击重命名' : ''}
              className="flex items-center gap-1 min-w-0 text-sm font-medium hover:text-blue-600 disabled:text-gray-300"
            >
              <span className="truncate max-w-[38vw]">{activeTitle ?? '未选择笔记'}</span>
              {activeId && <PencilIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {error ? (
            <span className="text-xs text-red-500 max-w-[30vw] truncate" title={error}>
              {error}
            </span>
          ) : (
            <span
              className={
                'text-xs px-2 py-1 rounded ' +
                (status === 'saving' ? 'text-amber-600 bg-amber-50' : 'text-gray-500 bg-gray-100')
              }
            >
              {statusText}
            </span>
          )}
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
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      </header>

      {/* 三栏主体 */}
      <main className="flex-1 flex overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50/60">
          <NoteList notes={notes} activeId={activeId} onSelect={(id) => void openNote(id)} />
        </aside>

        {activeId ? (
          <>
            <section className="flex-1 min-w-0 flex flex-col border-r border-gray-200">
              <div className="h-8 shrink-0 px-4 flex items-center text-xs text-gray-400 border-b border-gray-100">
                编辑
              </div>
              <EditorPane value={body} onChange={handleChange} />
            </section>
            <section className="flex-1 min-w-0 flex flex-col bg-gray-50/40">
              <div className="h-8 shrink-0 px-4 flex items-center text-xs text-gray-400 border-b border-gray-100 bg-white">
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
