import { CloseIcon, SearchIcon } from './Icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

// 顶部全文搜索框：输入即触发（由上层做防抖）
export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative flex items-center">
      <SearchIcon className="w-4 h-4 absolute left-2.5 text-gray-400 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索标题和正文…"
        className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md border border-gray-200 bg-gray-50 outline-none focus:border-blue-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 dark:focus:bg-gray-800"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="清空搜索"
          className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
