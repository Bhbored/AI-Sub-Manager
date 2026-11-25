import { AudioWaveform, Terminal } from 'lucide-react';
import type { ProviderId } from '../../shared/contracts.js';

export function ProviderMark({ id }: { id: ProviderId }) {
  const Icon = id === 'codex' ? Terminal : AudioWaveform;
  return <span aria-hidden="true" className={'grid size-9 shrink-0 place-items-center rounded-lg border bg-field [&>svg]:block ' +
    (id === 'codex' ? 'border-accent/25 text-accent' : 'border-warning/25 text-warning')}>
    <Icon size={17} strokeWidth={1.8}/>
  </span>;
}
