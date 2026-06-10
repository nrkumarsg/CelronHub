import 'package:flutter/material.dart';

class PremiumTheme {
  // Brand Harmonized HSL/HEX Palette
  static const Color background = Color(0xFF0F172A); // Slate 900
  static const Color surface = Color(0xFF1E293B);    // Slate 800
  static const Color surfaceGlass = Color(0x661E293B); // Translucent surface
  static const Color border = Color(0xFF334155);     // Slate 700
  static const Color textPrimary = Color(0xFFF8FAFC); // Slate 50
  static const Color textSecondary = Color(0xFF94A3B8); // Slate 400
  
  // Accents
  static const Color primary = Color(0xFF6366F1); // Indigo 500
  static const Color primaryHover = Color(0xFF4F46E5); // Indigo 600
  static const Color secondary = Color(0xFFF97316); // Orange 500
  static const Color accent = Color(0xFF06B6D4); // Cyan 500
  
  // Status Colors
  static const Color success = Color(0xFF10B981); // Emerald 500
  static const Color warning = Color(0xFFF59E0B); // Amber 500
  static const Color warningSoft = Color(0x33F59E0B); // Soft Amber background
  static const Color error = Color(0xFFEF4444); // Red 500
  static const Color info = Color(0xFF3B82F6); // Blue 500

  // Glassmorphic Decoration for Panels
  static BoxDecoration glassDecoration({
    double borderRadius = 16,
    Color? borderColor,
  }) {
    return BoxDecoration(
      color: surfaceGlass,
      borderRadius: BorderRadius.circular(borderRadius),
      border: Border.all(
        color: borderColor ?? border.withOpacity(0.5),
        width: 1,
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.2),
          blurRadius: 16,
          offset: const Offset(0, 8),
        ),
      ],
    );
  }

  // Text Styles
  static TextStyle headingLarge = const TextStyle(
    color: textPrimary,
    fontSize: 28,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.5,
  );

  static TextStyle headingMedium = const TextStyle(
    color: textPrimary,
    fontSize: 20,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
  );

  static TextStyle bodyNormal = const TextStyle(
    color: textSecondary,
    fontSize: 14,
    fontWeight: FontWeight.w400,
  );

  static TextStyle bodyBold = const TextStyle(
    color: textPrimary,
    fontSize: 14,
    fontWeight: FontWeight.w600,
  );

  static TextStyle labelMicro = const TextStyle(
    color: textSecondary,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.5,
  );
}
