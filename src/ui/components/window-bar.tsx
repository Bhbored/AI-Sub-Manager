import { Copy, Minus, PanelTop, Pin, Square, X } from 'lucide-react';
import mark from '../../../assets/icon.svg';
import type { WindowMode } from '../../shared/contracts.js';
import { IconButton } from './controls.js';

export function WindowBar({ mode, cornerPinAvailable, onMode, onMinimize, onClose }: {
  mode: WindowMode;
  cornerPinAvailable: boolean;
  onMode(mode: WindowMode): void;
  onMinimize(): void;
  onClose(): void;
}) {
  const expanded = mode === 'expanded';
  const widget = mode === 'widget';
  const draggable = !widget || !cornerPinAvailable;
  return <header className={'sticky top-0 z-20 flex min-h-13 items-center justify-between gap-2 border-b border-edge bg-background px-3' +
    (draggable ? ' window-drag' : '')}>
    <div className="flex min-w-0 items-center gap-2">
      <img src={mark} alt="" width="28" height="28" className="shrink-0"/>
      <span className="truncate text-xs font-semibold tracking-wide">AI Usage Monitor</span>
    </div>
    <div className="flex shrink-0 items-center gap-1" aria-label="Window controls" role="group">
      {!widget && <IconButton aria-label="Desktop widget" className="chrome-button" onClick={() => onMode('widget')}><Pin size={16}/></IconButton>}
      <IconButton aria-label={widget ? 'Open dashboard' : expanded ? 'Restore compact view' : 'Maximize window'}
        className="chrome-button" onClick={() => onMode(mode === 'compact' ? 'expanded' : 'compact')}>
        {widget ? <PanelTop size={16}/> : expanded ? <Copy size={14}/> : <Square size={14}/>}
      </IconButton>
      <IconButton aria-label="Minimize window" className="chrome-button" onClick={onMinimize}><Minus size={16}/></IconButton>
      <IconButton aria-label="Close window" className="chrome-button chrome-close" onClick={onClose}><X size={17}/></IconButton>
    </div>
  </header>;
}
