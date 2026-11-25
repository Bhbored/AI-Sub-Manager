import { Maximize2, Minus, PanelTop, Pin, X } from 'lucide-react';
import mark from '../../../assets/icon.svg';
import type { WindowMode } from '../../shared/contracts.js';
import { IconButton } from './controls.js';

export function WindowBar({ mode, onMode, onMinimize, onClose }: {
  mode: WindowMode;
  onMode(mode: WindowMode): void;
  onMinimize(): void;
  onClose(): void;
}) {
  const fullscreen = mode === 'fullscreen';
  const widget = mode === 'widget';
  return <header className="window-drag sticky top-0 z-20 flex min-h-13 items-center justify-between gap-2 border-b border-edge bg-background px-3">
    <div className="flex min-w-0 items-center gap-2">
      <img src={mark} alt="" width="28" height="28" className="shrink-0"/>
      <span className="truncate text-xs font-semibold tracking-wide">AI Usage Monitor</span>
    </div>
    <div className="flex shrink-0 items-center gap-1" aria-label="Window controls" role="group">
      {!widget && <IconButton aria-label="Desktop widget" className="chrome-button" onClick={() => onMode('widget')}><Pin size={16}/></IconButton>}
      <IconButton aria-label={widget ? 'Open dashboard' : fullscreen ? 'Exit full screen' : 'Full screen'}
        className="chrome-button" onClick={() => onMode(mode === 'compact' ? 'fullscreen' : 'compact')}>
        {widget || fullscreen ? <PanelTop size={16}/> : <Maximize2 size={16}/>}
      </IconButton>
      {!fullscreen && <IconButton aria-label="Minimize window" className="chrome-button" onClick={onMinimize}><Minus size={16}/></IconButton>}
      <IconButton aria-label="Close window" className="chrome-button chrome-close" onClick={onClose}><X size={17}/></IconButton>
    </div>
  </header>;
}
