const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");

// Okul işlemleri
router.post("/schools", adminController.createSchool);
router.get("/schools", adminController.getSchools);

// Öğretmen işlemleri
router.post("/schools/:schoolId/teachers", adminController.createTeacher);
router.get("/schools/:schoolId/teachers", adminController.getSchoolTeachers);
router.delete("/schools/:schoolId/teachers/:teacherId", adminController.deleteTeacher);

module.exports = router;