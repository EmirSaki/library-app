const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const pool = require("./config/db");

const bookRoutes = require("./routes/book.routes");
const userRoutes = require("./routes/user.routes");
const reservationRoutes = require("./routes/reservation.routes");
const adminRoutes = require("./routes/admin.routes");
const schoolRoutes = require("./routes/school.routes");
const studentRoutes = require("./routes/student.routes");

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  req.setTimeout(45000, () => {
    console.error("[TIMEOUT]", req.method, req.originalUrl);
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: "Request timeout",
      });
    }
  });
  next();
});

app.get("/", (req, res) => {
  res.json({ success: true, message: "Library API is running" });
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      success: true,
      db: true,
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      db: false,
      error: error.message,
    });
  }
});

app.use("/api/books", bookRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/students", studentRoutes);

app.use((err, req, res, next) => {
  console.error("[UNHANDLED_ERROR]", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

module.exports = app;