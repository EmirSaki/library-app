import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/book.dart';
import 'book_detail_page.dart';

class BookListPage extends StatefulWidget {
  final String schoolCode;

  const BookListPage({
    super.key,
    required this.schoolCode,
  });

  @override
  State<BookListPage> createState() => _BookListPageState();
}

class _BookListPageState extends State<BookListPage> {
  final TextEditingController searchController = TextEditingController();
  final ScrollController scrollController = ScrollController();

  List<Book> books = [];
  int currentPage = 1;
  final int limit = 30;
  int totalPages = 1;
  bool isLoading = false;
  bool isInitialLoading = true;
  bool hasMore = true;
  String currentSearch = "";
  Timer? _debounce;
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    loadBooks(reset: true);

    searchController.addListener(_onSearchChanged);
    scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    searchController.removeListener(_onSearchChanged);
    searchController.dispose();
    scrollController.removeListener(_onScroll);
    scrollController.dispose();
    super.dispose();
  }

  String normalizeTurkish(String text) {
    return ApiService.normalizeTurkishText(text);
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      final newSearch = searchController.text.trim();
      if (newSearch != currentSearch) {
        currentSearch = newSearch;
        loadBooks(reset: true);
      }
    });
  }

  void _onScroll() {
    if (!scrollController.hasClients) return;

    if (scrollController.position.pixels >=
        scrollController.position.maxScrollExtent - 200 &&
        !isLoading &&
        hasMore &&
        !isInitialLoading) {
      loadBooks();
    }
  }

  Future<void> loadBooks({bool reset = false}) async {
    if (isLoading) return;

    final int activeRequestId = ++_requestId;
    final int pageToLoad = reset ? 1 : currentPage;
    final String searchToUse = currentSearch;

    setState(() {
      isLoading = true;
      if (reset) {
        isInitialLoading = true;
        hasMore = true;
      }
    });

    try {
      final result = await ApiService.getSchoolBooks(
        schoolCode: widget.schoolCode,
        page: pageToLoad,
        limit: limit,
        search: searchToUse,
      );

      if (!mounted || activeRequestId != _requestId) return;

      final List<Book> newBooks = result["books"] as List<Book>;
      final pagination = result["pagination"] as Map<String, dynamic>;

      setState(() {
        if (reset) {
          books = newBooks;
          currentPage = 2;
        } else {
          books.addAll(newBooks);
          currentPage += 1;
        }

        totalPages = pagination["totalPages"] ?? 1;
        hasMore = pagination["hasNextPage"] ?? false;
      });
    } catch (e) {
      if (!mounted || activeRequestId != _requestId) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Hata: $e")),
      );
    } finally {
      if (!mounted || activeRequestId != _requestId) return;

      setState(() {
        isLoading = false;
        isInitialLoading = false;
      });
    }
  }

  Future<void> refreshBooks() async {
    await loadBooks(reset: true);
  }

  Future<void> exportBooks(String format) async {
    try {
      final path = await ApiService.exportBooks(
        schoolCode: widget.schoolCode,
        format: format,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            format == "excel"
                ? "Excel Downloads klasörüne kaydedildi"
                : "PDF Downloads klasörüne kaydedildi",
          ),
          action: SnackBarAction(
            label: "Tamam",
            onPressed: () {},
          ),
        ),
      );

      debugPrint("Kaydedilen dosya: $path");
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Export hatası: $e")),
      );
    }
  }

  List<_MatchRange> _findNormalizedMatches(String originalText, String query) {
    final trimmedQuery = query.trim();
    if (trimmedQuery.isEmpty || originalText.isEmpty) return [];

    final normalizedTextBuffer = StringBuffer();
    final List<int> normalizedIndexToOriginalIndex = [];

    for (int i = 0; i < originalText.length; i++) {
      final normalizedChar = normalizeTurkish(originalText[i]);
      normalizedTextBuffer.write(normalizedChar);

      for (int j = 0; j < normalizedChar.length; j++) {
        normalizedIndexToOriginalIndex.add(i);
      }
    }

    final normalizedText = normalizedTextBuffer.toString();
    final normalizedQuery = normalizeTurkish(trimmedQuery);

    if (normalizedQuery.isEmpty) return [];

    final matches = <_MatchRange>[];
    int searchStart = 0;

    while (searchStart < normalizedText.length) {
      final matchIndex = normalizedText.indexOf(normalizedQuery, searchStart);
      if (matchIndex == -1) break;

      final originalStart = normalizedIndexToOriginalIndex[matchIndex];
      final normalizedEndIndex = matchIndex + normalizedQuery.length - 1;
      final originalEnd = normalizedIndexToOriginalIndex[normalizedEndIndex] + 1;

      matches.add(_MatchRange(start: originalStart, end: originalEnd));
      searchStart = matchIndex + normalizedQuery.length;
    }

    return matches;
  }

  Widget highlightText(String text, String query) {
    if (query.trim().isEmpty) {
      return Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.bold),
      );
    }

    final matches = _findNormalizedMatches(text, query);

    if (matches.isEmpty) {
      return Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.bold),
      );
    }

    final spans = <TextSpan>[];
    int currentIndex = 0;

    for (final match in matches) {
      if (match.start > currentIndex) {
        spans.add(TextSpan(text: text.substring(currentIndex, match.start)));
      }

      spans.add(
        TextSpan(
          text: text.substring(match.start, match.end),
          style: const TextStyle(
            color: Colors.blue,
            fontWeight: FontWeight.bold,
          ),
        ),
      );

      currentIndex = match.end;
    }

    if (currentIndex < text.length) {
      spans.add(TextSpan(text: text.substring(currentIndex)));
    }

    return RichText(
      text: TextSpan(
        style: const TextStyle(
          color: Colors.black,
          fontWeight: FontWeight.bold,
        ),
        children: spans,
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      child: TextField(
        controller: searchController,
        keyboardType: TextInputType.text,
        textCapitalization: TextCapitalization.words,
        decoration: InputDecoration(
          hintText: 'Kitap adı veya yazar ara...',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: searchController.text.isNotEmpty
              ? IconButton(
            icon: const Icon(Icons.clear),
            onPressed: () {
              searchController.clear();
            },
          )
              : null,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final query = searchController.text;

    return Scaffold(
      appBar: AppBar(
        title: Text('Kitap Listesi - ${widget.schoolCode}'),
        actions: [
          PopupMenuButton<String>(
            onSelected: exportBooks,
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: "excel",
                child: Text("Excel indir"),
              ),
              PopupMenuItem(
                value: "pdf",
                child: Text("PDF indir"),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          _buildSearchBar(),
          Expanded(
            child: isInitialLoading
                ? const Center(child: CircularProgressIndicator())
                : books.isEmpty
                ? const Center(child: Text('Hiç kitap bulunamadı.'))
                : RefreshIndicator(
              onRefresh: refreshBooks,
              child: ListView.builder(
                controller: scrollController,
                itemCount: books.length + (hasMore ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index >= books.length) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: CircularProgressIndicator(),
                      ),
                    );
                  }

                  final book = books[index];

                  final authorsText = book.authors.isNotEmpty
                      ? book.authors.join(", ")
                      : "Bilinmiyor";

                  final quantityText = book.quantity?.toString() ?? "0";

                  return Card(
                    margin: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    child: ListTile(
                      title: highlightText(
                        book.title.isNotEmpty
                            ? book.title
                            : 'Bilinmeyen Kitap',
                        query,
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          RichText(
                            text: TextSpan(
                              style: const TextStyle(
                                color: Colors.black,
                              ),
                              children: [
                                const TextSpan(text: 'Yazar: '),
                                WidgetSpan(
                                  alignment: PlaceholderAlignment.baseline,
                                  baseline: TextBaseline.alphabetic,
                                  child: highlightText(
                                    authorsText,
                                    query,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            'ISBN: ${book.isbn.isNotEmpty ? book.isbn : "Yok"}',
                          ),
                          Text(
                            'Yayınevi: ${book.publisher.isNotEmpty ? book.publisher : "Bilinmiyor"}',
                          ),
                        ],
                      ),
                      trailing: Text('Stok: $quantityText'),
                      isThreeLine: true,
                      onTap: book.bookId == null
                          ? null
                          : () async {
                        final changed = await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => BookDetailPage(
                              schoolCode: widget.schoolCode,
                              book: book,
                            ),
                          ),
                        );

                        if (changed == true) {
                          await refreshBooks();
                        }
                      },
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MatchRange {
  final int start;
  final int end;

  _MatchRange({
    required this.start,
    required this.end,
  });
}