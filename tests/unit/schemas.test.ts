import { describe, expect, it } from 'vitest';
import { itemNameList } from '@/lib/domain/schemas';

describe('itemNameList — the loot list the officer types', () => {
  const parse = (raw: string) => itemNameList.safeParse(raw);

  it('splits one item per line and trims each', () => {
    const result = parse('Force Blade\n  Chakra Ring  \nGuardian Boots');
    expect(result.success && result.data).toEqual(['Force Blade', 'Chakra Ring', 'Guardian Boots']);
  });

  it('keeps duplicates — two of the same item can drop in one night', () => {
    const result = parse('Force Blade\nForce Blade');
    expect(result.success && result.data).toEqual(['Force Blade', 'Force Blade']);
  });

  it('drops blank lines rather than rejecting them', () => {
    // A trailing newline is how a list ends, not a mistake worth an error message.
    const result = parse('Force Blade\n\n\nChakra Ring\n');
    expect(result.success && result.data).toEqual(['Force Blade', 'Chakra Ring']);
  });

  it('handles the CRLF a Windows paste brings with it', () => {
    const result = parse('Force Blade\r\nChakra Ring');
    expect(result.success && result.data).toEqual(['Force Blade', 'Chakra Ring']);
  });

  it('rejects a list with nothing in it', () => {
    const result = parse('   \n \n');
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe('Enter at least one item.');
  });

  it('rejects an item name past the column limit', () => {
    const result = parse('x'.repeat(121));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toContain('120 characters');
  });

  it('rejects a paste too large to be one night of loot', () => {
    const result = parse(Array.from({ length: 51 }, (_, i) => `Item ${i}`).join('\n'));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      'Add at most 50 items at a time.',
    );
  });
});
