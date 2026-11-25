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
  const bottom = area.y + area.height - height - insetY;
  if (mode === 'widget') return { x: right, y: area.y + insetY, width, height };
  const centerX = Math.round(area.x + (area.width - width) / 2);
  const centerY = Math.round(area.y + (area.height - height) / 2);
  return {
    x: Math.min(right, Math.max(area.x + insetX, previous?.x ?? centerX)),
    y: Math.min(bottom, Math.max(area.y + insetY, previous?.y ?? centerY)),
    width, height
  };
}

export function supportsCornerPin(platform: NodeJS.Platform, session: string | undefined, ozone: string) {
  return platform !== 'linux' || ozone === 'x11' || (ozone !== 'wayland' && session?.toLowerCase() !== 'wayland');
}
