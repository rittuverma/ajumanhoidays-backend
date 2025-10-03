import express from 'express' ;
import cors from 'cors' ;
import bodyParser from 'body-parser' ;
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import nodemailer from "nodemailer";
import paymentsRouter from "./routes/payments.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= MIDDLEWARE =================
app.use(cors({
  origin: ["http://localhost:3000", "https://www.ajumanholidays.com"],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.json());

app.use("/api/payments", paymentsRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Payment server running on port ${PORT}`));

// ================= EMAIL SETUP =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ajumanholidays@gmail.com",     // 🔹 replace with your Gmail
    pass: "Ajuman@2025Holidays"       // 🔹 generate "App Password" in Google Account
  }
});

// Utility to send email
const sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: '"Ajuman Holidays" <ajumanholidays@gmail.com>',
      to,
      subject,
      text
    });
    console.log("📧 Email sent to", to);
  } catch (err) {
    console.error("❌ Error sending email:", err);
  }
};
// ================= DB HELPERS =================
const dbPath = path.join(__dirname, "db.json");
const loadDB = () => {
  try {
    const data = fs.readFileSync(dbPath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return { customers: [], bookings: [], notifications: [], reviews: [], payments: [], routes: [], buses: [], employees: [] };
  }
};
const saveDB = (db) => {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
};

// ================= MULTER SETUP =================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ================= ROUTES API =================
let routes = [];


app.get("/routes", (req, res) => {
  const db = loadDB();
  res.json(db.routes);
});

app.post("/routes", (req, res) => {
  const db = loadDB();
  const newRoute = { id: Date.now(), ...req.body };
  db.routes.push(newRoute);
  saveDB(db);
  res.status(201).json(newRoute);
});

// Update route
app.put("/routes/:id", (req, res) => {
  const db = loadDB();
  const routeId = parseInt(req.params.id);

  const index = db.routes.findIndex(r => r.id == routeId);
  if (index === -1) return res.status(404).json({ message: "Route not found" });

  db.routes[index] = { ...db.routes[index], ...req.body };
  saveDB(db);

  res.json({ success: true, route: db.routes[index] });
});

// Delete route
app.delete("/routes/:id", (req, res) => {
  const db = loadDB();
  const routeId = parseInt(req.params.id);

  const route = db.routes.find(r => r.id == routeId);
  if (!route) return res.status(404).json({ message: "Route not found" });

  db.routes = db.routes.filter(r => r.id != routeId);
  saveDB(db);

  res.json({ success: true, message: "Route deleted" });
});


// ================= BOOKINGS API =================

let bookings = [];
// Get bookings for a customer
app.get("/bookings/:customerId", (req, res) => {
  const db = loadDB();
  const { customerId } = req.params;
  const userBookings = db.bookings ? db.bookings.filter(b => b.customerId == customerId) : [];
  res.json(userBookings);
});

// Add a booking
app.post("/bookings", (req, res) => {
  const db = loadDB();
  const newBooking = { id: Date.now(), ...req.body };

  if (!db.bookings) db.bookings = [];   // make sure bookings array exists
  db.bookings.push(newBooking);

  // Save changes to db.json
  saveDB(db);
 // Send email confirmation
  sendEmail(
    newBooking.email,
    "Booking Confirmation - Ajuman Holidays",
    `Dear ${newBooking.name},\n\nYour booking from ${newBooking.origin} → ${newBooking.destination} on ${newBooking.date} has been confirmed.\n\nThank you for choosing Ajuman Holidays!`
  );

  res.status(201).json({ success: true, booking: newBooking });
});

// Update booking
app.put("/bookings/:id", (req, res) => {
  const db = loadDB();
  const bookingId = parseInt(req.params.id);
  const index = db.bookings.findIndex(b => b.id === bookingId);

  if (index === -1) {
    return res.status(404).json({ message: "Booking not found" });
  }

  // Store old booking details for reference
  const oldBooking = db.bookings[index];

  // Update booking details
  db.bookings[index] = { ...oldBooking, ...req.body };

  // 🔹 Add update notification
  if (!db.notifications) db.notifications = [];
  db.notifications.push({
    id: Date.now(),
    message: `Your booking from ${db.bookings[index].origin} → ${db.bookings[index].destination} has been updated.`,
    isRead: false,
    date: new Date().toISOString().split("T")[0],
    customerId: db.bookings[index].customerId || null
  });

  saveDB(db);

  res.json({ success: true, booking: db.bookings[index] });
});


// Delete booking
app.delete("/bookings/:id", (req, res) => {
  
  const db = loadDB();
  const bookingId = parseInt(req.params.id);
  const booking = db.bookings.find(b => b.id === bookingId);

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  // Remove booking
  db.bookings = db.bookings.filter(b => b.id !== bookingId);

  saveDB(db);
  // Send cancellation email
  sendEmail(
    booking.email,
    "Booking Cancelled - Ajuman Holidays",
    `Dear ${booking.name},\n\nYour booking from ${booking.origin} → ${booking.destination} on ${booking.date} has been cancelled.\n\nIf this wasn’t you, please contact support.`
  );

  res.json({ success: true, message: "Booking cancelled" });
});


// Bus Delay Notification From Admin
app.post("/notifications/delay", (req, res) => {
  const db = loadDB();
  const { customerId, origin, destination, delayMins } = req.body;

  const delayNotification = {
    id: Date.now(),
    customerId,
    message: `🚌 Your bus from ${origin} → ${destination} is delayed by ${delayMins} mins.`,
    type: "delay",
    isRead: false,
    date: new Date().toISOString().split("T")[0]
  };

  db.notifications.push(delayNotification);
  saveDB(db);

  res.json({ success: true, notification: delayNotification });
});

// Admin sends custom notification
app.post("/notifications", (req, res) => {
  const db = loadDB();
  const { customerId, message, type } = req.body;

  const newNotification = {
    id: Date.now(),
    customerId,
    message,
    type, // "booking" | "cancellation" | "payment" | "delay" | "info"
    isRead: false,
    date: new Date().toISOString().split("T")[0]
  };

  db.notifications.push(newNotification);
  saveDB(db);

  res.status(201).json({ success: true, notification: newNotification });
});


// ================= PAYMENTS API =================
app.post("/payments", (req, res) => {
  const db = loadDB();
  const { customerId, bookingId, amount, email, customerName, status } = req.body;

  // default status = success if not provided
  const paymentStatus = status || "success";

  // Create new payment entry
  const newPayment = {
    id: Date.now(),
    customerId,
    bookingId,
    amount,
    date: new Date().toISOString(),
    status: paymentStatus
  };

  if (!db.payments) db.payments = [];
  db.payments.push(newPayment);
  saveDB(db);

  // Send email based on status
  if (paymentStatus === "success") {
    sendEmail(
      email,
      "Payment Successful - Ajuman Holidays",
      `Dear ${customerName},\n\nWe have successfully received your payment of ₹${amount} for your booking (ID: ${bookingId}).\n\nThank you for trusting Ajuman Holidays.\nSafe Travels!\n\n- Ajuman Holidays`
    );
  } else if (paymentStatus === "failed") {
    sendEmail(
      email,
      "Payment Failed - Ajuman Holidays",
      `Dear ${customerName},\n\nUnfortunately, your payment of ₹${amount} for booking (ID: ${bookingId}) has failed.\nPlease try again or contact support for assistance.\n\n- Ajuman Holidays`
    );
  }

  res.status(201).json({ success: true, payment: newPayment });
});

//Refund Payment
app.put("/payments/:id/refund", (req, res) => {
  const db = loadDB();
  const payment = db.payments.find(p => p.id == req.params.id);

  if (!payment) return res.status(404).json({ message: "Payment not found" });

  payment.status = "refund";
  saveDB(db);

  res.json({ success: true, payment });
});





// // Log every request (for debugging)
// app.use((req, res, next) => {
//   console.log(`${req.method} ${req.url}`);
//   next();
// });

// Fake admin data
const admins = [
  {
    id: 1,
    email: "admin@example.com",
    password: "admin123",
    name: "Super Admin"
  }
];



// // Temporary customer database (use DB later)
// let customers = [];

// Configure storage
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     const uploadPath = path.join(__dirname, "uploads");
//     if (!fs.existsSync(uploadPath)) {
//       fs.mkdirSync(uploadPath, { recursive: true }); // 🔹 ensure folder exists
//     }
//     cb(null, uploadPath); // save files in /uploads folder
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + "-" + file.originalname); // unique file name
//   }
// });

// const upload = multer({ storage });

// 📂 Serve uploaded files (so frontend can access them)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer storage setup


// 📌 DB helper


// // Upload profile picture
// app.post("/api/customers/:id/upload", upload.single("profilePic"), (req, res) => {
//   const customerId = parseInt(req.params.id);
//   const db = loadDB();
//   const customer = db.customers.find(c => c.id == req.params.id);

//   if (!customer) {
//     return res.status(404).json({ success: false, message: "Customer not found" });
//   }

//   if (!req.file) {
//     return res.status(400).json({ success: false, message: "No file uploaded" });
//   }

//   // Save file path in customer profile
//   const filePath = `/uploads/${req.file.filename}`;
//   customer.profilePic = filePath;
//   saveDB(db);

//   res.json({ success: true, profilePic: filePath });
// });



// // Update customer (profile update)
// app.put("/customers/:id", (req, res) => {
//   const db = loadDB();
//   const index = db.customers.findIndex(c => c.id == req.params.id);

//   if (index === -1) {
//     return res.status(404).json({ success: false, message: "Customer not found" });
//   }

// // update fields
//   db.customers[index] = { ...db.customers[index], ...req.body };

//   saveDB(db);
//   res.json({ success: true, customer: db.customers[index] });
//   });

// // Path to db.json
// const dbPath = path.join(__dirname, "db.json");

// // Helper: Load DB
// const loadDB = () => {
//   try {
//     const data = fs.readFileSync(dbPath, "utf-8");
//     return JSON.parse(data);
//   } catch (err) {
//     return { customers: [] }; // default structure
//   }
// };

// // Helper: Save DB
// const saveDB = (db) => {
//   fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
// };


// ================= CUSTOMERS API =================
// Register
app.post("/api/auth/customers", (req, res) => {
  const { name, email, password } = req.body;

  const db = loadDB();

  if (db.customers.find(c => c.email === email)) {
    return res.status(400).json({ success: false, message: "Email already exists" });
  }

  const newCustomer = { id: Date.now(), name, email, password };
  db.customers.push(newCustomer);
  saveDB(db);

  res.json({ success: true, message: "Registration successful", customer: newCustomer });
});

// Login
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const db = loadDB();

  const customer = db.customers.find((c) => c.email === email && c.password === password);

  if (!customer) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  res.json({
    success: true,
    token: "customerToken123", // fake token for now
    customer
  });
});

// Get all customers (for admin)
app.get("/customers", (req, res) => {
  const db = loadDB();
  res.json(db.customers);
});

// Get single customer
app.get("/customers/:id", (req, res) => {
  const db = loadDB();
  const customer = db.customers.find(c => c.id == req.params.id);

  if (customer) {
    res.json(customer);
  }else res.status(404).json({ success: false, message: "Customer not found" });
});

// Update customer
app.put("/customers/:id", (req, res) => {
  const db = loadDB();
  const index = db.customers.findIndex(c => c.id == req.params.id);
  if (index === -1) return res.status(404).json({ message: "Customer not found" });

  db.customers[index] = { ...db.customers[index], ...req.body };
  saveDB(db);
  res.json({ success: true, customer: db.customers[index] });
});

// Delete customer (optional)
app.delete("/customers/:id", (req, res) => {
  const db = loadDB();
  db.customers = db.customers.filter(c => c.id != req.params.id);
  saveDB(db);
  res.json({ message: "Customer deleted" });
});

// ================= NOTIFICATIONS API =================
let notifications = [];

// Get notifications for a specific customer
app.get("/notifications/:customerId", (req, res) => {
  const db = loadDB();
  const { customerId } = req.params;

  if (!db.notifications) {
    return res.json([]); // if no notifications exist yet
  }

  const userNotifications = db.notifications.filter(
    (n) => n.customerId == customerId
  );
  res.json(userNotifications);
});

// Mark a notification as read
app.put("/notifications/:id/read", (req, res) => {
  const db = loadDB();
  const notification = db.notifications.find((n) => n.id == req.params.id);
  if (!notification) return res.status(404).json({ message: "Not found" });

  notification.isRead = true;
  saveDB(db);
  res.json(notification);
});

// Add new notification (optional - e.g., after booking)
app.post("/notifications", (req, res) => {
  const db = loadDB();
  const newNotification = { id: Date.now(), isRead: false, ...req.body };
  db.notifications.push(newNotification);
  saveDB(db);
  res.status(201).json(newNotification);
});

// ================= REVIEWS API =================
app.get("/reviews", (req, res) => {
  const db = loadDB();
  if (!db.reviews) db.reviews = [];
  res.json(db.reviews);
});

app.post("/reviews", (req, res) => {
  const db = loadDB();
  if (!db.reviews) db.reviews = [];

  const newReview = {
    id: Date.now(),
    name: req.body.name,
    rating: req.body.rating,
    comment: req.body.comment,
    date: new Date().toISOString()
  };

  db.reviews.push(newReview);
  saveDB(db);

  res.status(201).json({ success: true, review: newReview });
});

// ================= ADMIN LOGIN =================
app.post("/api/auth/admin-login", (req, res) => {
  const { email, password } = req.body;
  if (email === "admin@example.com" && password === "admin123") {
    res.json({ success: true, token: "abc123", admin: { name: "Super Admin", email } });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// ================= DASHBOARD OVERVIEW =================
app.get("/admin/dashboard-overview", (req, res) => {
  try {
    const db = loadDB();

    const customers = db.customers || [];
    const bookings = db.bookings || [];
    const payments = db.payments || [];
    const routes = db.routes || [];
    const buses = db.buses || [];       // you don’t have this yet, so [] by default
    const employees = db.employees || []; // also [] for now

    // Calculate stats
    const totalCancelled = bookings.filter(b => b.status === "cancelled").length;

    const totalEarnings = payments
      .filter(p => p.status === "success")
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const totalRefunds = payments
      .filter(p => p.status === "refund")
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const stats = {
      totalCustomers: customers.length,
      totalBookings: bookings.length,
      totalCancelled,
      totalEarnings,
      totalRefunds,
      totalExpenses: totalRefunds + 1000, // dummy, adjust later
      totalBuses: buses.length,
      ongoingBuses: buses.filter(b => b.status === "ongoing").length,
      totalRoutes: routes.length,
      totalEmployees: employees.length,
    };

    res.json(stats);
  } catch (err) {
    console.error("❌ Error generating dashboard stats:", err);
    res.status(500).json({ error: "Failed to generate dashboard stats" });
  }
});

// ================= BUSES API =================

// Get all buses
app.get("/buses", (req, res) => {
  const db = loadDB();
  if (!db.buses) db.buses = [];
  res.json(db.buses);
});

// Get a single bus by ID
app.get("/buses/:id", (req, res) => {
  const db = loadDB();
  const bus = (db.buses || []).find((b) => b.id == req.params.id);
  if (!bus) return res.status(404).json({ message: "Bus not found" });
  res.json(bus);
});

// Add a new bus
app.post("/buses", (req, res) => {
  try {
    const db = loadDB();
    if (!db.buses) db.buses = [];

    const {
      name,
      serialNumber,
      registrationNumber,
      type,
      seatCapacity,
      from,
      to,
      image,
      driverId,
      supervisorId
    } = req.body;

    // Basic validation
    if (!name || !serialNumber || !registrationNumber || !type || !from || !to) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields (name, serialNumber, registrationNumber, type, from, to)." 
      });
    }

    // Normalize seat capacity
    const rawCap = Number(seatCapacity);
    const validCap = Number.isFinite(rawCap) ? rawCap : 1;
    const clampedCap = Math.max(1, Math.min(100, validCap));

    const newBus = {
      id: Date.now(),
      name,
      serialNumber,
      registrationNumber,
      type,
      seatCapacity: clampedCap,
      from,
      to,
      image: image || "",
      driverId: driverId ?? null,
      supervisorId: supervisorId ?? null
    };

    db.buses.push(newBus);
    saveDB(db);

    res.status(201).json({ success: true, bus: newBus });
  } catch (e) {
    console.error("Error adding bus:", e);
    res.status(500).json({ success: false, message: "Server error while adding bus" });
  }
});

// Update bus
app.put("/buses/:id", (req, res) => {
  const db = loadDB();
  const busId = parseInt(req.params.id, 10);

  const idx = (db.buses || []).findIndex(b => b.id === busId);
  if (idx === -1) return res.status(404).json({ success: false, message: "Bus not found" });

  const updated = { ...db.buses[idx], ...req.body };

  // Keep seatCapacity valid
  const rawCap = Number(updated.seatCapacity);
  const validCap = Number.isFinite(rawCap) ? rawCap : db.buses[idx].seatCapacity || 1;
  updated.seatCapacity = Math.max(1, Math.min(100, validCap));

  db.buses[idx] = updated;
  saveDB(db);
  res.json({ success: true, bus: db.buses[idx] });
});

// Delete bus
app.delete("/buses/:id", (req, res) => {
  const db = loadDB();
  const busId = parseInt(req.params.id, 10);

  const exists = (db.buses || []).some(b => b.id === busId);
  if (!exists) return res.status(404).json({ success: false, message: "Bus not found" });

  db.buses = db.buses.filter(b => b.id !== busId);
  saveDB(db);
  res.json({ success: true, message: "Bus deleted" });
});
// ================= DRIVERS API =================
app.get("/drivers", (req, res) => {
  const db = loadDB();
  if (!db.drivers) db.drivers = [];
  res.json(db.drivers);
});

app.post("/drivers", (req, res) => {
  const db = loadDB();
  if (!db.drivers) db.drivers = [];
  const newDriver = { id: Date.now(), ...req.body };
  db.drivers.push(newDriver);
  saveDB(db);
  res.status(201).json(newDriver);
});

app.put("/drivers/:id", (req, res) => {
  const db = loadDB();
  const index = db.drivers.findIndex(d => d.id == req.params.id);
  if (index === -1) return res.status(404).json({ message: "Driver not found" });

  db.drivers[index] = { ...db.drivers[index], ...req.body };
  saveDB(db);
  res.json(db.drivers[index]);
});

app.delete("/drivers/:id", (req, res) => {
  const db = loadDB();
  db.drivers = db.drivers.filter(d => d.id != req.params.id);
  saveDB(db);
  res.json({ success: true, message: "Driver deleted" });
});

// ================= SUPERVISORS API =================
app.get("/supervisors", (req, res) => {
  const db = loadDB();
  if (!db.supervisors) db.supervisors = [];
  res.json(db.supervisors);
});

app.post("/supervisors", (req, res) => {
  const db = loadDB();
  if (!db.supervisors) db.supervisors = [];
  const newSupervisor = { id: Date.now(), ...req.body };
  db.supervisors.push(newSupervisor);
  saveDB(db);
  res.status(201).json(newSupervisor);
});

app.put("/supervisors/:id", (req, res) => {
  const db = loadDB();
  const index = db.supervisors.findIndex(s => s.id == req.params.id);
  if (index === -1) return res.status(404).json({ message: "Supervisor not found" });

  db.supervisors[index] = { ...db.supervisors[index], ...req.body };
  saveDB(db);
  res.json(db.supervisors[index]);
});

app.delete("/supervisors/:id", (req, res) => {
  const db = loadDB();
  db.supervisors = db.supervisors.filter(s => s.id != req.params.id);
  saveDB(db);
  res.json({ success: true, message: "Supervisor deleted" });
});






// ================= SERVER START =================
app.get('/', (req, res) => {
    res.send('Server is ready');
});

// // Serve React frontend
// app.use(express.static(path.join(__dirname, "../frontend/build")));

// // Fallback for React Router
// app.get("/*", (req, res) => {
//   res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
// });

const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Serve at http://localhost:${port}`);
});
