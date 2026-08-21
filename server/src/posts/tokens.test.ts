import { describe, expect, it } from 'vitest';
import { extractPostTokens, postHasTopic } from './tokens.js';

describe('post token parsing', () => {
  it('extracts mentions and topics while excluding email addresses', () => {
    expect(extractPostTokens('Hi @Ada, #Ember! email ada@example.com #news.')).toEqual([
      { type: 'mention', value: 'Ada' },
      { type: 'topic', value: 'Ember' },
      { type: 'topic', value: 'news' },
    ]);
  });

  it('matches topics case-insensitively and ignores partial words', () => {
    expect(postHasTopic('A #Ember post', 'ember')).toBe(true);
    expect(postHasTopic('An #embers post', 'ember')).toBe(false);
    expect(postHasTopic('An email at a#ember.example', 'ember')).toBe(false);
  });
});
