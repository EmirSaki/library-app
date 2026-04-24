const express = require("express");
const router = express.Router();

const {
  registerStudent,
  loginStudent,
  createStudentReservation,
  getMyReservations,
} = require("../controllers/student.controller");

const { authStudent } = require("../middlewares/student.middleware");

// auth olmayan
router.post("/register", registerStudent);
router.post("/login", loginStudent);

// auth gerekenler
router.post("/reservations", authStudent, createStudentReservation);
router.get("/reservations", authStudent, getMyReservations);

module.exports = router;