import 'package:flutter/material.dart';
import 'add_book_page.dart';
import 'book_list_page.dart';

class HomePage extends StatelessWidget {
  final String schoolCode;
  final String schoolName;
  final String userName;
  final String userSurname;
  final String userRole;

  const HomePage({
    super.key,
    required this.schoolCode,
    required this.schoolName,
    required this.userName,
    required this.userSurname,
    required this.userRole,
  });

  @override
  Widget build(BuildContext context) {
    final fullName = '$userName $userSurname'.trim();

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
                const SizedBox(height: 20),
                Text(
                  schoolName.isNotEmpty ? schoolName : "Hoşgeldiniz",
                  style: const TextStyle(
                    fontSize: 34,
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
                const SizedBox(height: 8),
                Text(
                  "Okul Kodu: $schoolCode",
                  style: const TextStyle(
                    fontSize: 16,
                    color: Color(0xFF5A5A5A),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  fullName.isNotEmpty ? "Kullanıcı: $fullName" : "Kullanıcı",
                  style: const TextStyle(
                    fontSize: 16,
                    color: Color(0xFF5A5A5A),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "Rol: ${userRole.isNotEmpty ? userRole : '-'}",
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF5A5A5A),
                  ),
                ),
                const SizedBox(height: 60),
                _buildMenuCard(
                  context,
                  title: "KİTAP EKLEME",
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => AddBookPage(schoolCode: schoolCode),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 28),
                _buildMenuCard(
                  context,
                  title: "KİTAP LİSTESİ",
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => BookListPage(schoolCode: schoolCode),
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
              letterSpacing: 0.5,
            ),
          ),
        ),
      ),
    );
  }
}