const pool = require("../config/db");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const {
  getSchoolBooksFromCache,
  setSchoolBooksCache,
  invalidateSchoolBooksCache,
} = require("../../services/cache.service");

function normalizeIsbn(value = "") {
  return String(value).replace(/[^0-9Xx]/g, "").toUpperCase().trim();
}

function normalizeTurkishSearch(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "c")
    .trim();
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

function buildVolumeTitles(title, volumeCount) {
  if (!volumeCount || volumeCount <= 1) {
    return [title];
  }

  return Array.from(
    { length: volumeCount },
    (_, i) => `${title} - Cilt: ${i + 1}`
  );
}

// pageCount parametresi eklendi
async function findOrCreateBook({
  client,
  title,
  authorsText,
  categoriesText,
  publisher,
  isbn,
  pageCount = 0,
}) {
  let bookResult = await client.query(
    "SELECT * FROM books WHERE isbn = $1 AND book_name = $2 LIMIT 1",
    [isbn, title]
  );

  if (bookResult.rows.length === 0) {
    bookResult = await client.query(
      `
      INSERT INTO books (book_name, book_writer, book_genre, publisher, isbn, page_count)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [title, authorsText, categoriesText, publisher || "", isbn, Number(pageCount) || 0]
    );
  }

  return bookResult.rows[0];
}

async function getSchoolBooksRaw(schoolCode, search = "") {
  if (!/^\d+$/.test(String(schoolCode))) {
    throw new Error("Geçersiz okul kodu");
  }

  const schoolCheck = await pool.query(
    "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
    [schoolCode]
  );

  if (schoolCheck.rows.length === 0) {
    const err = new Error("Okul bulunamadı");
    err.statusCode = 404;
    throw err;
  }

  const schemaName = `school_${schoolCode}`;
  const searchTerm = normalizeTurkishSearch(search || "");

  const whereClause = searchTerm
    ? `
        WHERE
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(b.book_name),
          'ı','i'),'ş','s'),'ğ','g'),'ü','u'),'ö','o'),'ç','c') ILIKE $1
          OR
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(b.book_writer),
          'ı','i'),'ş','s'),'ğ','g'),'ü','u'),'ö','o'),'ç','c') ILIKE $1
      `
    : "";

const params = searchTerm ? [`%${searchTerm}%`] : [];

  // b.page_count eklendi
  const query = `
    SELECT
      b.book_id,
      b.book_name AS title,
      b.page_count,
      CASE
        WHEN b.book_writer IS NULL OR b.book_writer = '' THEN ARRAY[]::text[]
        ELSE string_to_array(b.book_writer, ', ')
      END AS authors,
      b.publisher,
      CASE
        WHEN b.book_genre IS NULL OR b.book_genre = '' THEN ARRAY[]::text[]
        ELSE string_to_array(b.book_genre, ', ')
      END AS categories,
      b.isbn,
      bi.quantity,
      bi.available_quantity
    FROM ${schemaName}.book_inventory bi
    INNER JOIN public.books b ON b.book_id = bi.book_id
    ${whereClause}
    ORDER BY b.book_name ASC
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

const accessSchool = async (req, res, next) => {
  try {
    const { schoolCode } = req.body;

    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: "schoolCode zorunlu",
      });
    }

    if (!/^\d+$/.test(String(schoolCode))) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz okul kodu",
      });
    }

    const result = await pool.query(
      "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const school = result.rows[0];

    return res.status(200).json({
      success: true,
      data: {
        schoolId: school.school_id,
        schoolCode: school.school_code,
        schoolName: school.school_name,
        schemaName: `school_${school.school_code}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getSchoolBooks = async (req, res, next) => {
  try {
    const { schoolCode } = req.params;
    const { page = 1, limit = 30, search = "" } = req.query;

    if (!/^\d+$/.test(String(schoolCode))) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz okul kodu",
      });
    }

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 30, 1);
    const offset = (parsedPage - 1) * parsedLimit;
    const searchTerm = normalizeTurkishSearch(search || "");

    const cached = getSchoolBooksFromCache({
      schoolCode,
      page: parsedPage,
      limit: parsedLimit,
      search: searchTerm,
    });

    if (cached) {
      return res.status(200).json(cached);
    }

    const schoolCheck = await pool.query(
      "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );

    if (schoolCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const schemaName = `school_${schoolCode}`;

    const whereClause = searchTerm
      ? `
        WHERE
          b.book_name ILIKE $1
          OR b.book_writer ILIKE $1
      `
      : "";

    const countParams = searchTerm ? [`%${searchTerm}%`] : [];
    const dataParams = searchTerm
      ? [`%${searchTerm}%`, parsedLimit, offset]
      : [parsedLimit, offset];

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM ${schemaName}.book_inventory bi
      INNER JOIN public.books b ON b.book_id = bi.book_id
      ${whereClause}
    `;

    // b.page_count eklendi
    const dataQuery = `
      SELECT
        b.book_id,
        b.book_name AS title,
        b.page_count,
        CASE
          WHEN b.book_writer IS NULL OR b.book_writer = '' THEN ARRAY[]::text[]
          ELSE string_to_array(b.book_writer, ', ')
        END AS authors,
        b.publisher,
        CASE
          WHEN b.book_genre IS NULL OR b.book_genre = '' THEN ARRAY[]::text[]
          ELSE string_to_array(b.book_genre, ', ')
        END AS categories,
        b.isbn,
        bi.quantity,
        bi.available_quantity
      FROM ${schemaName}.book_inventory bi
      INNER JOIN public.books b ON b.book_id = bi.book_id
      ${whereClause}
      ORDER BY b.book_name ASC
      LIMIT $${searchTerm ? 2 : 1}
      OFFSET $${searchTerm ? 3 : 2}
    `;

    const countResult = await pool.query(countQuery, countParams);
    const dataResult = await pool.query(dataQuery, dataParams);

    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / parsedLimit);

    const responsePayload = {
      success: true,
      data: dataResult.rows.map((row) => ({
        ...row,
        isbn: normalizeIsbn(row.isbn || ""),
        authors: normalizeStringArray(row.authors),
        categories: normalizeStringArray(row.categories),
      })),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
      },
      filters: {
        search: searchTerm,
      },
    };

    setSchoolBooksCache(
      {
        schoolCode,
        page: parsedPage,
        limit: parsedLimit,
        search: searchTerm,
      },
      responsePayload
    );

    return res.status(200).json(responsePayload);
  } catch (error) {
    next(error);
  }
};

const getSchoolBookDetail = async (req, res, next) => {
  try {
    const { schoolCode, bookId } = req.params;

    if (!/^\d+$/.test(String(schoolCode)) || !/^\d+$/.test(String(bookId))) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz parametre",
      });
    }

    const schoolCheck = await pool.query(
      "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );

    if (schoolCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const schemaName = `school_${schoolCode}`;

    // b.page_count eklendi
    const result = await pool.query(
      `
      SELECT
        b.book_id,
        b.book_name AS title,
        b.page_count,
        CASE
          WHEN b.book_writer IS NULL OR b.book_writer = '' THEN ARRAY[]::text[]
          ELSE string_to_array(b.book_writer, ', ')
        END AS authors,
        b.publisher,
        CASE
          WHEN b.book_genre IS NULL OR b.book_genre = '' THEN ARRAY[]::text[]
          ELSE string_to_array(b.book_genre, ', ')
        END AS categories,
        b.isbn,
        bi.quantity,
        bi.available_quantity
      FROM ${schemaName}.book_inventory bi
      INNER JOIN public.books b ON b.book_id = bi.book_id
      WHERE b.book_id = $1
      LIMIT 1
      `,
      [bookId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kitap okul envanterinde bulunamadı",
      });
    }

    const row = result.rows[0];

    return res.status(200).json({
      success: true,
      data: {
        ...row,
        isbn: normalizeIsbn(row.isbn || ""),
        authors: normalizeStringArray(row.authors),
        categories: normalizeStringArray(row.categories),
      },
    });
  } catch (error) {
    next(error);
  }
};

const addBookToSchoolInventory = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { schoolCode } = req.params;
    const {
      title,
      authors,
      publisher,
      categories,
      isbn,
      quantity,
      increaseQuantity = false,
      volumeCount = 0,
      pageCount = 0, // Request body'den alınıyor
    } = req.body;

    if (!/^\d+$/.test(String(schoolCode))) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz okul kodu",
      });
    }

    const normalizedIsbn = normalizeIsbn(isbn);

    if (!title || !normalizedIsbn) {
      return res.status(400).json({
        success: false,
        message: "Başlık ve ISBN zorunlu",
      });
    }

    const schoolCheck = await client.query(
      "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );

    if (schoolCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const schemaName = `school_${schoolCode}`;
    const normalizedAuthors = normalizeStringArray(authors);
    const normalizedCategories = normalizeStringArray(categories);

    const authorsText = normalizedAuthors.join(", ");
    const categoriesText = normalizedCategories.join(", ");
    const qty = Number(quantity) > 0 ? Number(quantity) : 1;
    const parsedVolumeCount = Number(volumeCount) > 1 ? Number(volumeCount) : 0;
    const volumeTitles = buildVolumeTitles(title, parsedVolumeCount);

    await client.query("BEGIN");

    const preparedVolumes = [];

    for (const volumeTitle of volumeTitles) {
      // pageCount parametresi eklendi
      const book = await findOrCreateBook({
        client,
        title: volumeTitle,
        authorsText,
        categoriesText,
        publisher,
        isbn: normalizedIsbn,
        pageCount,
      });

      const existingInventory = await client.query(
        `
        SELECT * FROM ${schemaName}.book_inventory
        WHERE book_id = $1
        LIMIT 1
        `,
        [book.book_id]
      );

      preparedVolumes.push({
        book,
        volumeTitle,
        existingInventory:
          existingInventory.rows.length > 0 ? existingInventory.rows[0] : null,
      });
    }

    const existingVolumes = preparedVolumes
      .filter((item) => item.existingInventory)
      .map((item) => ({
        bookId: item.book.book_id,
        title: item.volumeTitle,
        inventory: item.existingInventory,
      }));

    if (existingVolumes.length > 0 && !increaseQuantity) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        alreadyExistsInSchool: true,
        message:
          "Bu eserin bazı ciltleri okul envanterinde zaten var. Adet artırılsın mı?",
        data: existingVolumes,
      });
    }

    const createdOrUpdated = [];

    for (const item of preparedVolumes) {
      const { book, volumeTitle, existingInventory } = item;

      if (existingInventory) {
        const updated = await client.query(
          `
          UPDATE ${schemaName}.book_inventory
          SET quantity = quantity + $2,
              available_quantity = available_quantity + $2
          WHERE book_id = $1
          RETURNING *
          `,
          [book.book_id, qty]
        );

        createdOrUpdated.push({
          type: "updated",
          book_id: book.book_id,
          title: volumeTitle,
          inventory: updated.rows[0],
        });
      } else {
        const inserted = await client.query(
          `
          INSERT INTO ${schemaName}.book_inventory
          (book_id, quantity, available_quantity)
          VALUES ($1, $2, $2)
          RETURNING *
          `,
          [book.book_id, qty]
        );

        createdOrUpdated.push({
          type: "created",
          book_id: book.book_id,
          title: volumeTitle,
          inventory: inserted.rows[0],
        });
      }
    }

    await client.query("COMMIT");
    invalidateSchoolBooksCache(schoolCode);

    const createdCount = createdOrUpdated.filter((x) => x.type === "created").length;
    const updatedCount = createdOrUpdated.filter((x) => x.type === "updated").length;

    return res.status(201).json({
      success: true,
      message:
        volumeTitles.length > 1
          ? `${createdCount} cilt eklendi, ${updatedCount} cilt güncellendi`
          : updatedCount > 0
            ? "Kitap adedi artırıldı"
            : "Kitap okul envanterine eklendi",
      data: createdOrUpdated,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const updateSchoolBookQuantity = async (req, res, next) => {
  try {
    const { schoolCode, bookId } = req.params;
    const { quantity } = req.body;

    if (!/^\d+$/.test(String(schoolCode)) || !/^\d+$/.test(String(bookId))) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz parametre",
      });
    }

    const parsedQuantity = Number(quantity);

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: "quantity 0 veya daha büyük bir tam sayı olmalı",
      });
    }

    const schoolCheck = await pool.query(
      "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );

    if (schoolCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const schemaName = `school_${schoolCode}`;

    const existingInventory = await pool.query(
      `
      SELECT * FROM ${schemaName}.book_inventory
      WHERE book_id = $1
      LIMIT 1
      `,
      [bookId]
    );

    if (existingInventory.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kitap okul envanterinde bulunamadı",
      });
    }

    const updated = await pool.query(
      `
      UPDATE ${schemaName}.book_inventory
      SET quantity = $2,
          available_quantity = LEAST(available_quantity, $2)
      WHERE book_id = $1
      RETURNING *
      `,
      [bookId, parsedQuantity]
    );

    invalidateSchoolBooksCache(schoolCode);

    return res.status(200).json({
      success: true,
      message: "Kitap adedi güncellendi",
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const deleteSchoolBookFromInventory = async (req, res, next) => {
  try {
    const { schoolCode, bookId } = req.params;

    if (!/^\d+$/.test(String(schoolCode)) || !/^\d+$/.test(String(bookId))) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz parametre",
      });
    }

    const schoolCheck = await pool.query(
      "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );

    if (schoolCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const schemaName = `school_${schoolCode}`;

    const deleted = await pool.query(
      `
      DELETE FROM ${schemaName}.book_inventory
      WHERE book_id = $1
      RETURNING *
      `,
      [bookId]
    );

    if (deleted.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kitap okul envanterinde bulunamadı",
      });
    }

    invalidateSchoolBooksCache(schoolCode);

    return res.status(200).json({
      success: true,
      message: "Kitap sadece bu okulun envanterinden silindi",
    });
  } catch (error) {
    next(error);
  }
};

const exportSchoolBooks = async (req, res, next) => {
  try {
    const { schoolCode } = req.params;
    const { format = "excel", search = "" } = req.query;

    const books = await getSchoolBooksRaw(schoolCode, search);

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Kitaplar");

      sheet.columns = [
        { header: "Kitap Adı", key: "title", width: 40 },
        { header: "Yazar", key: "authors", width: 30 },
        { header: "Yayınevi", key: "publisher", width: 25 },
        { header: "ISBN", key: "isbn", width: 20 },
        { header: "Adet", key: "quantity", width: 10 },
        { header: "Sayfa", key: "pageCount", width: 10 }, // Excel'e sayfa sütunu da eklendi
      ];

      sheet.getRow(1).font = { bold: true };

      books.forEach((b) => {
        sheet.addRow({
          title: b.title || "",
          authors: normalizeStringArray(b.authors).join(", "),
          publisher: b.publisher || "",
          isbn: normalizeIsbn(b.isbn || ""),
          quantity: b.quantity ?? 0,
          pageCount: b.page_count ?? 0,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="kitap-listesi-${schoolCode}.xlsx"`
      );

      await workbook.xlsx.write(res);
      return res.end();
    }

    if (format === "pdf") {
      const doc = new PDFDocument({ margin: 30, size: "A4" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="kitap-listesi-${schoolCode}.pdf"`
      );

      doc.pipe(res);

      doc.fontSize(18).text(`Kitap Listesi - ${schoolCode}`, { align: "center" });
      doc.moveDown();

      books.forEach((b, i) => {
        const authorsText = normalizeStringArray(b.authors).join(", ") || "-";

        doc
          .fontSize(11)
          .text(`${i + 1}. ${b.title || "-"}`)
          .text(`Yazar: ${authorsText}`)
          .text(`Yayınevi: ${b.publisher || "-"}`)
          .text(`ISBN: ${normalizeIsbn(b.isbn || "") || "-"}`)
          .text(`Adet: ${b.quantity ?? 0} | Sayfa: ${b.page_count ?? 0}`) // PDF'e de sayfa bilgisi eklendi
          .moveDown();
      });

      doc.end();
      return;
    }

    return res.status(400).json({
      success: false,
      message: "Geçersiz format. 'excel' veya 'pdf' kullan.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  accessSchool,
  getSchoolBooks,
  getSchoolBookDetail,
  addBookToSchoolInventory,
  updateSchoolBookQuantity,
  deleteSchoolBookFromInventory,
  exportSchoolBooks,
};