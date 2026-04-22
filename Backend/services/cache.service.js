const { LRUCache } = require("lru-cache");

const ISBN_SUCCESS_TTL = 1000 * 60 * 10; // 10 dakika
const ISBN_NOT_FOUND_TTL = 1000 * 60 * 2; // 2 dakika
const SCHOOL_BOOKS_TTL = 1000 * 60 * 2; // 2 dakika

const isbnCache = new LRUCache({
  max: 5000,
  ttl: ISBN_SUCCESS_TTL,
});

const isbnNotFoundCache = new LRUCache({
  max: 3000,
  ttl: ISBN_NOT_FOUND_TTL,
});

const schoolBooksCache = new LRUCache({
  max: 2000,
  ttl: SCHOOL_BOOKS_TTL,
});

function now() {
  return new Date().toISOString();
}

function logCache(event, payload = {}) {
  console.log(`[CACHE][${now()}][${event}] ${JSON.stringify(payload)}`);
}

function normalizeCacheIsbn(value = "") {
  return String(value).replace(/[^0-9Xx]/g, "").toUpperCase().trim();
}

function getIsbnCacheKey(isbn) {
  return `isbn:${normalizeCacheIsbn(isbn)}`;
}

function getIsbnNotFoundCacheKey(isbn) {
  return `isbn:not_found:${normalizeCacheIsbn(isbn)}`;
}

function getSchoolBooksCacheKey({ schoolCode, page, limit, search }) {
  return `schoolBooks:${schoolCode}:${page}:${limit}:${String(search || "")
    .trim()
    .toLowerCase()}`;
}

function getIsbnFromCache(isbn) {
  const normalizedIsbn = normalizeCacheIsbn(isbn);
  const successKey = getIsbnCacheKey(normalizedIsbn);
  const notFoundKey = getIsbnNotFoundCacheKey(normalizedIsbn);

  const successValue = isbnCache.get(successKey);
  if (successValue) {
    logCache("ISBN_HIT", { key: successKey, isbn: normalizedIsbn, type: "success" });
    return {
      hit: true,
      found: true,
      data: successValue,
    };
  }

  const notFoundValue = isbnNotFoundCache.get(notFoundKey);
  if (notFoundValue) {
    logCache("ISBN_HIT", { key: notFoundKey, isbn: normalizedIsbn, type: "not_found" });
    return {
      hit: true,
      found: false,
      data: null,
    };
  }

  logCache("ISBN_MISS", { isbn: normalizedIsbn });
  return {
    hit: false,
    found: false,
    data: null,
  };
}

function setIsbnCache(isbn, data, source = "unknown") {
  const normalizedIsbn = normalizeCacheIsbn(isbn);
  const successKey = getIsbnCacheKey(normalizedIsbn);
  const notFoundKey = getIsbnNotFoundCacheKey(normalizedIsbn);

  isbnNotFoundCache.delete(notFoundKey);
  isbnCache.set(successKey, data);

  logCache("ISBN_SET", {
    key: successKey,
    isbn: normalizedIsbn,
    source,
    type: "success",
    size: isbnCache.size,
  });
}

function setIsbnNotFoundCache(isbn, source = "unknown") {
  const normalizedIsbn = normalizeCacheIsbn(isbn);
  const successKey = getIsbnCacheKey(normalizedIsbn);
  const notFoundKey = getIsbnNotFoundCacheKey(normalizedIsbn);

  isbnCache.delete(successKey);
  isbnNotFoundCache.set(notFoundKey, true);

  logCache("ISBN_SET", {
    key: notFoundKey,
    isbn: normalizedIsbn,
    source,
    type: "not_found",
    size: isbnNotFoundCache.size,
  });
}

function deleteIsbnCache(isbn) {
  const normalizedIsbn = normalizeCacheIsbn(isbn);
  const successKey = getIsbnCacheKey(normalizedIsbn);
  const notFoundKey = getIsbnNotFoundCacheKey(normalizedIsbn);

  const successDeleted = isbnCache.delete(successKey);
  const notFoundDeleted = isbnNotFoundCache.delete(notFoundKey);

  logCache("ISBN_DELETE", {
    isbn: normalizedIsbn,
    successDeleted,
    notFoundDeleted,
    successSize: isbnCache.size,
    notFoundSize: isbnNotFoundCache.size,
  });
}

function getSchoolBooksFromCache({ schoolCode, page, limit, search }) {
  const key = getSchoolBooksCacheKey({ schoolCode, page, limit, search });
  const value = schoolBooksCache.get(key);

  if (value) {
    logCache("SCHOOL_BOOKS_HIT", {
      key,
      schoolCode,
      page,
      limit,
      search,
    });
    return value;
  }

  logCache("SCHOOL_BOOKS_MISS", {
    key,
    schoolCode,
    page,
    limit,
    search,
  });
  return null;
}

function setSchoolBooksCache({ schoolCode, page, limit, search }, data) {
  const key = getSchoolBooksCacheKey({ schoolCode, page, limit, search });
  schoolBooksCache.set(key, data);

  logCache("SCHOOL_BOOKS_SET", {
    key,
    schoolCode,
    page,
    limit,
    search,
    size: schoolBooksCache.size,
  });
}

function invalidateSchoolBooksCache(schoolCode) {
  const prefix = `schoolBooks:${schoolCode}:`;
  let deletedCount = 0;

  for (const key of schoolBooksCache.keys()) {
    if (String(key).startsWith(prefix)) {
      schoolBooksCache.delete(key);
      deletedCount += 1;
    }
  }

  logCache("SCHOOL_BOOKS_INVALIDATE", {
    schoolCode,
    deletedCount,
    size: schoolBooksCache.size,
  });
}

function getCacheStats() {
  return {
    isbnCache: {
      size: isbnCache.size,
      max: 5000,
      ttlMs: ISBN_SUCCESS_TTL,
    },
    isbnNotFoundCache: {
      size: isbnNotFoundCache.size,
      max: 3000,
      ttlMs: ISBN_NOT_FOUND_TTL,
    },
    schoolBooksCache: {
      size: schoolBooksCache.size,
      max: 2000,
      ttlMs: SCHOOL_BOOKS_TTL,
    },
  };
}

module.exports = {
  normalizeCacheIsbn,
  getIsbnCacheKey,
  getIsbnNotFoundCacheKey,
  getSchoolBooksCacheKey,
  getIsbnFromCache,
  setIsbnCache,
  setIsbnNotFoundCache,
  deleteIsbnCache,
  getSchoolBooksFromCache,
  setSchoolBooksCache,
  invalidateSchoolBooksCache,
  getCacheStats,
  logCache,
};