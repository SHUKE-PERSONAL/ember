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

function emailChangeMessage(link: string) {
  return [
    'You requested an email change for your Ember account.',
    '',
    'Confirm your new email address by opening this link:',
    link,
    '',
    'This link expires in 24 hours.',
  ].join('\n');
}

async function sendMail(
  to: string,
  subject: string,
  text: string,
  link: string,
  logLabel: string,
): Promise<ActivationEmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new ActivationEmailUnavailableError();
    }
    console.info(`[ember] ${logLabel} link for ${to}: ${link}`);
    return 'logged';
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM,
      to: [to],
      subject,
      text,
    });
    if (error) throw new ActivationEmailUnavailableError();
  } catch (error) {
    if (error instanceof ActivationEmailUnavailableError) throw error;
    throw new ActivationEmailUnavailableError();
  }

  return 'sent';
}

export function sendActivationEmail(to: string, link: string): Promise<ActivationEmailDelivery> {
  return sendMail(
    to,
    'Activate your Ember account',
    activationMessage(link),
    link,
    'activation',
  );
}

export function sendEmailChangeEmail(to: string, link: string): Promise<ActivationEmailDelivery> {
  return sendMail(
    to,
    'Confirm your Ember email change',
    emailChangeMessage(link),
    link,
    'email change',
  );
}
