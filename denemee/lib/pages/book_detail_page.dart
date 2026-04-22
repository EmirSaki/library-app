import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/book.dart';
import '../services/api_service.dart';

class BookDetailPage extends StatefulWidget {
  final String schoolCode;
  final Book book;

  const BookDetailPage({
    super.key,
    required this.schoolCode,
    required this.book,
  });

  @override
  State<BookDetailPage> createState() => _BookDetailPageState();
}

class _BookDetailPageState extends State<BookDetailPage> {
  final TextEditingController quantityController = TextEditingController();

  bool isLoading = true;
  bool isSaving = false;
  Book? book;

  @override
  void initState() {
    super.initState();
    loadBookDetail();
  }

  Future<void> loadBookDetail() async {
    if (widget.book.bookId == null) {
      if (!mounted) return;
      setState(() {
        isLoading = false;
        book = widget.book;
        quantityController.text = (widget.book.quantity ?? 0).toString();
      });
      return;
    }

    try {
      final loadedBook = await ApiService.getSchoolBookDetail(
        widget.schoolCode,
        widget.book.bookId!,
      );

      if (!mounted) return;

      setState(() {
        book = loadedBook;
        quantityController.text =
            (loadedBook.quantity ?? 0).toString();
        isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        isLoading = false;
        book = widget.book;
        quantityController.text =
            (widget.book.quantity ?? 0).toString();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Detay yüklenemedi: $e")),
      );
    }
  }

  Future<void> saveQuantity() async {
    if (widget.book.bookId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Kitap kimliği bulunamadı")),
      );
      return;
    }

    final quantity =
    int.tryParse(quantityController.text.trim());

    if (quantity == null || quantity < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Geçerli bir adet gir")),
      );
      return;
    }

    try {
      setState(() {
        isSaving = true;
      });

      final result = await ApiService.updateSchoolBookQuantity(
        schoolCode: widget.schoolCode,
        bookId: widget.book.bookId!,
        quantity: quantity,
      );

      if (!mounted) return;

      if (result["success"] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result["message"] ?? "Kaydedildi")),
        );
        Navigator.pop(context, true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result["message"] ?? "Güncellenemedi")),
        );
      }
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Hata: $e")),
      );
    } finally {
      if (!mounted) return;

      setState(() {
        isSaving = false;
      });
    }
  }

  Future<void> deleteBook() async {
    if (widget.book.bookId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Kitap kimliği bulunamadı")),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text("Kitabı Sil"),
          content: const Text(
            "Bu kitap sadece bu okulun envanterinden silinecek. Emin misin?",
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text("Vazgeç"),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text("Sil"),
            ),
          ],
        );
      },
    );

    if (confirm != true) return;

    try {
      setState(() {
        isSaving = true;
      });

      final result = await ApiService.deleteSchoolBook(
        schoolCode: widget.schoolCode,
        bookId: widget.book.bookId!,
      );

      if (!mounted) return;

      if (result["success"] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result["message"] ?? "Silindi")),
        );
        Navigator.pop(context, true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result["message"] ?? "Silinemedi")),
        );
      }
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Hata: $e")),
      );
    } finally {
      if (!mounted) return;

      setState(() {
        isSaving = false;
      });
    }
  }

  @override
  void dispose() {
    quantityController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currentBook = book ?? widget.book;

    final authorsText =
    currentBook.authors.isNotEmpty
        ? currentBook.authors.join(", ")
        : "Bilinmiyor";

    final categoriesText =
    currentBook.categories.isNotEmpty
        ? currentBook.categories.join(", ")
        : "Bilinmiyor";

    final pageCountText =
    currentBook.pageCount > 0
        ? currentBook.pageCount.toString()
        : "Bilinmiyor";

    final volumeCountText =
    currentBook.volumeCount > 0
        ? currentBook.volumeCount.toString()
        : "Yok";

    return Scaffold(
      appBar: AppBar(
        title: const Text("Kitap Künyesi"),
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildReadOnlyField("Kitap Adı", currentBook.title),
            _buildReadOnlyField("Yazar", authorsText),
            _buildReadOnlyField(
              "Yayınevi",
              currentBook.publisher.isNotEmpty
                  ? currentBook.publisher
                  : "Bilinmiyor",
            ),
            _buildReadOnlyField("Kategori", categoriesText),
            _buildReadOnlyField(
              "ISBN",
              currentBook.isbn.isNotEmpty
                  ? currentBook.isbn
                  : "Yok",
            ),
            _buildReadOnlyField("Sayfa Sayısı", pageCountText),
            _buildReadOnlyField("Cilt Sayısı", volumeCountText),

            const SizedBox(height: 12),

            TextField(
              controller: quantityController,
              keyboardType: TextInputType.number,
              textCapitalization: TextCapitalization.none,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
              ],
              decoration: const InputDecoration(
                labelText: "Kitap Adedi",
                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: isSaving ? null : saveQuantity,
                child: isSaving
                    ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                  ),
                )
                    : const Text("Kaydet"),
              ),
            ),

            const SizedBox(height: 12),

            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: isSaving ? null : deleteBook,
                child: const Text("Kitabı Sil"),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReadOnlyField(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 16,
          ),
        ),
        child: SelectableText(
          value,
          style: const TextStyle(
            fontSize: 16,
            color: Colors.black87,
          ),
        ),
      ),
    );
  }
}