// backend/routes/payments.js
import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import config from "../config.js"; // config.js must use `export default {}`

const { razorpayKeyId, razorpayKeySecret } = config;

const router = express.Router();

// initialize razorpay instance
const rzp = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

// POST /api/payments/create
router.post("/create", async (req, res) => {
  try {
    const { booking } = req.body;

    if (!booking || !booking.amount) {
      return res.status(400).json({ message: "Missing booking/amount" });
    }

    const amountInPaise = Math.round(Number(booking.amount) * 100);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
    };

    const order = await rzp.orders.create(options);

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: razorpayKeyId,
      order,
    });
  } catch (err) {
    console.error("Error creating Razorpay order:", err);
    return res.status(500).json({ success: false, message: "Server error creating order" });
  }
});

// POST /api/payments/verify
router.post("/verify", (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing Razorpay payment fields" });
    }

    const generated_signature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      return res.json({
        success: true,
        message: "Payment verified",
        razorpay_order_id,
        razorpay_payment_id,
      });
    } else {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }
  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).json({ success: false, message: "Server error verifying payment" });
  }
});

export default router;
