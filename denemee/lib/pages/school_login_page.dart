import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import 'home_page.dart';

class SchoolLoginPage extends StatefulWidget {
  const SchoolLoginPage({super.key});

  @override
  State<SchoolLoginPage> createState() => _SchoolLoginPageState();
}

class _SchoolLoginPageState extends State<SchoolLoginPage> {
  final TextEditingController _schoolCodeController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _isLoading = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _schoolCodeController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final schoolCode = _schoolCodeController.text.trim();
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (schoolCode.isEmpty || email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Okul kodu, mail ve şifre zorunlu"),
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final loginData = await ApiService.loginUser(
        schoolCode: schoolCode,
        email: email,
        password: password,
      );

      if (!mounted) return;

      final user = loginData["user"] ?? {};
      final school = loginData["school"] ?? {};

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HomePage(
            schoolCode: school["school_code"]?.toString() ?? schoolCode,
            schoolName: school["school_name"] ?? "",
            userName: user["user_name"] ?? "",
            userSurname: user["user_surname"] ?? "",
            userRole: user["user_role"] ?? "",
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Giriş başarısız: $e")),
      );
    } finally {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
      });
    }
  }

  InputDecoration _inputDecoration({
    required String label,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      labelText: label,
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      suffixIcon: suffixIcon,
    );
  }

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
                const SizedBox(height: 60),
                const Text(
                  "Öğretmen Girişi",
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF5A5A5A),
                  ),
                ),
                const SizedBox(height: 24),

                /// OKUL KODU
                TextField(
                  controller: _schoolCodeController,
                  keyboardType: TextInputType.number,
                  textCapitalization: TextCapitalization.none,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(12),
                  ],
                  decoration: _inputDecoration(label: "Okul Kodu"),
                ),

                const SizedBox(height: 16),

                /// EMAIL
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  textCapitalization: TextCapitalization.none,
                  autocorrect: false,
                  decoration: _inputDecoration(label: "Mail"),
                ),

                const SizedBox(height: 16),

                /// PASSWORD
                TextField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  autocorrect: false,
                  textCapitalization: TextCapitalization.none,
                  decoration: _inputDecoration(
                    label: "Şifre",
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility
                            : Icons.visibility_off,
                      ),
                      onPressed: () {
                        setState(() {
                          _obscurePassword = !_obscurePassword;
                        });
                      },
                    ),
                  ),
                  onSubmitted: (_) {
                    if (!_isLoading) {
                      _login();
                    }
                  },
                ),

                const SizedBox(height: 20),

                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _login,
                    child: _isLoading
                        ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                        : const Text("Giriş Yap"),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}