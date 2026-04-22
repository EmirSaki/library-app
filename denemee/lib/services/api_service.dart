import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../models/book.dart';

class ApiService {
  static const String baseUrl =
      "https://library-api-346058361420.europe-west1.run.app";
  static const MethodChannel _channel = MethodChannel('library_export_channel');

  static String normalizeIsbn(String value) {
    return value.replaceAll(RegExp(r'[^0-9Xx]'), '').toUpperCase().trim();
  }

  static List<String> normalizeStringList(dynamic value) {
    if (value == null) return [];

    if (value is List) {
      return value
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
    }

    if (value is String && value.trim().isNotEmpty) {
      return value
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
    }

    return [];
  }

  static String normalizeTurkishText(String text) {
    return text
        .toLowerCase()
        .replaceAll('ı', 'i')
        .replaceAll('İ', 'i')
        .replaceAll('ş', 's')
        .replaceAll('Ş', 's')
        .replaceAll('ğ', 'g')
        .replaceAll('Ğ', 'g')
        .replaceAll('ü', 'u')
        .replaceAll('Ü', 'u')
        .replaceAll('ö', 'o')
        .replaceAll('Ö', 'o')
        .replaceAll('ç', 'c')
        .replaceAll('Ç', 'c');
  }

  static Map<String, dynamic> _decodeJsonResponse(http.Response response) {
    final rawBody = response.body.trim();

    if (rawBody.isEmpty) {
      throw Exception("Sunucudan boş yanıt geldi");
    }

    try {
      final decoded = jsonDecode(rawBody);

      if (decoded is Map<String, dynamic>) {
        return decoded;
      }

      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }

      throw Exception("Sunucudan beklenmeyen veri formatı geldi");
    } catch (_) {
      throw Exception("Sunucudan geçersiz yanıt geldi (${response.statusCode})");
    }
  }

  static String _extractErrorMessage(
      http.Response response,
      Map<String, dynamic>? decoded,
      ) {
    final message = decoded?["message"]?.toString().trim();

    if (message != null && message.isNotEmpty) {
      return message;
    }

    switch (response.statusCode) {
      case 400:
        return "Geçersiz istek";
      case 401:
        return "Yetkisiz işlem";
      case 403:
        return "Bu işlem için izin yok";
      case 404:
        return "Kayıt bulunamadı";
      case 409:
        return "Çakışan kayıt bulundu";
      case 422:
        return "Gönderilen veri işlenemedi";
      case 500:
        return "Sunucu hatası oluştu";
      case 502:
      case 503:
      case 504:
        return "Sunucuya şu an ulaşılamıyor";
      default:
        return "İşlem başarısız (${response.statusCode})";
    }
  }

  static Map<String, dynamic> _validateSuccessResponse(http.Response response) {
    final decoded = _decodeJsonResponse(response);

    if (response.statusCode >= 200 &&
        response.statusCode < 300 &&
        decoded["success"] == true) {
      return decoded;
    }

    throw Exception(_extractErrorMessage(response, decoded));
  }

  static Future<Map<String, dynamic>> fetchBookByIsbn(String isbn) async {
    final normalizedIsbn = normalizeIsbn(isbn);
    final url = Uri.parse("$baseUrl/api/books/isbn/$normalizedIsbn");

    final response = await http.get(url);
    final decoded = _validateSuccessResponse(response);
    final data = Map<String, dynamic>.from(decoded["data"] ?? {});

    return {
      "title": (data["title"] ?? "").toString(),
      "authors": normalizeStringList(data["authors"]),
      "publisher": (data["publisher"] ?? "").toString(),
      "categories": normalizeStringList(data["categories"]),
      "isbn": normalizeIsbn((data["isbn"] ?? normalizedIsbn).toString()),
      "isbn10": (data["isbn10"] ?? "").toString(),
      "isbn13": (data["isbn13"] ?? "").toString(),
      "pageCount": int.tryParse('${data["pageCount"] ?? 0}') ?? 0,
      "volumeCount": int.tryParse('${data["volumeCount"] ?? 0}') ?? 0,
      "physicalDescription": (data["physicalDescription"] ?? "").toString(),
      "source": (data["source"] ?? "").toString(),
    };
  }

  static Future<Map<String, dynamic>> saveBook({
    required Map<String, dynamic> bookData,
    bool increaseQuantity = false,
  }) async {
    final schoolCode = (bookData["schoolCode"] ?? "").toString();
    final url = Uri.parse("$baseUrl/api/schools/$schoolCode/books");

    final response = await http.post(
      url,
      headers: {
        "Content-Type": "application/json",
      },
      body: jsonEncode({
        "title": (bookData["title"] ?? "").toString().trim(),
        "authors": normalizeStringList(bookData["authors"]),
        "publisher": (bookData["publisher"] ?? "").toString().trim(),
        "categories": normalizeStringList(bookData["categories"]),
        "isbn": normalizeIsbn((bookData["isbn"] ?? "").toString()),
        "quantity": int.tryParse('${bookData["quantity"] ?? 1}') ?? 1,
        "increaseQuantity": increaseQuantity,
        "pageCount": int.tryParse('${bookData["pageCount"] ?? 0}') ?? 0,
        "volumeCount": (() {
          final count = int.tryParse('${bookData["volumeCount"] ?? 0}') ?? 0;
          return count > 1 ? count : 0;
        })(),
        "physicalDescription":
        (bookData["physicalDescription"] ?? "").toString(),
      }),
    );

    final decoded = _decodeJsonResponse(response);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    throw Exception(_extractErrorMessage(response, decoded));
  }

  static Future<Map<String, dynamic>> loginUser({
    required String schoolCode,
    required String email,
    required String password,
  }) async {
    final url = Uri.parse("$baseUrl/api/users/login");

    final response = await http.post(
      url,
      headers: {
        "Content-Type": "application/json",
      },
      body: jsonEncode({
        "schoolCode": schoolCode,
        "email": email,
        "password": password,
      }),
    );

    final decoded = _validateSuccessResponse(response);
    return Map<String, dynamic>.from(decoded["data"] ?? {});
  }

  static Future<Map<String, dynamic>> getSchoolBooks({
    required String schoolCode,
    int page = 1,
    int limit = 30,
    String search = "",
  }) async {
    final url = Uri.parse(
      "$baseUrl/api/schools/$schoolCode/books?page=$page&limit=$limit&search=${Uri.encodeComponent(search)}",
    );

    final response = await http.get(url);
    final decoded = _validateSuccessResponse(response);

    final List data = decoded["data"] ?? [];

    return {
      "books": data.map((e) => Book.fromJson(e)).toList(),
      "pagination": Map<String, dynamic>.from(decoded["pagination"] ?? {}),
    };
  }

  static Future<Book> getSchoolBookDetail(String schoolCode, int bookId) async {
    final url = Uri.parse("$baseUrl/api/schools/$schoolCode/books/$bookId");

    final response = await http.get(url);
    final decoded = _validateSuccessResponse(response);

    return Book.fromJson(
      Map<String, dynamic>.from(decoded["data"] ?? {}),
    );
  }

  static Future<Map<String, dynamic>> updateSchoolBookQuantity({
    required String schoolCode,
    required int bookId,
    required int quantity,
  }) async {
    final url = Uri.parse("$baseUrl/api/schools/$schoolCode/books/$bookId");

    final response = await http.patch(
      url,
      headers: {
        "Content-Type": "application/json",
      },
      body: jsonEncode({
        "quantity": quantity,
      }),
    );

    final decoded = _decodeJsonResponse(response);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    throw Exception(_extractErrorMessage(response, decoded));
  }

  static Future<Map<String, dynamic>> deleteSchoolBook({
    required String schoolCode,
    required int bookId,
  }) async {
    final url = Uri.parse("$baseUrl/api/schools/$schoolCode/books/$bookId");

    final response = await http.delete(
      url,
      headers: {
        "Content-Type": "application/json",
      },
    );

    final decoded = _decodeJsonResponse(response);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    throw Exception(_extractErrorMessage(response, decoded));
  }

  static Future<String> exportBooks({
    required String schoolCode,
    required String format,
  }) async {
    final normalizedFormat = format.toLowerCase();
    final extension = normalizedFormat == "pdf" ? "pdf" : "xlsx";
    final mimeType = normalizedFormat == "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    final url = Uri.parse(
      "$baseUrl/api/schools/$schoolCode/books/export?format=$normalizedFormat",
    );

    final response = await http.get(url);

    if (response.statusCode != 200) {
      Map<String, dynamic>? decoded;

      try {
        decoded = _decodeJsonResponse(response);
      } catch (_) {
        decoded = null;
      }

      throw Exception(_extractErrorMessage(response, decoded));
    }

    final Uint8List bytes = response.bodyBytes;
    final fileName = "kitap-listesi-$schoolCode.$extension";

    final savedPath = await _channel.invokeMethod<String>(
      'saveFileToDownloads',
      {
        'fileName': fileName,
        'mimeType': mimeType,
        'bytes': bytes,
      },
    );

    if (savedPath == null || savedPath.isEmpty) {
      throw Exception("Dosya kaydedilemedi");
    }

    return savedPath;
  }
}