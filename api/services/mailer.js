// api/services/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: !!Number(process.env.SMTP_SECURE || 0), // 465 => true
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // En del leverantörer kräver detta off i labb/VPN
  tls: { rejectUnauthorized: false },
  logger: true,
  debug: true,
});

async function verifySmtp() {
  return transporter.verify();
}

async function sendResetEmail(to, link) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = 'Återställ ditt lösenord';
  const text = `Hej!\n\nKlicka på länken för att återställa ditt lösenord:\n${link}\n\nLänken är giltig i ${process.env.RESET_TOKEN_TTL_MIN || 60} minuter.`;
  const html = `
    <p>Hej!</p>
    <p>Klicka på länken för att återställa ditt lösenord:</p>
    <p><a href="${link}">${link}</a></p>
    <p>Länken är giltig i ${process.env.RESET_TOKEN_TTL_MIN || 60} minuter.</p>
  `;
  const info = await transporter.sendMail({ from, to, subject, text, html });
  console.log('✉️  Mail skickat:', info.messageId);
  return info;
}

module.exports = { sendResetEmail, verifySmtp };
