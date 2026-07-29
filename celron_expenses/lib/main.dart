import 'package:flutter/material.dart';
import 'screens/celron_gateway_screen.dart';
import 'services/supabase_service.dart';
import 'services/gemini_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Non-blocking background initializations so app UI opens instantly on Android
  try {
    SupabaseService.instance.initialize(
      url: 'https://dfoihdzpgkrtyerzzchm.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4',
    );
  } catch (e) {
    debugPrint('Supabase init error: $e');
  }

  try {
    GeminiService.instance.configure('AIzaSyDasTT2wm8TGbeBvwScbdVRIotE8IXWisA');
  } catch (e) {
    debugPrint('Gemini init error: $e');
  }

  runApp(const CelronGatewayApp());
}

class CelronGatewayApp extends StatelessWidget {
  const CelronGatewayApp({super.key});

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFF0F172A);
    const cardBgColor = Color(0xFF1E293B);
    const primaryAccent = Color(0xFF6366F1); 
    const secondaryAccent = Color(0xFF38BDF8);

    return MaterialApp(
      title: 'Celron Gateway',
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
          centerTitle: false,
        ),
      ),
      home: const CelronGatewayScreen(),
    );
  }
}
