export const generateOtpEmailTemplate = (otp: string) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your One-Time Password (OTP)</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          padding-bottom: 20px;
          border-bottom: 1px solid #dddddd;
        }
        .header h1 {
          margin: 0;
          color: #333333;
        }
        .content {
          padding: 20px 0;
          color: #555555;
          line-height: 1.6;
        }
        .otp-code {
          font-size: 24px;
          font-weight: bold;
          color: #007bff;
          text-align: center;
          margin: 20px 0;
          padding: 10px;
          background-color: #f0f8ff;
          border-radius: 4px;
        }
        .footer {
          text-align: center;
          padding-top: 20px;
          border-top: 1px solid #dddddd;
          font-size: 12px;
          color: #999999;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>SAGENEX</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>Thank you for registering. Please use the following One-Time Password (OTP) to complete your sign-up process. This OTP is valid for 10 minutes.</p>
          <div class="otp-code">${otp}</div>
          <p>If you did not request this OTP, please ignore this email or contact our support team if you have any concerns.</p>
          <p>Best regards,<br>The SAGENEX Team</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} SAGENEX. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
