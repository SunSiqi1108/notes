import { TagIcon } from './Icons';

export interface TagCount {
  name: string;
  count: number;
}

interface Props {
  tags: TagCount[];
  activeTag: string | null;
  onToggle: (tag: string) => void;
}

// 左侧栏底部标签云：点击筛选，再点一次取消
export default function TagBar({ tags, activeTag, onToggle }: Props) {
  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <TagIcon className="w-3.5 h-3.5" />
          标签云
        </span>
        {activeTag && (
          <button
            type="button"
            onClick={() => onToggle(activeTag)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            取消筛选
          </button>
        )}
      </div>
      {tags.length === 0 ? (
        <p className="text-xs text-gray-400">还没有标签，在编辑区顶部添加</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const active = t.name === activeTag;
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => onToggle(t.name)}
                title={active ? '再点一次取消筛选' : '只看该标签的笔记'}
                className={
                  'px-2 py-0.5 rounded-full text-xs transition-colors ' +
                  (active
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700')
                }
              >
                {t.name}
                <span className="ml-1 opacity-60">{t.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
