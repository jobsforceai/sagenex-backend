import { IUser } from "../../user/user.model";

export const getTransferOtpEmailHTML = (user: IUser, otp: string): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your One-Time Password</title>
        <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
            .otp { font-size: 24px; font-weight: bold; color: #004AAD; letter-spacing: 2px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Sagenex Fund Transfer Verification</h2>
            <p>Hello ${user.fullName},</p>
            <p>Please use the following One-Time Password (OTP) to complete your fund transfer. This OTP is valid for 10 minutes.</p>
            <p class="otp">${otp}</p>
            <p>If you did not request this transfer, please secure your account immediately.</p>
        </div>
    </body>
    </html>
  `;
};
