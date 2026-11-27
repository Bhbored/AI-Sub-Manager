import { useEffect, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { linter } from '@codemirror/lint';
import ReactMarkdown from 'react-markdown';
import type { ExploreDocument } from '../../../shared/contracts.js';
import { Button } from '../../components/controls.js';
import { syntaxError } from './syntax.js';

const theme = EditorView.theme({
  '&': { color: '#e6edf3', backgroundColor: '#101820', minHeight: '16rem' },
  '.cm-scroller': { overflow: 'auto', maxHeight: '60vh' },
  '.cm-gutters': { backgroundColor: '#101820', color: '#a3b1bf', border: 'none' },
  '.cm-activeLineGutter, .cm-activeLine': { backgroundColor: '#263443' },
  '.cm-cursor': { borderLeftColor: '#dbeafe' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#36516b' }
}, { dark: true });

interface Props {
  document: ExploreDocument;
  draft: string;
  change: (text: string) => void;
  save: () => void;
  reload: () => void;
  close: () => void;
  saving: boolean;
  error: string;
}

export default function DocumentEditor({ document, draft, change, save, reload, close, saving, error }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const onChange = useRef(change);
  onChange.current = change;
  const validation = syntaxError(document.language, draft);
  const dirty = document.text !== draft;
  useEffect(() => {
    if (!host.current) return;
    const language = document.language === 'json' ? [json(), linter(jsonParseLinter())] :
      document.language === 'markdown' ? [markdown()] : [StreamLanguage.define(toml)];
    const view = new EditorView({
      doc: draft,
      parent: host.current,
      extensions: [basicSetup, theme, ...language, EditorView.editable.of(document.writable),
        EditorView.contentAttributes.of({ 'aria-label': document.label }),
        EditorView.updateListener.of(update => { if (update.docChanged) onChange.current(update.state.doc.toString()); })]
    });
    editor.current = view;
    if (document.revealLine && document.revealLine <= view.state.doc.lines) {
      const pos = view.state.doc.line(document.revealLine).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
    }
    return () => { editor.current = null; view.destroy(); };
  }, [document.label, document.language, document.writable]);
  useEffect(() => {
    const view = editor.current;
    if (view && draft !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: draft } });
    }
  }, [draft]);

  return <section className="min-w-0 rounded-xl border border-edge bg-panel" aria-label="File editor"
    onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !validation && !saving && document.writable) save();
      }
    }}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge p-3">
      <div className="min-w-0">
        <h2 className="break-words text-sm font-semibold">{document.label}</h2>
        <p className="text-xs text-muted">{document.writable ? dirty ? 'Unsaved changes' : 'Saved' : 'Read-only'}</p>
      </div>
      <Button onClick={close} disabled={saving}>Close editor</Button>
    </header>
    <div ref={host}/>
    <div className="flex flex-wrap gap-2 border-t border-edge p-3">
      {document.writable && <>
        <Button onClick={save} disabled={!dirty || Boolean(validation) || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        <Button onClick={() => change(document.text)} disabled={!dirty || saving}>Revert</Button>
      </>}
      <Button onClick={reload} disabled={saving}>Reload from disk</Button>
      {dirty && error && <Button onClick={() => { void navigator.clipboard.writeText(draft).catch(() => {
        const view = editor.current;
        if (view) { view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); view.focus(); }
      }); }}>Copy draft</Button>}
      {(error || validation) && <p role="status" className="basis-full break-words text-xs text-warning">{error || validation}</p>}
    </div>
    {document.language === 'markdown' && <div className="max-h-80 overflow-auto border-t border-edge p-4 text-sm leading-relaxed [overflow-wrap:anywhere] [&_a]:text-accent [&_h1]:text-lg [&_h2]:font-bold [&_p]:my-2 [&_pre]:overflow-auto [&_pre]:bg-field [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5">
      <h3 className="text-xs font-semibold text-muted">Markdown preview</h3>
      <ReactMarkdown skipHtml components={{ img: ({ alt }) => <span>{alt ?? ''}</span>, a: ({ children }) => <span>{children}</span> }}>{draft}</ReactMarkdown>
    </div>}
    {document.language === 'json' && !validation && <details className="border-t border-edge p-3 text-xs">
      <summary className="cursor-pointer text-muted">Formatted JSON</summary>
      <pre className="mt-2 max-h-64 overflow-auto">{JSON.stringify(JSON.parse(draft), null, 2)}</pre>
    </details>}
  </section>;
}
