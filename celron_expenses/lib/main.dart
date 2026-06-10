import 'package:flutter/material.dart';
import 'screens/dashboard_screen.dart';
import 'services/supabase_service.dart';
import 'services/gemini_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase Connection
  // Utilizing standard credentials matching CelronHub. 
  // Real apps pull these from secure dot-env bindings, falling back gracefully to UI simulation mode if offline.
  await SupabaseService.instance.initialize(
    url: 'https://dfoihdzpgkrtyerzzchm.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4',
  );

  // Initialize Gemini AI Client
  // Fallback triggers if API key is not supplied, providing a fully functional demo without breaking
  GeminiService.instance.configure('AIzaSyDasTT2wm8TGbeBvwScbdVRIotE8IXWisA');

  runApp(const CelronExpensesApp());
}

class CelronExpensesApp extends StatelessWidget {
  const CelronExpensesApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Curated Harmonious Dark Palette (Deep Slate Navy background, Orange primary accent, Emerald Green secondary)
    const bgColor = Color(0xFF0F172A);
    const cardBgColor = Color(0xFF1E293B);
    const primaryAccent = Color(0xFFF97316); 
    const secondaryAccent = Color(0xFF10B981);

    return MaterialApp(
      title: 'Celron Expenses',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: bgColor,
        primaryColor: primaryAccent,
        cardColor: cardBgColor,
        colorScheme: const ColorScheme.dark().copyWith(
          primary: primaryAccent,
          secondary: secondaryAccent,
          surface: cardBgColor,
          background: bgColor,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: primaryAccent,
          foregroundColor: Colors.white,
        ),
      ),
      home: const DashboardScreen(),
    );
  }
}
