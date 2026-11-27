import type { ProviderId } from '../../shared/contracts.js';
import codexMark from '../../../assets/providers/codex.png';
import claudeMark from '../../../assets/providers/claude.png';

const providerMarks: Record<ProviderId, string> = {
  codex: codexMark,
  claude: claudeMark
};

export function ProviderMark({ id }: { id: ProviderId }) {
  return <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-edge bg-field">
    <img src={providerMarks[id]} alt="" className="block size-8 object-contain"/>
  </span>;
}
