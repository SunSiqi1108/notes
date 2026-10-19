import type { NoteMeta } from '../types';

interface Props {
  notes: NoteMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
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

// 左侧笔记列表：标题 + 更新时间 + 标签
export default function NoteList({ notes, activeId, onSelect }: Props) {
  if (notes.length === 0) {
    return <p className="text-sm text-gray-400 px-3 py-6">还没有笔记，点右上角「新建」开始记录</p>;
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
                (active ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700')
              }
            >
              <span className="block text-sm font-medium truncate">{n.title}</span>
              <span className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">{formatTime(n.updatedAt)}</span>
                {n.tags.map((t) => (
                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
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
