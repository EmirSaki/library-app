import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';

class ManualBookPage extends StatefulWidget {
  final String schoolCode;

  const ManualBookPage({
    super.key,
    required this.schoolCode,
  });

  @override
  State<ManualBookPage> createState() => _ManualBookPageState();
}

class _ManualBookPageState extends State<ManualBookPage> {
  final TextEditingController isbnController = TextEditingController();
  final TextEditingController titleController = TextEditingController();
  final TextEditingController authorsController = TextEditingController();
  final TextEditingController publisherController = TextEditingController();
  final TextEditingController categoriesController = TextEditingController();
  final TextEditingController volumeCountController =
  TextEditingController(text: "0");
  final TextEditingController quantityController =
  TextEditingController(text: "1");
  final TextEditingController pageCountController = TextEditingController();

  bool isLoading = false;
  String statusMessage = "";
  Map<String, dynamic>? bookData;

  Future<void> searchBookByIsbn() async {
    final isbn = ApiService.normalizeIsbn(isbnController.text);

    if (isbn.isEmpty) {
      setState(() {
        statusMessage = "ISBN girmen lazım";
      });
      return;
    }

    if (isbn.length != 10 && isbn.length != 13) {
      setState(() {
        statusMessage = "ISBN 10 ya da 13 haneli olmalı";
      });
      return;
    }

    try {
      setState(() {
        isLoading = true;
        statusMessage = "Kitap aranıyor...";
        bookData = null;
      });

      final data = await ApiService.fetchBookByIsbn(isbn);

      if (!mounted) return;

      isbnController.text = (data["isbn"] ?? isbn).toString().toUpperCase();
      titleController.text = (data["title"]?.toString() ?? "").toUpperCase();
      authorsController.text = ApiService
          .normalizeStringList(data["authors"])
          .map((e) => e.toUpperCase())
          .join(", ");
      publisherController.text =
          (data["publisher"]?.toString() ?? "").toUpperCase();
      categoriesController.text = ApiService
          .normalizeStringList(data["categories"])
          .map((e) => e.toUpperCase())
          .join(", ");
      pageCountController.text = '${data["pageCount"] ?? 0}';
      volumeCountController.text = '${data["volumeCount"] ?? 0}';
      quantityController.text = "1";

      setState(() {
        bookData = data;
        statusMessage = "Kitap bulundu. Düzenleyip kaydedebilirsin.";
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        bookData = null;
        statusMessage = "Kitap bulunamadı. Bilgileri manuel girebilirsin.";
        titleController.clear();
        authorsController.clear();
        publisherController.clear();
        categoriesController.clear();
        pageCountController.clear();
        volumeCountController.text = "0";
        quantityController.text = "1";
      });
    } finally {
      if (!mounted) return;

      setState(() {
        isLoading = false;
      });
    }
  }

  Future<void> saveBook({bool increaseQuantity = false}) async {
    final isbn = ApiService.normalizeIsbn(isbnController.text);
    final title = titleController.text.trim().toUpperCase();

    final authors = ApiService
        .normalizeStringList(authorsController.text)
        .map((e) => e.toUpperCase())
        .toList();

    final publisher = publisherController.text.trim().toUpperCase();

    final categories = ApiService
        .normalizeStringList(categoriesController.text)
        .map((e) => e.toUpperCase())
        .toList();

    final volumeCount = int.tryParse(volumeCountController.text.trim()) ?? 0;
    final quantity = int.tryParse(quantityController.text.trim()) ?? 1;
    final pageCount = int.tryParse(pageCountController.text.trim()) ?? 0;

    if (isbn.isEmpty || (isbn.length != 10 && isbn.length != 13)) {
      setState(() {
        statusMessage = "Geçerli bir ISBN gir";
      });
      return;
    }

    if (title.isEmpty) {
      setState(() {
        statusMessage = "Kitap adı boş olamaz";
      });
      return;
    }

    if (quantity <= 0) {
      setState(() {
        statusMessage = "Adet en az 1 olmalı";
      });
      return;
    }

    try {
      setState(() {
        isLoading = true;
        statusMessage = increaseQuantity
            ? "Adet artırılıyor..."
            : "Kitap kaydediliyor...";
      });

      final result = await ApiService.saveBook(
        bookData: {
          "title": title,
          "authors": authors,
          "publisher": publisher,
          "categories": categories,
          "isbn": isbn,
          "schoolCode": widget.schoolCode,
          "volumeCount": volumeCount,
          "quantity": quantity,
          "pageCount": pageCount,
          "physicalDescription": pageCount > 0 ? "$pageCount sayfa" : "",
        },
        increaseQuantity: increaseQuantity,
      );

      if (!mounted) return;

      if (result["success"] == true) {
        setState(() {
          statusMessage = result["message"] ?? "İşlem başarılı";
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result["message"] ?? "İşlem başarılı")),
        );
        return;
      }

      final alreadyExists =
          result["alreadyExistsInSchool"] == true ||
              result["alreadyExists"] == true;

      if (alreadyExists) {
        await showIncreaseQuantityDialog();
        return;
      }

      setState(() {
        statusMessage = result["message"] ?? "Kitap kaydedilemedi";
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result["message"] ?? "Kitap kaydedilemedi")),
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        statusMessage = "Kaydetme hatası: $e";
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Hata: $e")),
      );
    } finally {
      if (!mounted) return;

      setState(() {
        isLoading = false;
      });
    }
  }

  Future<void> showIncreaseQuantityDialog() async {
    final shouldIncrease = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text("Kitap zaten kayıtlı"),
          content: const Text(
            "Bu kitap okul envanterinde zaten var. Adet artırılsın mı?",
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text("Hayır"),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text("Evet"),
            ),
          ],
        );
      },
    );

    if (shouldIncrease == true) {
      await saveBook(increaseQuantity: true);
    } else {
      if (!mounted) return;
      setState(() {
        statusMessage = "İşlem iptal edildi";
      });
    }
  }

  Widget buildBookForm() {
    return Container(
      margin: const EdgeInsets.only(top: 24),
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black87,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          buildInput(
            titleController,
            "Kitap Adı",
            textCapitalization: TextCapitalization.sentences,
          ),
          const SizedBox(height: 12),
          buildInput(
            authorsController,
            "Yazarlar (virgülle ayır)",
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 12),
          buildInput(
            publisherController,
            "Yayınevi",
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 12),
          buildInput(
            categoriesController,
            "Kategoriler (virgülle ayır)",
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 12),
          buildInput(
            pageCountController,
            "Sayfa Sayısı",
            isNumber: true,
            textCapitalization: TextCapitalization.none,
          ),
          const SizedBox(height: 12),
          buildInput(
            volumeCountController,
            "Cilt Sayısı",
            isNumber: true,
            textCapitalization: TextCapitalization.none,
          ),
          const SizedBox(height: 12),
          buildInput(
            quantityController,
            "Adet",
            isNumber: true,
            textCapitalization: TextCapitalization.none,
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: isLoading ? null : () => saveBook(),
              child: const Text("Kitabı Kaydet"),
            ),
          ),
        ],
      ),
    );
  }

  Widget buildInput(
      TextEditingController controller,
      String label, {
        bool isNumber = false,
        TextCapitalization textCapitalization = TextCapitalization.sentences,
      }) {
    return TextField(
      controller: controller,
      keyboardType: isNumber ? TextInputType.number : TextInputType.text,
      textCapitalization: textCapitalization,
      inputFormatters: [
        if (isNumber) FilteringTextInputFormatter.digitsOnly,
      ],
      style: const TextStyle(color: Colors.white),
      decoration: const InputDecoration(
        labelStyle: TextStyle(color: Colors.white70),
      ).copyWith(labelText: label),
    );
  }

  @override
  void dispose() {
    isbnController.dispose();
    titleController.dispose();
    authorsController.dispose();
    publisherController.dispose();
    categoriesController.dispose();
    volumeCountController.dispose();
    quantityController.dispose();
    pageCountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("Manuel Ekleme - ${widget.schoolCode}"),
      ),
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFFDCE6F5),
              Color(0xFFC9D6EE),
              Color(0xFFB8C8E6),
            ],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 10),
                const Center(
                  child: Text(
                    "ISBN Numarasını\nGiriniz",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF5A5A5A),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Center(
                  child: Text(
                    "Okul Kodu: ${widget.schoolCode}",
                    style: const TextStyle(
                      fontSize: 16,
                      color: Color(0xFF5A5A5A),
                    ),
                  ),
                ),
                const SizedBox(height: 35),
                const Text(
                  "ISBN:",
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: Colors.black,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: isbnController,
                  keyboardType: TextInputType.text,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(
                    hintText: "9789756227740",
                    hintStyle: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey,
                    ),
                    filled: true,
                    fillColor: const Color(0xFFECECEC),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 14,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(6),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: 95,
                  height: 42,
                  child: ElevatedButton(
                    onPressed: isLoading ? null : searchBookByIsbn,
                    child: isLoading
                        ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                        : const Text("ARA"),
                  ),
                ),
                const SizedBox(height: 16),
                if (statusMessage.isNotEmpty)
                  Text(
                    statusMessage,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                buildBookForm(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}