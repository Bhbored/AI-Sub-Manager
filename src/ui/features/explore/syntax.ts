import { parse as parseToml } from 'smol-toml';
import type { ExploreDocument } from '../../../shared/contracts.js';

export function syntaxError(language: ExploreDocument['language'], text: string) {
  try {
    if (language === 'json') {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Expected a JSON object.';
    } else if (language === 'toml') parseToml(text);
    return '';
  } catch (error) { return (error as Error).message; }
}
