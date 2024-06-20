import nodemailer from 'nodemailer';
import { MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASS, MAIL_TO } from './server';

export const send = (from: string, replyTo: string, subject: string, text: string) => {
  let transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: MAIL_PORT,
    secure: MAIL_SECURE,
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS
    }
  });

  let info = transporter.sendMail({
    from: `"${from}" <${MAIL_USER}>`,
    replyTo: `"${from}" <${replyTo}>`,
    to: MAIL_TO,
    subject,
    text
  });

  return info;
};
