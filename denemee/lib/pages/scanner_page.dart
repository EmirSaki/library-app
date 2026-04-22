import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_service.dart';

class ScannerPage extends StatefulWidget {
  final String schoolCode;

  const ScannerPage({
    super.key,
    required this.schoolCode,
  });

  @override
  State<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage> {
  bool isScanned = false;
  bool isLoading = false;
  bool _isHandlingDetection = false;
  Timer? notFoundTimer;

  String statusMessage = "Barkodu okut";
  Map<String, dynamic>? bookData;

  final TextEditingController titleController = TextEditingController();
  final TextEditingController authorsController = TextEditingController();
  final TextEditingController publisherController = TextEditingController();
  final TextEditingController categoriesController = TextEditingController();
  final TextEditingController isbnController = TextEditingController();
  final TextEditingController pageCountController = TextEditingController();
  final TextEditingController volumeController =
  TextEditingController(text: "0");
  final TextEditingController quantityController =
  TextEditingController(text: "1");

  final MobileScannerController scannerController = MobileScannerController();

  @override
  void initState() {
    super.initState();
    startNotFoundTimer();
  }

  void startNotFoundTimer() {
    notFoundTimer?.cancel();
    notFoundTimer = Timer(const Duration(seconds: 15), () {
      if (!mounted) return;

      if (!isScanned && bookData == null) {
        setState(() {
          statusMessage = "Barkod bulunamadı";
        });
      }
    });
  }

  String normalizeIsbn(String value) {
    return value.replaceAll(RegExp(r'[^0-9Xx]'), '').toUpperCase().trim();
  }

  bool isValidIsbnCandidate(String value) {
    final normalized = normalizeIsbn(value);
    return normalized.length == 10 || normalized.length == 13;
  }

  Future<void> fetchBook(String isbn) async {
    final normalizedIsbn = normalizeIsbn(isbn);

    if (!isValidIsbnCandidate(normalizedIsbn)) {
      if (!mounted) return;

      setState(() {
        bookData = null;
        titleController.clear();
        authorsController.clear();
        publisherController.clear();
        categoriesController.clear();
        isbnController.clear();
        pageCountController.clear();
        volumeController.text = "0";
        quantityController.text = "1";
        statusMessage = "Bu barkod geçerli bir ISBN gibi görünmüyor";
        isLoading = false;
        isScanned = false;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        await scannerController.start();
        startNotFoundTimer();
      });
      return;
    }

    try {
      setState(() {
        isLoading = true;
        statusMessage = "Kitap sorgulanıyor...";
      });

      final data = await ApiService.fetchBookByIsbn(normalizedIsbn);

      if (!mounted) return;

      titleController.text = (data["title"]?.toString() ?? "").toUpperCase();

      authorsController.text = ApiService.normalizeStringList(data["authors"])
          .map((e) => e.toUpperCase())
          .join(", ");

      publisherController.text =
          (data["publisher"]?.toString() ?? "").toUpperCase();

      categoriesController.text = ApiService.normalizeStringList(
          data["categories"])
          .map((e) => e.toUpperCase())
          .join(", ");

      isbnController.text =
          normalizeIsbn((data["isbn"] ?? normalizedIsbn).toString());

      pageCountController.text = '${data["pageCount"] ?? 0}';
      volumeController.text = '${data["volumeCount"] ?? 0}';
      quantityController.text = "1";

      setState(() {
        bookData = data;
        statusMessage = "Kitap bulundu. Düzenleyip kaydedebilirsin.";
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        bookData = null;
        titleController.clear();
        authorsController.clear();
        publisherController.clear();
        categoriesController.clear();
        isbnController.text = normalizeIsbn(normalizedIsbn);
        pageCountController.clear();
        volumeController.text = "0";
        quantityController.text = "1";
        statusMessage = "Kitap bulunamadı. Bilgileri düzenleyebilirsin.";
      });
    } finally {
      if (!mounted) return;

      setState(() {
        isLoading = false;
      });
    }
  }

  Future<void> saveBook({bool increaseQuantity = false}) async {
    final title = titleController.text.trim().toUpperCase();

    final authors = ApiService.normalizeStringList(authorsController.text)
        .map((e) => e.toUpperCase())
        .toList();

    final publisher = publisherController.text.trim().toUpperCase();

    final categories = ApiService.normalizeStringList(categoriesController.text)
        .map((e) => e.toUpperCase())
        .toList();

    final isbn = normalizeIsbn(isbnController.text);
    final volumeCount = int.tryParse(volumeController.text.trim()) ?? 0;
    final quantity = int.tryParse(quantityController.text.trim()) ?? 1;
    final pageCount = int.tryParse(pageCountController.text.trim()) ?? 0;

    if (title.isEmpty) {
      setState(() {
        statusMessage = "Kitap adı boş olamaz";
      });
      return;
    }

    if (isbn.isEmpty || (isbn.length != 10 && isbn.length != 13)) {
      setState(() {
        statusMessage = "Geçerli ISBN gir";
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

      final decoded = await ApiService.saveBook(
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

      if (decoded["success"] == true) {
        setState(() {
          statusMessage = decoded["message"] ?? "İşlem başarılı";
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(decoded["message"] ?? "İşlem başarılı")),
        );
        return;
      }

      // Backend normal JSON dönerse diye burası duruyor
      final alreadyExists = decoded["alreadyExists"] == true ||
          decoded["alreadyExistsInSchool"] == true;

      if (alreadyExists) {
        setState(() {
          statusMessage = decoded["message"] ?? "Kitap zaten kayıtlı";
        });

        await showIncreaseQuantityDialog();
        return;
      }

      setState(() {
        statusMessage = decoded["message"] ?? "Kitap kaydedilemedi";
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(decoded["message"] ?? "Kitap kaydedilemedi")),
      );
    } catch (e) {
      if (!mounted) return;

      final errorMessage = e.toString().toLowerCase();

      // İŞTE ÇÖZÜM BURADA: Backend'den gelen Exception metnini kontrol ediyoruz
      if (errorMessage.contains("zaten var") || errorMessage.contains("artırılsın") || errorMessage.contains("zaten kayıtlı")) {
        setState(() {
          statusMessage = "Kitap zaten kayıtlı";
        });
        await showIncreaseQuantityDialog();
        return;
      }

      setState(() {
        statusMessage = "Kaydetme hatası: $e";
      });

      // Eğer hata "zaten var" hatası değilse (örn: internet koptuysa) siyah mesajı göster
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
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          title: const Text(
            "Kitap Zaten Kayıtlı",
            textAlign: TextAlign.center,
          ),
          content: const Text(
            "Bu kitap okul envanterinde zaten var.\nAdet artırılsın mı?",
            textAlign: TextAlign.center,
          ),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text("Hayır", style: TextStyle(fontSize: 16)),
            ),
            const SizedBox(width: 16),
            ElevatedButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text("Evet", style: TextStyle(fontSize: 16)),
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

  Future<void> handleBarcode(String code) async {
    if (_isHandlingDetection || isLoading || isScanned) return;

    _isHandlingDetection = true;

    final normalizedCode = normalizeIsbn(code);

    notFoundTimer?.cancel();

    if (!isValidIsbnCandidate(normalizedCode)) {
      if (mounted) {
        setState(() {
          statusMessage = "Okunan barkod ISBN değil gibi duruyor";
        });
      }
      _isHandlingDetection = false;
      return;
    }

    if (mounted) {
      setState(() {
        isLoading = true;
        statusMessage = "Barkod okundu: $normalizedCode";
      });
    }

    try {
      await scannerController.stop();
      await fetchBook(normalizedCode);

      if (!mounted) return;

      setState(() {
        isScanned = true;
      });
    } finally {
      _isHandlingDetection = false;
    }
  }

  Future<void> resetScanner() async {
    FocusScope.of(context).unfocus();
    notFoundTimer?.cancel();

    setState(() {
      isScanned = false;
      isLoading = false;
      _isHandlingDetection = false;
      bookData = null;
      titleController.clear();
      authorsController.clear();
      publisherController.clear();
      categoriesController.clear();
      isbnController.clear();
      pageCountController.clear();
      volumeController.text = "0";
      quantityController.text = "1";
      statusMessage = "Barkodu okut";
    });

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await scannerController.start();
      startNotFoundTimer();
    });
  }

  Widget buildScannerView() {
    return Stack(
      children: [
        MobileScanner(
          controller: scannerController,
          onDetect: (capture) async {
            if (_isHandlingDetection || isScanned || isLoading) return;

            for (final barcode in capture.barcodes) {
              final code = barcode.displayValue;

              if (code != null && code.isNotEmpty) {
                await handleBarcode(code);
                break;
              }
            }
          },
        ),
        Positioned(
          left: 16,
          right: 16,
          top: 16,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              statusMessage,
              style: const TextStyle(color: Colors.white, fontSize: 16),
            ),
          ),
        ),
        const Center(
          child: IgnorePointer(
            child: Icon(
              Icons.qr_code_scanner,
              size: 120,
              color: Colors.white54,
            ),
          ),
        ),
        if (isLoading) const Center(child: CircularProgressIndicator()),
      ],
    );
  }

  Widget buildInputField({
    required TextEditingController controller,
    required String label,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    TextCapitalization textCapitalization = TextCapitalization.sentences,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        textCapitalization: textCapitalization,
        inputFormatters: [
          ...(inputFormatters ?? []),
        ],
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: const TextStyle(color: Colors.white70),
          enabledBorder: const OutlineInputBorder(
            borderSide: BorderSide(color: Colors.white30),
          ),
          focusedBorder: const OutlineInputBorder(
            borderSide: BorderSide(color: Colors.white),
          ),
        ),
      ),
    );
  }

  Widget buildFormView() {
    return Container(
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
              const Text(
                "Barkod Okutuldu",
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF5A5A5A),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                statusMessage,
                style: const TextStyle(
                  fontSize: 15,
                  color: Color(0xFF5A5A5A),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                "Okul Kodu: ${widget.schoolCode}",
                style: const TextStyle(
                  fontSize: 15,
                  color: Color(0xFF5A5A5A),
                ),
              ),
              const SizedBox(height: 20),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.black87,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    buildInputField(
                      controller: titleController,
                      label: "Kitap Adı",
                      textCapitalization: TextCapitalization.sentences,
                    ),
                    buildInputField(
                      controller: authorsController,
                      label: "Yazarlar (virgülle ayır)",
                      textCapitalization: TextCapitalization.words,
                    ),
                    buildInputField(
                      controller: publisherController,
                      label: "Yayınevi",
                      textCapitalization: TextCapitalization.words,
                    ),
                    buildInputField(
                      controller: categoriesController,
                      label: "Kategoriler (virgülle ayır)",
                      textCapitalization: TextCapitalization.words,
                    ),
                    buildInputField(
                      controller: isbnController,
                      label: "ISBN",
                      textCapitalization: TextCapitalization.characters,
                    ),
                    buildInputField(
                      controller: pageCountController,
                      label: "Sayfa Sayısı",
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      textCapitalization: TextCapitalization.none,
                    ),
                    buildInputField(
                      controller: volumeController,
                      label: "Cilt Sayısı",
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      textCapitalization: TextCapitalization.none,
                    ),
                    buildInputField(
                      controller: quantityController,
                      label: "Adet",
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      textCapitalization: TextCapitalization.none,
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: isLoading ? null : saveBook,
                        child: isLoading
                            ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                            : const Text("Kitabı Kaydet"),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: isLoading ? null : resetScanner,
                        child: const Text("Tekrar Tara"),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    notFoundTimer?.cancel();
    titleController.dispose();
    authorsController.dispose();
    publisherController.dispose();
    categoriesController.dispose();
    isbnController.dispose();
    pageCountController.dispose();
    volumeController.dispose();
    quantityController.dispose();
    scannerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        appBar: AppBar(
          title: Text("Barkod Tarama - ${widget.schoolCode}"),
        ),
        body: Stack(
          fit: StackFit.expand,
          children: [
            Offstage(
              offstage: isScanned,
              child: buildScannerView(),
            ),
            if (isScanned) buildFormView(),
          ],
        ),
      ),
    );
  }
}