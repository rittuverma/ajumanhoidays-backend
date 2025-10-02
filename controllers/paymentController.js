import Razorpay from "razorpay";
import { razorpayKeyId, razorpayKeySecret } from "../config.js";
import sendEmail from "../utils/sendEmail.js";

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

export const createOrder = async (req, res) => {
  const { amount } = req.body;

  const options = {
    amount: amount * 100, // convert to paisa
    currency: "INR",
    payment_capture: 1,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating order");
  }
};

export const sendPaymentConfirmationEmail = async (req, res) => {
  const { to, subject, body } = req.body;

  try {
    await sendEmail(to, subject, body);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to send email");
  }
};
