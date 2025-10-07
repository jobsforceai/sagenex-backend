import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import 'dotenv/config';
import { IUser } from '../user/user.model';
import { getWelcomeEmailHTML } from './templates/welcome.template';

const OAuth2 = google.auth.OAuth2;

let transporter: nodemailer.Transporter | null = null;

/**
 * Initializes the Nodemailer transporter with Google OAuth2.
 */
const initializeTransporter = async () => {
  const { EMAIL_USER, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN } = process.env;

  if (!EMAIL_USER || !OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
    console.error('FATAL ERROR: Email OAuth2 environment variables are not fully configured.');
    return;
  }

  try {
    console.log('Initializing Google OAuth2 for email...');
    const oauth2Client = new OAuth2(
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground' // Redirect URL
    );

    oauth2Client.setCredentials({
      refresh_token: OAUTH_REFRESH_TOKEN,
    });

    // Get a new access token
    const accessToken = await oauth2Client.getAccessToken();

    if (!accessToken.token) {
        throw new Error('Failed to create access token.');
    }

    console.log('Successfully created access token. Configuring Nodemailer transporter...');

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: EMAIL_USER,
        clientId: OAUTH_CLIENT_ID,
        clientSecret: OAUTH_CLIENT_SECRET,
        refreshToken: OAUTH_REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    console.log('Nodemailer transporter initialized successfully.');

  } catch (error) {
    console.error('--- FAILED TO INITIALIZE NODEMAILER TRANSPORTER ---');
    console.error(error);
    console.error('----------------------------------------------------');
  }
};

// Initialize the transporter when the service is loaded
initializeTransporter();

/**
 * Sends a welcome email to a newly onboarded user using Nodemailer with OAuth2.
 * @param user The user object containing details like fullName and email.
 * @param originalSponsorId The sponsor ID or referral code used during sign-up.
 */
export const sendWelcomeEmail = async (user: IUser, originalSponsorId?: string): Promise<void> => {
  if (!transporter) {
    console.error('Email transporter is not initialized. Cannot send welcome email.');
    return;
  }

  const mailOptions = {
    from: `"Sagenex Admin" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: 'Welcome to Sagenex!',
    html: getWelcomeEmailHTML(user, originalSponsorId),
  };

  try {
    console.log(`Attempting to send welcome email to ${user.email} via Gmail...`);
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully! Message ID: %s', info.messageId);
  } catch (error) {
    console.error('--- DETAILED ERROR SENDING EMAIL VIA GMAIL OAUTH ---');
    console.error(error);
    console.error('----------------------------------------------------');
  }
};
