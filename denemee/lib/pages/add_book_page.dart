import 'package:flutter/material.dart';
import 'scanner_page.dart';
import 'manuel_book_page.dart';

class AddBookPage extends StatelessWidget {
  final String schoolCode;

  const AddBookPage({
    super.key,
    required this.schoolCode,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconButton(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  icon: const Icon(
                    Icons.arrow_back_ios_new,
                    color: Color(0xFF5A5A5A),
                  ),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Text(
                    "Kitap Yükleyin",
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF5A5A5A),
                      shadows: [
                        Shadow(
                          offset: Offset(2, 2),
                          blurRadius: 0,
                          color: Colors.white,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Text(
                    "Okul Kodu: $schoolCode",
                    style: const TextStyle(
                      fontSize: 15,
                      color: Color(0xFF5A5A5A),
                    ),
                  ),
                ),
                const SizedBox(height: 70),
                _buildMenuCard(
                  context,
                  title: "Barkod Okutma",
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ScannerPage(
                          schoolCode: schoolCode,
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 35),
                const Center(
                  child: Text(
                    "Veya",
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF6A6A6A),
                      shadows: [
                        Shadow(
                          offset: Offset(1.5, 1.5),
                          blurRadius: 0,
                          color: Colors.white,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 35),
                _buildMenuCard(
                  context,
                  title: "Manuel Ekleme",
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ManualBookPage(
                          schoolCode: schoolCode,
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMenuCard(
      BuildContext context, {
        required String title,
        required VoidCallback onTap,
      }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        height: 95,
        decoration: BoxDecoration(
          color: const Color(0xFFD9DDE0),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: const Color(0xFFE8EDF3),
            width: 4,
          ),
          boxShadow: const [
            BoxShadow(
              color: Colors.black12,
              blurRadius: 4,
              offset: Offset(1, 2),
            ),
          ],
        ),
        child: Center(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: Color(0xFF5E5E5E),
              letterSpacing: 0.3,
            ),
          ),
        ),
      ),
    );
  }
}