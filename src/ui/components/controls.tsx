import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={'my-3 rounded-xl border border-edge bg-panel p-4 ' + className} {...props}/>;
}

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={'cursor-pointer rounded-md border border-edge bg-field px-3 py-2 text-xs text-foreground hover:border-accent disabled:cursor-default disabled:opacity-50 ' + className} {...props}/>;
}

export function IconButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button className={'grid size-9 shrink-0 place-items-center p-0 text-muted hover:text-accent ' + className} {...props}/>;
}

export function Field({ title, children }: { title: string; children: ReactNode }) {
  return <label className="block text-xs text-muted">{title}{children}</label>;
}

export function Toggle({ title, checked, onChange }: { title: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="flex items-center justify-between gap-3 py-1 text-xs text-muted">
    <span>{title}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="size-4 shrink-0 accent-accent"/>
  </label>;
}
