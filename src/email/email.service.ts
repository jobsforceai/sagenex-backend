import nodemailer from 'nodemailer';
import { getWelcomeEmailHTML } from './templates/welcome.template';
import { IUser } from '../user/user.model';
import 'dotenv/config';

let transporter: nodemailer.Transporter;

/**
 * Initializes the nodemailer transporter.
 * Uses real SMTP credentials if available in .env, otherwise falls back to Ethereal.
 */
const initializeTransporter = async () => {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    // --- Production/Real Email Transport ---
    console.log('Initializing real email transporter with host:', process.env.EMAIL_HOST, 'and user:', process.env.EMAIL_USER);
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // --- Development/Ethereal Transport ---
    console.log('Initializing Ethereal email transporter (EMAIL_HOST, EMAIL_USER, or EMAIL_PASS not found in .env).');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }
};

// Initialize the transporter when the service is loaded
initializeTransporter().catch(console.error);

/**
 * Sends a welcome email to a newly onboarded user.
 * @param user The user object containing details like fullName and email.
 * @param originalSponsorId The sponsor ID or referral code used during sign-up.
 */
export const sendWelcomeEmail = async (user: IUser, originalSponsorId?: string): Promise<void> => {
  if (!transporter) {
    console.error('Email transporter is not initialized. Cannot send welcome email.');
    return;
  }

  try {
    console.log(`Attempting to send welcome email to ${user.email}...`);
    // Define the email options
    const mailOptions = {
      from: '"Sagenex Admin" <noreply@sagenex.com>',
      to: user.email,
      subject: 'Welcome to Sagenex!',
      html: getWelcomeEmailHTML(user, originalSponsorId),
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);

    console.log('Email sent successfully! Message ID: %s', info.messageId);

    // If using Ethereal, log the preview URL
    const etherealUrl = nodemailer.getTestMessageUrl(info);
    if (etherealUrl) {
      console.log('Preview URL: %s', etherealUrl);
    }

  } catch (error){
    console.error('--- DETAILED ERROR SENDING EMAIL ---');
    console.error(error);
    console.error('------------------------------------');
    // We don't re-throw the error because an email failure should not
    // block the main application flow (e.g., user creation).
  }
};
