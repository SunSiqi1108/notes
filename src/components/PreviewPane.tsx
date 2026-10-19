import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

// 右侧实时预览：react-markdown + remark-gfm 渲染
export default function PreviewPane({ content }: Props) {
  return (
    <div className="markdown-body p-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
