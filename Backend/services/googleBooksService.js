const axios = require("axios");

const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeIsbn(value) {
  return String(value || "")
    .replace(/[^0-9Xx]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => cleanText(item))
      .filter(Boolean);
  }
  return fallback;
}

function extractIsbnIdentifiers(industryIdentifiers = []) {
  const isbn10 =
    industryIdentifiers.find((id) => id.type === "ISBN_10")?.identifier || "";
  const isbn13 =
    industryIdentifiers.find((id) => id.type === "ISBN_13")?.identifier || "";

  return {
    isbn10: normalizeIsbn(isbn10),
    isbn13: normalizeIsbn(isbn13),
  };
}

function mapGoogleBook(googleItem, requestedIsbn) {
  const info = googleItem?.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const { isbn10, isbn13 } = extractIsbnIdentifiers(identifiers);

  const authors = normalizeArray(info.authors, []);
  const categories = normalizeArray(info.categories, []);
  const title = cleanText(info.title);
  const publisher = cleanText(info.publisher) || "Bilinmiyor";
  const normalizedRequestedIsbn = normalizeIsbn(requestedIsbn);

  const finalIsbn = isbn13 || isbn10 || normalizedRequestedIsbn;
  const pageCount = Number(info.pageCount) || 0;

  return {
    title,
    authors,
    publisher,
    categories,
    isbn: finalIsbn,
    isbn10,
    isbn13,
    pageCount,
    physicalDescription: pageCount > 0 ? `${pageCount} sayfa` : "Bilgi yok",
    volumeCount: 0,
    hasVolumes: false,
    volumes: [],
  };
}

async function getBookByISBN(isbn) {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return null;

  console.log("[GOOGLE_BOOKS_FETCH] Sorgulanıyor:", normalized);

  try {
    let url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${normalized}`;
    if (GOOGLE_BOOKS_API_KEY) {
      url += `&key=${GOOGLE_BOOKS_API_KEY}`;
    }

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data?.totalItems > 0 && Array.isArray(response.data.items)) {
      const bestMatch = response.data.items.find((item) => {
        const ids = item?.volumeInfo?.industryIdentifiers || [];
        const { isbn10, isbn13 } = extractIsbnIdentifiers(ids);
        return isbn10 === normalized || isbn13 === normalized;
      }) || response.data.items[0];

      console.log("[GOOGLE_BOOKS_SUCCESS] Kitap bulundu");
      return mapGoogleBook(bestMatch, normalized);
    }

    console.warn("[GOOGLE_BOOKS_NOT_FOUND] ISBN bulunamadı:", normalized);
    return null;
  } catch (error) {
    console.error("[GOOGLE_BOOKS_ERROR]", error.message);
    return null;
  }
}

module.exports = { getBookByISBN };