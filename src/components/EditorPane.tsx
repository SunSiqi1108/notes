interface Props {
  value: string;
  onChange: (value: string) => void;
}

// 中间编辑区：Markdown 源码输入
export default function EditorPane({ value, onChange }: Props) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      placeholder="用 Markdown 记录你的想法…"
      className="flex-1 min-h-0 w-full resize-none outline-none p-5 bg-white font-mono text-[13px] leading-6 text-gray-800"
    />
  );
}
