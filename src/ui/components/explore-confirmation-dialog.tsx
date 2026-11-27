import { useEffect, useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ExploreConfirmation } from '../../shared/contracts.js';
import { Button } from './controls.js';

export function ExploreConfirmationDialog({ request, answer }: {
  request: ExploreConfirmation;
  answer(confirmed: boolean): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const answered = useRef(false);
  const title = useId();
  const detail = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => element?.close();
  }, []);

  function submit(confirmed: boolean) {
    if (answered.current) return;
    answered.current = true;
    answer(confirmed);
  }

  return <dialog ref={dialog} aria-labelledby={title} aria-describedby={detail}
    onCancel={event => { event.preventDefault(); submit(false); }}
    className="fixed inset-0 m-auto max-h-[calc(100%_-_2rem)] w-[calc(100%_-_2rem)] max-w-sm overflow-auto rounded-xl border border-edge bg-panel p-5 text-foreground shadow-2xl backdrop:bg-background/80">
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning"><Trash2 size={17} aria-hidden="true"/></span>
      <div className="min-w-0">
        <h2 id={title} className="break-words text-base font-semibold">{request.message}</h2>
        <p id={detail} className="mt-2 break-words text-sm leading-relaxed text-muted">{request.detail}</p>
      </div>
    </div>
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button onClick={() => submit(false)}>Cancel</Button>
      <Button className="border-warning/40 bg-warning/10 text-warning hover:border-warning hover:bg-warning/20"
        onClick={() => submit(true)}>Remove</Button>
    </div>
  </dialog>;
}

export function ExploreConfirmationHost({ onError }: { onError(error: unknown): void }) {
  const [request, setRequest] = useState<ExploreConfirmation>();
  useEffect(() => window.monitor.onExploreConfirmation(setRequest), []);

  return request && <ExploreConfirmationDialog key={request.id} request={request} answer={confirmed => {
    setRequest(undefined);
    void window.monitor.answerExploreConfirmation(request.id, confirmed).catch(onError);
  }}/>;
}
