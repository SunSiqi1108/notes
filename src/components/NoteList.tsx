import type { ReactNode } from 'react';
import type { NoteMeta } from '../types';

export interface NoteListItem extends NoteMeta {
  /** 搜索命中时的正文片段 */
  snippet?: string;
}

interface Props {
  notes: NoteListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** 搜索关键词，用于列表内高亮 */
  query?: string;
  emptyText?: string;
}

/** 列表里的时间：今天只显示时分，更早显示月-日 时分 */
function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm;
}

// 把命中的关键词包成高亮块
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let key = 0;
  for (;;) {
    const idx = lower.indexOf(q, from);
    if (idx < 0) {
      parts.push(text.slice(from));
      break;
    }
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark key={key++} className="rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    from = idx + q.length;
  }
  return <>{parts}</>;
}

// 左侧笔记列表：标题 + 更新时间 + 标签，搜索时回显命中片段
export default function NoteList({ notes, activeId, onSelect, query = '', emptyText }: Props) {
  if (notes.length === 0) {
    return <p className="text-sm text-gray-400 px-3 py-6">{emptyText || '还没有笔记，点右上角「新建」开始记录'}</p>;
  }

  return (
    <ul className="p-2 space-y-1">
      {notes.map((n) => {
        const active = n.id === activeId;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelect(n.id)}
              className={
                'w-full text-left rounded-md px-3 py-2 transition-colors ' +
                (active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300')
              }
            >
              <span className="block text-sm font-medium truncate">
                <Highlight text={n.title} query={query} />
              </span>
              {query && n.snippet ? (
                <span className="block mt-1 text-xs text-gray-400 line-clamp-2 dark:text-gray-500">
                  <Highlight text={n.snippet} query={query} />
                </span>
              ) : null}
              <span className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">{formatTime(n.updatedAt)}</span>
                {n.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  >
                    {t}
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
