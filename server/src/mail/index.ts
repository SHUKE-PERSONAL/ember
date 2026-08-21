import { Resend } from 'resend';

const DEFAULT_MAIL_FROM = 'noreply@mail.shukelabs.com';

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

export async function sendActivationEmail(to: string, link: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info(`[ember] activation link for ${to}: ${link}`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM,
    to: [to],
    subject: 'Activate your Ember account',
    text: activationMessage(link),
  });
  if (error) throw new Error(`activation email failed: ${error.message}`);
}
