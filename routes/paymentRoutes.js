import express from "express";
import { createOrder, sendPaymentConfirmationEmail } from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-order", createOrder);
router.post("/sendEmail", sendPaymentConfirmationEmail);

export default router; // ✅ default export for ESM
