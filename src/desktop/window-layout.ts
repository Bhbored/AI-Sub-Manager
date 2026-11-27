import type { Rectangle } from 'electron';

const sizes = {
  compact: { width: 422, height: 704 },
  widget: { width: 340, height: 332 }
};
const margin = 16;

export function layoutBounds(mode: keyof typeof sizes, area: Rectangle, previous?: Rectangle): Rectangle {
  const insetX = Math.min(margin, Math.max(0, Math.floor((area.width - 1) / 2)));
  const insetY = Math.min(margin, Math.max(0, Math.floor((area.height - 1) / 2)));
  const width = Math.min(sizes[mode].width, area.width - 2 * insetX);
  const height = Math.min(sizes[mode].height, area.height - 2 * insetY);
  const right = area.x + area.width - width - insetX;
  if (mode === 'widget') return { x: right, y: area.y + insetY, width, height };
  if (previous) return {
    x: Math.min(area.x + area.width - width, Math.max(area.x, previous.x)),
    y: Math.min(area.y + area.height - height, Math.max(area.y, previous.y)),
    width, height
  };
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width, height
  };
}

export function supportsCornerPin(platform: NodeJS.Platform, session: string | undefined, ozone: string) {
  return platform !== 'linux' || ozone === 'x11' || (ozone !== 'wayland' && session?.toLowerCase() !== 'wayland');
}

export function useXWaylandForPinning(platform: NodeJS.Platform, session: string | undefined, display: string | undefined, ozone: string) {
  return platform === 'linux' && session?.toLowerCase() === 'wayland' && Boolean(display) && !ozone;
}
