// 笔记相关的类型定义
export interface NoteMeta {
  /** 文件名（含 .md），同时作为笔记 id */
  id: string;
  title: string;
  updatedAt: number;
  tags: string[];
}

export interface Note extends NoteMeta {
  /** 正文（不含 front-matter） */
  body: string;
}

/** 搜索命中结果：片段用于列表回显与高亮 */
export interface SearchHit extends NoteMeta {
  titleHit: boolean;
  bodyHit: boolean;
  snippet: string;
}

export interface ExportResult {
  ok: boolean;
  fileName: string;
  file: string;
}

export type SaveStatus = 'idle' | 'saving' | 'saved';

export interface WritePayload {
  id: string;
  body: string;
  tags: string[];
}

export interface NotesApi {
  listNotes(): Promise<NoteMeta[]>;
  readNote(id: string): Promise<Note>;
  writeNote(payload: WritePayload): Promise<NoteMeta>;
  createNote(title: string): Promise<Note>;
  deleteNote(id: string): Promise<{ ok: boolean }>;
  renameNote(payload: { id: string; title: string }): Promise<Note>;
  searchNotes(query: string): Promise<SearchHit[]>;
  exportHtml(payload: { id: string; title: string; html: string }): Promise<ExportResult>;
}

declare global {
  interface Window {
    notesApi: NotesApi;
  }
}
