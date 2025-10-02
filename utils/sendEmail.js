// backend/utils/sendEmail.js  (ESM)
import nodemailer from "nodemailer";
import config from "../config.js"; // now config has default export

const { emailService, emailUser, emailPass } = config;

const transporter = nodemailer.createTransport({
  service: emailService || "gmail",
  auth: {
    user: emailUser,
    pass: emailPass,
  },
});

/**
 * Send email
 * @param {string} to
 * @param {string} subject
 * @param {string} body - HTML body
 */
export default async function sendEmail(to, subject, body) {
  const mailOptions = {
    from: emailUser,
    to,
    subject,
    html: body,
  };

  return transporter.sendMail(mailOptions);
}
