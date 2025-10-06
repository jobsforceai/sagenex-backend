import { IUser } from "../../user/user.model";

/**
 * Generates the HTML content for a detailed welcome email.
 * @param user The full user object.
 * @param originalSponsorId The sponsor ID or referral code used during sign-up.
 * @returns A string containing the HTML for the email.
 */
export const getWelcomeEmailHTML = (user: IUser, originalSponsorId?: string): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Sagenex</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f4f4f7;
                color: #333;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            }
            .header {
                background-color: #004AAD;
                color: #ffffff;
                padding: 40px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 600;
            }
            .content {
                padding: 30px 40px;
                line-height: 1.6;
                font-size: 16px;
            }
            .content p {
                margin: 0 0 20px;
            }
            .details-table {
                width: 100%;
                border-collapse: collapse;
                margin: 30px 0;
            }
            .details-table th, .details-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #eaeaea;
            }
            .details-table th {
                background-color: #f9f9f9;
                color: #555;
                font-weight: 600;
                width: 40%;
            }
            .button {
                display: inline-block;
                background-color: #004AAD;
                color: #ffffff !important;
                padding: 12px 25px;
                border-radius: 5px;
                text-decoration: none;
                font-weight: 500;
                margin-top: 10px;
            }
            .footer {
                background-color: #f4f4f7;
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #777;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to Sagenex!</h1>
            </div>
            <div class="content">
                <p>Hello ${user.fullName},</p>
                <p>We are thrilled to welcome you to the Sagenex community. Your account has been successfully created with the following details:</p>
                
                <table class="details-table">
                    <tr>
                        <th>Full Name</th>
                        <td>${user.fullName}</td>
                    </tr>
                    <tr>
                        <th>User ID</th>
                        <td>${user.userId}</td>
                    </tr>
                    <tr>
                        <th>Email</th>
                        <td>${user.email}</td>
                    </tr>
                    <tr>
                        <th>Initial Package</th>
                        <td>$${user.packageUSD.toFixed(2)} USD</td>
                    </tr>
                    <tr>
                        <th>Your Referral Code</th>
                        <td><strong>${user.referralCode}</strong></td>
                    </tr>
                    ${originalSponsorId ? `
                    <tr>
                        <th>Sponsor</th>
                        <td>${originalSponsorId}</td>
                    </tr>
                    ` : ''}
                </table>

                <p>You can now log in to your portal to view your package details, track your earnings, and explore all the features available to you.</p>
                <a href="#" class="button">Go to Your Portal</a>
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} Sagenex. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
  `;
};
