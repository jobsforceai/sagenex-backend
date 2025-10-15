// src/services/email/gmail.ts
import { google } from 'googleapis';
import 'dotenv/config';
import type { IUser } from '../user/user.model';
import { getWelcomeEmailHTML } from './templates/welcome.template';
import { getTransferOtpEmailHTML } from './templates/transfer-otp.template';
import { generateOtpEmailTemplate } from './templates/email-otp.template';

// Optional Redis cache (recommended). If you already have a Redis client elsewhere, import and reuse it.
import Redis from 'ioredis';

const {
  EMAIL_USER,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REFRESH_TOKEN,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  REDIS_URL, // support single-URL style too
} = process.env;

if (!EMAIL_USER || !OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
  throw new Error(
    'Email OAuth2 env vars missing: EMAIL_USER, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN'
  );
}

const oauth2Client = new google.auth.OAuth2(
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

// Will always include refresh_token so Google can rotate access tokens silently
oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });

// ---- Access token cache (Redis preferred, in-memory fallback) ----
const ACCESS_TOKEN_CACHE_KEY = 'gmail:access_token';
const ACCESS_TOKEN_TTL_SECONDS = 55 * 60; // cache ~55 min (token lasts ~60 min)

let memoryCache: { token: string; expiresAt: number } | null = null;

const redis =
  REDIS_URL
    ? new Redis(REDIS_URL)
    : (REDIS_HOST
        ? new Redis({
            host: REDIS_HOST,
            port: REDIS_PORT ? Number(REDIS_PORT) : 6379,
            username: REDIS_USERNAME,
            password: REDIS_PASSWORD,
            // optional TLS if you use Redis Cloud:
            // tls: { rejectUnauthorized: false },
          })
        : null);

async function getCachedAccessToken(): Promise<string> {
  // 1) Try Redis
  if (redis) {
    const cached = await redis.get(ACCESS_TOKEN_CACHE_KEY);
    if (cached) return cached;
  } else {
    // 2) In-memory fallback
    const now = Date.now();
    if (memoryCache && memoryCache.expiresAt > now) {
      return memoryCache.token;
    }
  }

  // 3) Fetch fresh access token via refresh token
  try {
    const { token } = await oauth2Client.getAccessToken();
    if (!token) throw new Error('No access token returned by Google');

    if (redis) {
      await redis.set(ACCESS_TOKEN_CACHE_KEY, token, 'EX', ACCESS_TOKEN_TTL_SECONDS);
    } else {
      memoryCache = {
        token,
        expiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
      };
    }
    return token;
  } catch (err: any) {
    // If refresh token is bad, Google throws invalid_grant here
    if (err?.response?.data?.error === 'invalid_grant') {
      console.error('Gmail refresh token is invalid/expired/revoked. Re-mint a new refresh token.');
    }
    throw err;
  }
}

// ---- Core sender using Gmail REST API ----
const sendViaGmailAPI = async (to: string, subject: string, html: string) => {
  const accessToken = await getCachedAccessToken();

  // Set current access token for the request
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: OAUTH_REFRESH_TOKEN, // keep this set so auto-refresh still works if needed
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

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

  try {
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    return result.data.id;
  } catch (error: any) {
    // If access token expired unexpectedly, purge cache once and surface error
    if (redis) await redis.del(ACCESS_TOKEN_CACHE_KEY);
    else memoryCache = null;

    console.error('--- DETAILED ERROR SENDING EMAIL VIA GMAIL API ---');
    if (error?.response?.data) console.error(error.response.data);
    else console.error(error);
    console.error('----------------------------------------------------');

    // Rethrow so callers can handle
    throw error;
  }
};

// ---- Public helpers ----
export const sendWelcomeEmail = async (user: IUser, originalSponsorId?: string): Promise<void> => {
  console.log(`Sending welcome email to ${user.email} via Gmail API...`);
  const messageId = await sendViaGmailAPI(
    user.email,
    'Welcome to Sagenex!',
    getWelcomeEmailHTML(user, originalSponsorId)
  );
  console.log('Email sent. Message ID:', messageId);
};

export const sendVerificationOtpEmail = async (user: IUser, otp: string): Promise<void> => {
  console.log(`Sending verification OTP to ${user.email}...`);
  const messageId = await sendViaGmailAPI(
    user.email,
    'Your Sagenex Verification Code',
    generateOtpEmailTemplate(otp)
  );
  console.log('OTP email sent. Message ID:', messageId);
};

export const sendTransferOtpEmail = async (user: IUser, otp: string): Promise<void> => {
  console.log(`Sending transfer OTP to ${user.email}...`);
  const messageId = await sendViaGmailAPI(
    user.email,
    'Your Sagenex Transfer Verification Code',
    getTransferOtpEmailHTML(user, otp)
  );
  console.log('OTP email sent. Message ID:', messageId);
};
