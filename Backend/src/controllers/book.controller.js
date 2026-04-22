const pool = require("../config/db");
const winston = require("winston");
const { getBookByISBN } = require("../../services/googleBooksService");
const {
  getIsbnFromCache,
  setIsbnCache,
  setIsbnNotFoundCache,
  deleteIsbnCache,
} = require("../../services/cache.service");

function stripVolumeSuffix(title = "") {
  return String(title).replace(/\s*-\s*Cilt:\s*\d+\s*$/i, "").trim();
}

function extractVolumeNo(title = "") {
  const match = String(title).match(/-\s*Cilt:\s*(\d+)\s*$/i);
  return match ? Number(match[1]) : null;
}

function normalizeLookupIsbn(value = "") {
  return String(value).replace(/[^0-9Xx]/g, "").toUpperCase().trim();
}

function normalizeStringArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

const getBookByIsbn = async (req, res) => {
  const rawIsbn = req.params.isbn;
  const isbn = normalizeLookupIsbn(rawIsbn);

  if (!isbn) {
    return res.status(400).json({
      success: false,
      message: "Geçerli bir ISBN girilmedi",
    });
  }

  try {
    logger.info(`Fetching book details for ISBN: ${isbn}`);

    const cached = getIsbnFromCache(isbn);

    if (cached.hit) {
      if (cached.found) {
        return res.json({
          success: true,
          data: cached.data,
        });
      }

      return res.status(404).json({
        success: false,
        message: "Kitap bulunamadı",
      });
    }

    const localBookResult = await pool.query(
      `
      SELECT *
      FROM books
      WHERE isbn = $1
      ORDER BY book_name ASC
      `,
      [isbn]
    );

    if (localBookResult.rows.length > 0) {
      const rows = localBookResult.rows;

      const baseTitle = stripVolumeSuffix(rows[0].book_name || "");
      const volumes = rows
        .map((row) => ({
          volumeNo: extractVolumeNo(row.book_name),
          title: row.book_name || "",
        }))
        .filter((item) => item.volumeNo !== null)
        .sort((a, b) => a.volumeNo - b.volumeNo);

      const authors = normalizeStringArray(rows[0].book_writer);
      const categories = normalizeStringArray(rows[0].book_genre);

      const responseData = {
        title: baseTitle || rows[0].book_name || "",
        authors,
        publisher:
          rows[0].publisher && String(rows[0].publisher).trim() !== ""
            ? rows[0].publisher
            : "Bilinmiyor",
        categories,
        isbn: rows[0].isbn || isbn,
        isbn10: "",
        isbn13: rows[0].isbn || isbn,
        pageCount: Number(rows[0].page_count) || 0, // DB'den gelen sayfa sayısı
        source: "local_db",
        physicalDescription: rows[0].page_count ? `${rows[0].page_count} sayfa` : "",
        volumeCount: volumes.length > 1 ? volumes.length : 0,
        hasVolumes: volumes.length > 1,
        volumes,
      };

      setIsbnCache(isbn, responseData, "local_db");

      return res.json({
        success: true,
        data: responseData,
      });
    }

    logger.info(`Book not found locally, querying external source for ISBN: ${isbn}`);

    let book = null;

    try {
      book = await getBookByISBN(isbn);
    } catch (externalError) {
      logger.error(`External ISBN lookup failed for ${isbn}`, {
        error: externalError.message,
        stack: externalError.stack,
      });

      deleteIsbnCache(isbn);

      return res.status(502).json({
        success: false,
        message: "Harici kitap servisine erişilemedi",
      });
    }

    if (!book) {
      setIsbnNotFoundCache(isbn, "google_books");

      return res.status(404).json({
        success: false,
        message: "Kitap bulunamadı",
      });
    }

    const responseData = {
      title: book.title || "",
      authors: normalizeStringArray(book.authors),
      publisher: book.publisher || "Bilinmiyor",
      categories: normalizeStringArray(book.categories),
      isbn: normalizeLookupIsbn(book.isbn || isbn),
      isbn10: normalizeLookupIsbn(book.isbn10 || ""),
      isbn13: normalizeLookupIsbn(book.isbn13 || ""),
      pageCount: Number(book.pageCount) || 0,
      source: "google_books",
      physicalDescription: book.physicalDescription || "",
      volumeCount: Number(book.volumeCount) > 1 ? Number(book.volumeCount) : 0,
      hasVolumes: Boolean(book.hasVolumes),
      volumes: Array.isArray(book.volumes) ? book.volumes : [],
    };

    setIsbnCache(isbn, responseData, "google_books");

    return res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logger.error("Book service hatası:", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Kitap bilgisi alınamadı",
    });
  }
};

const getAllBooks = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM books ORDER BY book_id ASC");

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

const getBookById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM books WHERE book_id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const createBook = async (req, res) => {
  try {
    const {
      title,
      authors,
      publisher,
      categories,
      isbn: rawIsbn,
      volumeCount = 0,
      physicalDescription = "",
      pageCount = 0, // Request body'den sayfa sayısını alıyoruz
    } = req.body;

    const isbn = normalizeLookupIsbn(rawIsbn);

    if (!title || !isbn) {
      return res.status(400).json({
        success: false,
        message: "Başlık ve ISBN zorunlu",
      });
    }

    const normalizedAuthors = normalizeStringArray(authors);
    const normalizedCategories = normalizeStringArray(categories);

    const authorsText = normalizedAuthors.join(", ");
    const categoriesText = normalizedCategories.join(", ");

    const parsedVolumeCount = Number(volumeCount) > 1 ? Number(volumeCount) : 0;

    const volumeTitles =
      parsedVolumeCount > 1
        ? Array.from(
            { length: parsedVolumeCount },
            (_, i) => `${title} - Cilt: ${i + 1}`
          )
        : [title];

    const createdBooks = [];
    const existingBooks = [];

    for (const volumeTitle of volumeTitles) {
      const existingBook = await pool.query(
        "SELECT * FROM books WHERE isbn = $1 AND book_name = $2 LIMIT 1",
        [isbn, volumeTitle]
      );

      if (existingBook.rows.length > 0) {
        existingBooks.push(existingBook.rows[0]);
        continue;
      }

      // page_count sütununu sorguya ekledik
      const result = await pool.query(
        `
        INSERT INTO books (book_name, book_writer, book_genre, publisher, isbn, page_count)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [volumeTitle, authorsText, categoriesText, publisher || "", isbn, Number(pageCount) || 0]
      );

      createdBooks.push(result.rows[0]);
    }

    deleteIsbnCache(isbn);

    if (createdBooks.length === 0) {
      return res.status(409).json({
        success: false,
        message: "Bu kitabın tüm ciltleri zaten ana katalogda kayıtlı",
        alreadyExists: true,
        data: existingBooks,
      });
    }

    return res.status(201).json({
      success: true,
      message:
        volumeTitles.length > 1
          ? `${createdBooks.length} cilt ana kataloğa eklendi`
          : "Kitap ana kataloğa eklendi",
      data: createdBooks,
      meta: {
        title,
        isbn,
        physicalDescription,
        pageCount: Number(pageCount) || 0,
        volumeCount: parsedVolumeCount,
        hasVolumes: parsedVolumeCount > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Kitap eklenemedi",
      error: error.message,
    });
  }
};

const updateBook = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      book_name,
      book_writer,
      book_genre,
      book_quantity,
      book_available_quantity,
      page_count, // Güncelleme için eklendi
    } = req.body;

    const existing = await pool.query("SELECT * FROM books WHERE book_id = $1", [
      id,
    ]);

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    const current = existing.rows[0];

    const result = await pool.query(
      `UPDATE books
       SET book_name = $1,
           book_writer = $2,
           book_genre = $3,
           book_quantity = $4,
           book_available_quantity = $5,
           page_count = $6
       WHERE book_id = $7
       RETURNING *`,
      [
        book_name ?? current.book_name,
        book_writer ?? current.book_writer,
        book_genre ?? current.book_genre,
        book_quantity ?? current.book_quantity,
        book_available_quantity ?? current.book_available_quantity,
        page_count ?? current.page_count,
        id,
      ]
    );

    if (current.isbn) {
      deleteIsbnCache(normalizeLookupIsbn(current.isbn));
    }
    if (result.rows[0]?.isbn) {
      deleteIsbnCache(normalizeLookupIsbn(result.rows[0].isbn));
    }

    res.status(200).json({
      success: true,
      message: "Book updated",
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const deleteBook = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM books WHERE book_id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    if (result.rows[0]?.isbn) {
      deleteIsbnCache(normalizeLookupIsbn(result.rows[0].isbn));
    }

    res.status(200).json({
      success: true,
      message: "Book deleted",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllBooks,
  getBookByIsbn,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
};