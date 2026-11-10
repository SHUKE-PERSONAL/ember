import { afterEach, describe, expect, it, vi } from 'vitest';

const resendSend = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: vi.fn(function MockResend() {
    return { emails: { send: resendSend } };
  }),
}));

import {
  ActivationEmailUnavailableError,
  sendActivationEmail,
  sendEmailChangeEmail,
} from './index.js';

describe('sendActivationEmail', () => {
  afterEach(() => {
    resendSend.mockReset();
    vi.restoreAllMocks();
  });

  it('logs the activation link and reports logged delivery without a Resend key', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = 'development';
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});

    try {
      await expect(sendActivationEmail('reader@example.com', 'http://localhost/activate?token=raw'))
        .resolves.toBe('logged');
      expect(log).toHaveBeenCalledWith(
        '[ember] activation link for reader@example.com: http://localhost/activate?token=raw',
      );
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('fails closed without logging a raw link for a missing or blank production key', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';

    try {
      for (const apiKey of [undefined, '   ']) {
        if (apiKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = apiKey;

        await expect(sendActivationEmail('reader@example.com', 'http://localhost/activate?token=raw'))
          .rejects.toBeInstanceOf(ActivationEmailUnavailableError);
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('reports sent delivery when Resend accepts the message', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'resend-test-key';
    resendSend.mockResolvedValueOnce({ data: { id: 'email-id' }, error: null });

    try {
      await expect(sendActivationEmail('reader@example.com', 'http://localhost/activate?token=raw'))
        .resolves.toBe('sent');
      expect(resendSend).toHaveBeenCalledWith({
        from: 'noreply@mail.shukelabs.com',
        to: ['reader@example.com'],
        subject: 'Activate your Ember account',
        text: expect.stringContaining('http://localhost/activate?token=raw'),
      });
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
    }
  });

  it('maps Resend errors and rejected requests to the safe unavailable error', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'resend-test-key';

    try {
      resendSend.mockResolvedValueOnce({ data: null, error: { message: 'provider rejected it' } });
      await expect(sendActivationEmail('reader@example.com', 'http://localhost/activate?token=raw'))
        .rejects.toEqual(new ActivationEmailUnavailableError());

      resendSend.mockRejectedValueOnce(new Error('provider request failed'));
      await expect(sendActivationEmail('reader@example.com', 'http://localhost/activate?token=raw'))
        .rejects.toEqual(new ActivationEmailUnavailableError());
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
    }
  });

  it('uses the shared delivery path for email-change confirmation mail', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'resend-test-key';
    resendSend.mockResolvedValueOnce({ data: { id: 'email-change-id' }, error: null });

    try {
      await expect(sendEmailChangeEmail(
        'new-reader@example.com',
        'http://localhost/confirm-email-change?token=raw',
      )).resolves.toBe('sent');
      expect(resendSend).toHaveBeenCalledWith({
        from: 'noreply@mail.shukelabs.com',
        to: ['new-reader@example.com'],
        subject: 'Confirm your Ember email change',
        text: expect.stringContaining('http://localhost/confirm-email-change?token=raw'),
      });
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
    }
  });
});
