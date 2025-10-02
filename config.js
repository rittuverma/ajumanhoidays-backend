// backend/config.js
import dotenv from "dotenv";
dotenv.config();

const config = {
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  emailService: process.env.EMAIL_SERVICE,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
};

export default config;
