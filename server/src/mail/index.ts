import { Resend } from 'resend';

const DEFAULT_MAIL_FROM = 'noreply@mail.shukelabs.com';

export type ActivationEmailDelivery = 'sent' | 'logged';

export class ActivationEmailUnavailableError extends Error {
  constructor() {
    super('activation email unavailable');
    this.name = 'ActivationEmailUnavailableError';
  }
}

function activationMessage(link: string) {
  return [
    'Welcome to Ember.',
    '',
    'Activate your email address by opening this link:',
    link,
    '',
    'This link expires in 24 hours.',
  ].join('\n');
}

export async function sendActivationEmail(to: string, link: string): Promise<ActivationEmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new ActivationEmailUnavailableError();
    }
    console.info(`[ember] activation link for ${to}: ${link}`);
    return 'logged';
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM,
      to: [to],
      subject: 'Activate your Ember account',
      text: activationMessage(link),
    });
    if (error) throw new ActivationEmailUnavailableError();
  } catch (error) {
    if (error instanceof ActivationEmailUnavailableError) throw error;
    throw new ActivationEmailUnavailableError();
  }

  return 'sent';
}
