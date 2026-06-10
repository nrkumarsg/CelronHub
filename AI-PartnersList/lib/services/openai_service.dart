import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'env_config.dart';

class ExtractionResult {
  final Map<String, dynamic> partnerData;
  final Map<String, dynamic> contactData;
  final Map<String, double> confidenceScores;

  ExtractionResult({
    required this.partnerData,
    required this.contactData,
    required this.confidenceScores,
  });

  factory ExtractionResult.fromJson(Map<String, dynamic> json) {
    return ExtractionResult(
      partnerData: Map<String, dynamic>.from(json['partner'] ?? {}),
      contactData: Map<String, dynamic>.from(json['contact'] ?? {}),
      confidenceScores: Map<String, double>.from(
        (json['confidence'] as Map? ?? {}).map(
          (key, value) => MapEntry(key.toString(), (value as num).toDouble()),
        ),
      ),
    );
  }
}

class OpenAiService {
  static final OpenAiService instance = OpenAiService._internal();

  OpenAiService._internal();

  Future<ExtractionResult> extractBusinessCard(Uint8List imageBytes, String filename) async {
    final String apiKey = EnvConfig.openaiApiKey;
    final String base64Image = base64Encode(imageBytes);
    
    final prompt = '''
You are an expert OCR and Vision AI extraction engine specialized in business cards for the marine, offshore, automation, industrial, and safety industries.
Analyze the attached business card image (filename: "$filename") and extract all fields with high precision.

If the image is rotated, tilted, or blurry, apply cognitive correction to extract the text accurately.

Extract and structure the data into the following JSON format. You MUST return ONLY the raw JSON object, without markdown block formatting (no ```json).

JSON Output Structure:
{
  "partner": {
    "company_name": "Full legal name of company/partner",
    "website": "Main URL, e.g., www.example.com",
    "address": "Full physical HQ address",
    "country": "Country name, normalize to standard country",
    "city": "City name, extract from address",
    "uen_registration": "Unique Entity Number / Business Registration No if present (e.g. 201436227C)",
    "business_activity": "Describe what the company does based on the card (e.g. Marine Automation, Hydraulic repair, Instrumentation)",
    "brands": "List any dealing brands visible on the card (comma-separated)",
    "supplier_credit_terms": "Credit terms in days if present (default to empty string)",
    "categories": ["Choose applicable tags from: Principal, International Supplier, Local Supplier, Freelancer, Service Company, Spare Parts, Service, Calibration, Automation, Electrical, Mechanical, Instrumentation, Safety Equipment, Industrial Supplies, Supplier, Customer"],
    "notes": "General summary profile of the company",
    "industry_type": "Classify as: Marine, Offshore, Automation, Electrical, Hydraulic, Safety, Industrial, Mechanical, Instrumentation, Spare Parts, Ship Repair"
  },
  "contact": {
    "contact_name": "Full name of the contact person",
    "designation": "Job title / Post, e.g., Sales Manager, Purchasing Director",
    "department": "Department, e.g., Sales, Purchasing, Technical, Operations",
    "email": "Direct email address of the person",
    "mobile": "Mobile / Handphone number (include country code if present, e.g. +65 91234567)",
    "phone": "Office phone / direct line",
    "whatsapp": "WhatsApp number (default same as mobile if mobile is WhatsApp compatible)",
    "linkedin": "LinkedIn profile link or username if present",
    "remarks": "Any direct contact notes"
  },
  "confidence": {
    "company_name": 0.95,
    "email": 0.99,
    "contact_name": 0.98,
    "mobile": 0.90,
    "address": 0.85
  }
}

Rules for Confidence Scoring:
For each key in "confidence" (company_name, email, contact_name, mobile, address), score between 0.0 and 1.0 based on visual legibility, spelling completeness, and parsing confidence.
If a field is empty, set confidence to 1.0 (since there was no text to fail on).
''';

    final url = Uri.parse('https://api.openai.com/v1/chat/completions');

    try {
      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $apiKey',
        },
        body: jsonEncode({
          'model': 'gpt-4o-mini',
          'response_format': {'type': 'json_object'},
          'messages': [
            {
              'role': 'user',
              'content': [
                {'type': 'text', 'text': prompt},
                {
                  'type': 'image_url',
                  'image_url': {
                    'url': 'data:image/jpeg;base64,$base64Image',
                  }
                }
              ]
            }
          ],
          'max_tokens': 1000,
        }),
      );

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final String rawJsonText = data['choices'][0]['message']['content'];
        final Map<String, dynamic> parsedJson = jsonDecode(rawJsonText);
        return ExtractionResult.fromJson(parsedJson);
      } else {
        throw Exception(
            'OpenAI Vision request failed: Status ${response.statusCode}, ${response.body}');
      }
    } catch (e) {
      print('OpenAI Vision error: $e');
      rethrow;
    }
  }
}
