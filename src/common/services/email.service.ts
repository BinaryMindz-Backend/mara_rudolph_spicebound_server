import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private logger = new Logger('EmailService');

  constructor(private configService: ConfigService) {
    // Configure nodemailer transporter with env variables
    const mailUser = this.configService.get<string>('MAIL_USER');
    const mailPassword = this.configService.get<string>('MAIL_PASSWORD');
    const mailService =
      this.configService.get<string>('MAIL_SERVICE') || 'gmail';

    if (!mailUser || !mailPassword) {
      this.logger.warn(
        'Email credentials not configured. Email sending will fail.',
      );
    }

    this.transporter = nodemailer.createTransport({
      service: mailService,
      auth: {
        user: mailUser,
        pass: mailPassword,
      },
    });
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const mailFrom =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('MAIL_USER');

    const mailOptions = {
      from: mailFrom,
      to: email,
      subject: 'Password Reset Request - Spicebound',
      html: this.getPasswordResetTemplate(resetUrl),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}:`, error);
      throw error;
    }
  }

  private getPasswordResetTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #8B4513; color: white; padding: 20px; border-radius: 5px; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; background-color: #8B4513; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { font-size: 12px; color: #999; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Spicebound - Password Reset</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>We received a request to reset your password. Click the button below to set a new password:</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request this, you can ignore this email.</p>
              <p>Best regards,<br/>The Spicebound Team</p>
            </div>
            <div class="footer">
              <p>If the button doesn't work, copy and paste this link: ${resetUrl}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
