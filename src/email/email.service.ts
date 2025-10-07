import { google } from 'googleapis';
import 'dotenv/config';
import { IUser } from '../user/user.model';
import { getWelcomeEmailHTML } from './templates/welcome.template';

/**
 * Sends an email using the Gmail REST API with OAuth2.
 * This avoids SMTP port blocking on platforms like Render.
 */
const sendViaGmailAPI = async (to: string, subject: string, html: string) => {
  const { EMAIL_USER, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN } = process.env;

  if (!EMAIL_USER || !OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
    console.error('FATAL ERROR: Email OAuth2 environment variables are not fully configured.');
    throw new Error('Email service is not configured.');
  }

  const oauth2Client = new google.auth.OAuth2(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' // Redirect URL
  );

  oauth2Client.setCredentials({
    refresh_token: OAUTH_REFRESH_TOKEN,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // The email needs to be RFC 2822 formatted and base64url encoded
  const emailLines = [
    `From: "Sagenex Admin" <${EMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ];
  const email = emailLines.join('\r\n');

  const raw = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
    },
  });

  return result.data.id;
};

/**
 * Sends a welcome email to a newly onboarded user.
 * @param user The user object containing details like fullName and email.
 * @param originalSponsorId The sponsor ID or referral code used during sign-up.
 */
export const sendWelcomeEmail = async (user: IUser, originalSponsorId?: string): Promise<void> => {
  try {
    console.log(`Attempting to send welcome email to ${user.email} via Gmail API...`);
    const messageId = await sendViaGmailAPI(
      user.email,
      'Welcome to Sagenex!',
      getWelcomeEmailHTML(user, originalSponsorId)
    );
    console.log('Email sent successfully! Message ID: %s', messageId);
  } catch (error: any) {
    console.error('--- DETAILED ERROR SENDING EMAIL VIA GMAIL API ---');
    // Google API errors are often in the `errors` property
    if (error.response && error.response.data) {
        console.error(error.response.data);
    } else {
        console.error(error);
    }
    console.error('----------------------------------------------------');
  }
};