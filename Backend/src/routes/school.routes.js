const express = require("express");
const router = express.Router();

const {
  accessSchool,
  getSchoolBooks,
  getSchoolBookDetail,
  addBookToSchoolInventory,
  updateSchoolBookQuantity,
  deleteSchoolBookFromInventory,
  exportSchoolBooks,
} = require("../controllers/school.controller");

router.post("/access", accessSchool);

router.get("/:schoolCode/books/export", exportSchoolBooks);
router.get("/:schoolCode/books", getSchoolBooks);
router.get("/:schoolCode/books/:bookId", getSchoolBookDetail);

router.post("/:schoolCode/books", addBookToSchoolInventory);
router.patch("/:schoolCode/books/:bookId", updateSchoolBookQuantity);
router.delete("/:schoolCode/books/:bookId", deleteSchoolBookFromInventory);

module.exports = router;