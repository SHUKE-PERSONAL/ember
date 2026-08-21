import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendActivationEmail } from './index.js';

describe('sendActivationEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the activation link and does not throw without a Resend key', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});

    try {
      await expect(sendActivationEmail('reader@example.com', 'http://localhost/activate?token=raw'))
        .resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith(
        '[ember] activation link for reader@example.com: http://localhost/activate?token=raw',
      );
    } finally {
      log.mockRestore();
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
    }
  });
});
