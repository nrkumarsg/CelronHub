import 'dart:math';
import '../models/partner.dart';
import '../models/contact.dart';

class DuplicateService {
  static final DuplicateService instance = DuplicateService._internal();

  DuplicateService._internal();

  // Normalize company names to help identify fuzzy duplicates
  String normalizeCompanyName(String name) {
    String clean = name.toLowerCase();
    
    // Remove common business designators & punctuation
    clean = clean.replaceAll(RegExp(r'[.,\/#!$%\^&\*;:{}=\-_`~()]'), '');
    clean = clean.replaceAll(RegExp(r'\b(pte|ltd|limited|llc|inc|co|company|corporation|corp|asia|singapore|sg)\b'), '');
    
    // Remove extra whitespace
    clean = clean.trim().replaceAll(RegExp(r'\s+'), '');
    return clean;
  }

  // Calculate string similarity using Jaro-Winkler or Dice coefficient (returns 0.0 to 1.0)
  double getStringSimilarity(String s1, String s2) {
    if (s1 == s2) return 1.0;
    if (s1.isEmpty || s2.isEmpty) return 0.0;

    // Dice's Coefficient (Bigram-based string matching)
    final pairs1 = _getBigrams(s1);
    final pairs2 = _getBigrams(s2);

    int intersection = 0;
    final union = pairs1.length + pairs2.length;

    for (var pair in pairs1) {
      if (pairs2.contains(pair)) {
        intersection++;
        pairs2.remove(pair);
      }
    }

    if (union == 0) return 0.0;
    return (2.0 * intersection) / union;
  }

  Set<String> _getBigrams(String text) {
    final bigrams = <String>{};
    for (int i = 0; i < text.length - 1; i++) {
      bigrams.add(text.substring(i, i + 2));
    }
    return bigrams;
  }

  // Match companies: returns the matching Partner if similarity > threshold, otherwise null
  Partner? findDuplicatePartner(String newName, List<Partner> existingPartners, {double threshold = 0.75}) {
    final String normalizedNew = normalizeCompanyName(newName);
    if (normalizedNew.isEmpty) return null;

    Partner? bestMatch;
    double maxScore = 0.0;

    for (var partner in existingPartners) {
      final String normalizedExisting = normalizeCompanyName(partner.name);
      
      // 1. Check exact match on normalized name
      if (normalizedNew == normalizedExisting) {
        return partner;
      }

      // 2. Perform fuzzy bigram matching
      final score = getStringSimilarity(normalizedNew, normalizedExisting);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = partner;
      }
    }

    if (maxScore >= threshold) {
      return bestMatch;
    }
    return null;
  }

  // Match contacts: returns matching Contact based on email, mobile, or LinkedIn, otherwise null
  Contact? findDuplicateContact(
    Contact newContact,
    List<Contact> existingContacts,
  ) {
    final cleanEmail = newContact.email?.trim().toLowerCase();
    final cleanMobile = _normalizePhoneNumber(newContact.handphone);
    final cleanLinkedin = newContact.facebook?.trim().toLowerCase();

    for (var contact in existingContacts) {
      // 1. Match on email
      if (cleanEmail != null &&
          cleanEmail.isNotEmpty &&
          contact.email?.trim().toLowerCase() == cleanEmail) {
        return contact;
      }

      // 2. Match on mobile number
      if (cleanMobile != null && cleanMobile.isNotEmpty) {
        final existingMobile = _normalizePhoneNumber(contact.handphone);
        if (existingMobile != null && existingMobile == cleanMobile) {
          return contact;
        }
      }

      // 3. Match on LinkedIn
      if (cleanLinkedin != null &&
          cleanLinkedin.isNotEmpty &&
          contact.facebook?.trim().toLowerCase() == cleanLinkedin) {
        return contact;
      }
    }
    return null;
  }

  // Normalize phone numbers by removing spaces, dashes, parentheses and country code prefix (e.g. +65)
  String? _normalizePhoneNumber(String? phone) {
    if (phone == null) return null;
    String clean = phone.replaceAll(RegExp(r'\D'), ''); // Keep only digits
    if (clean.length > 8) {
      // Suffix match for international formatting (e.g., last 8 or 9 digits)
      return clean.substring(clean.length - 8);
    }
    return clean.isNotEmpty ? clean : null;
  }
}
