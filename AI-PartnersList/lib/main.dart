import 'package:flutter/material.dart';
import 'theme/premium_theme.dart';
import 'screens/dashboard_screen.dart';
import 'services/supabase_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Supabase Client on startup
  try {
    await SupabaseService.instance.init();
    print('Supabase database initialized successfully.');
  } catch (e) {
    print('Supabase startup initialization failed: $e');
  }

  runApp(const CelronBuscardsCrmApp());
}

class CelronBuscardsCrmApp extends StatelessWidget {
  const CelronBuscardsCrmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Celron Business Card Intelligence',
      debugShowCheckedModeBanner: false,
      
      // Bootstrap premium dark Slate theme
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        primaryColor: PremiumTheme.primary,
        scaffoldBackgroundColor: PremiumTheme.background,
        colorScheme: const ColorScheme.dark(
          primary: PremiumTheme.primary,
          secondary: PremiumTheme.secondary,
          surface: PremiumTheme.surface,
          error: PremiumTheme.error,
        ),
        
        // Font families and text custom overrides
        fontFamily: 'Roboto',
        
        appBarTheme: const AppBarTheme(
          backgroundColor: PremiumTheme.surface,
          foregroundColor: PremiumTheme.textPrimary,
          elevation: 0,
        ),
        
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: PremiumTheme.surface,
          labelStyle: const TextStyle(color: PremiumTheme.textSecondary),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: PremiumTheme.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: PremiumTheme.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: PremiumTheme.primary, width: 2),
          ),
        ),
      ),
      
      home: const DashboardScreen(),
    );
  }
}
