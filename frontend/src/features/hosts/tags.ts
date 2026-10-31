// Tags do host (specs/009, FR-916). O Go repete a validação.

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 32;
export const MAX_NOTES = 2000;

/** Tamanho em pontos de código, como o Go conta runas. */
export const runeCount = (text: string): number => Array.from(text).length;

export type TagError = 'duplicate' | 'tooLong' | 'limit';

/** Junta `raw` às tags; texto vazio não muda nada. */
export function addTag(tags: string[], raw: string): { tags: string[] } | { error: TagError } {
  const tag = raw.trim();
  if (!tag) return { tags };
  if (runeCount(tag) > MAX_TAG_LENGTH) return { error: 'tooLong' };
  if (tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return { error: 'duplicate' };
  if (tags.length >= MAX_TAGS) return { error: 'limit' };
  return { tags: [...tags, tag] };
}

/**
 * Texto digitado ou colado com vírgulas: cada parte antes da última vírgula vira tag e o que
 * vem depois fica no campo. Para na primeira recusada, que volta ao campo com o resto.
 */
export function splitTags(
  tags: string[],
  text: string,
): { tags: string[]; draft: string; error?: TagError } {
  const parts = text.split(',');
  const draft = parts.pop() ?? '';
  let current = tags;
  for (const [i, part] of parts.entries()) {
    const res = addTag(current, part);
    if ('error' in res)
      return { tags: current, draft: [...parts.slice(i), draft].join(','), error: res.error };
    current = res.tags;
  }
  return { tags: current, draft };
}
