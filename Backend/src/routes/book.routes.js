const express = require("express");
const router = express.Router();
const bookController = require("../controllers/book.controller.js");

router.get("/", bookController.getAllBooks);
router.get("/isbn/:isbn", bookController.getBookByIsbn);
router.get("/:id", bookController.getBookById);
router.post("/", bookController.createBook);
router.patch("/:id", bookController.updateBook);
router.delete("/:id", bookController.deleteBook);

module.exports = router;