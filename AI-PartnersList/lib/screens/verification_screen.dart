import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../theme/premium_theme.dart';
import '../models/partner.dart';
import '../models/contact.dart';
import '../services/supabase_service.dart';
import '../services/openai_service.dart';

class VerificationScreen extends StatefulWidget {
  final String driveFileId;
  final String filename;
  final String frontImageUrl;
  final ExtractionResult aiResult;
  final Uint8List imageBytes;

  const VerificationScreen({
    super.key,
    required this.driveFileId,
    required this.filename,
    required this.frontImageUrl,
    required this.aiResult,
    required this.imageBytes,
  });

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  final SupabaseService _db = SupabaseService.instance;
  final _formKey = GlobalKey<FormState>();
  bool _isSaving = false;

  // Controllers - Partner Fields
  late TextEditingController _companyNameCtrl;
  late TextEditingController _uenCtrl;
  late TextEditingController _addressCtrl;
  late TextEditingController _cityCtrl;
  late TextEditingController _pincodeCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _websiteCtrl;
  late TextEditingController _activityCtrl;
  late TextEditingController _brandsCtrl;
  late TextEditingController _creditLimitCtrl;
  late TextEditingController _creditTermsCtrl;
  late TextEditingController _notesCtrl;
  late TextEditingController _partnerOcrMasterCtrl; // Permanent Partner OCR Master
  String _selectedCountry = 'Singapore';

  // Selected categories list
  List<String> _selectedCategories = [];

  // Controllers - Contact Fields
  late TextEditingController _contactNameCtrl;
  late TextEditingController _deptCtrl;
  late TextEditingController _postCtrl;
  late TextEditingController _contactEmailCtrl;
  late TextEditingController _officePhoneCtrl;
  late TextEditingController _mobileCtrl;
  late TextEditingController _contactAddressCtrl;
  late TextEditingController _contactOcrMasterCtrl; // Permanent Contact OCR Master

  final List<String> _allCategories = [
    'Principal', 'International Supplier', 'Local Supplier', 'Freelancer',
    'Service Company', 'Spare Parts', 'Service', 'Calibration', 'Automation',
    'Electrical', 'Mechanical', 'Instrumentation', 'Safety Equipment',
    'Industrial Supplies', 'Supplier', 'Customer'
  ];

  @override
  void initState() {
    super.initState();
    _extractInitialFields();
  }

  void _extractInitialFields() {
    final partnerData = widget.aiResult.partnerData;
    final contactData = widget.aiResult.contactData;

    // Initialize Controllers with AI Data
    _companyNameCtrl = TextEditingController(text: partnerData['company_name']);
    _uenCtrl = TextEditingController(text: partnerData['uen_registration']);
    _addressCtrl = TextEditingController(text: partnerData['address']);
    _cityCtrl = TextEditingController(text: partnerData['city']);
    _pincodeCtrl = TextEditingController(text: partnerData['pincode']);
    _phoneCtrl = TextEditingController(text: partnerData['phone']);
    _emailCtrl = TextEditingController(text: partnerData['email']);
    _websiteCtrl = TextEditingController(text: partnerData['website']);
    _activityCtrl = TextEditingController(text: partnerData['business_activity']);
    _brandsCtrl = TextEditingController(text: partnerData['brands']);
    _creditLimitCtrl = TextEditingController(text: partnerData['supplier_credit_limit'] ?? '');
    _creditTermsCtrl = TextEditingController(text: partnerData['supplier_credit_terms'] ?? '');
    _notesCtrl = TextEditingController(text: partnerData['notes']);
    
    // Create rich text permanent OCR Master copy representing all extracted data
    final partnerOcr = StringBuffer();
    partnerOcr.writeln('=== OCR COMPANY MASTER COPY ===');
    partnerOcr.writeln('Company Name: ${partnerData['company_name']}');
    partnerOcr.writeln('UEN / Registration No: ${partnerData['uen_registration']}');
    partnerOcr.writeln('Address: ${partnerData['address']}');
    partnerOcr.writeln('Country: ${partnerData['country']}');
    partnerOcr.writeln('City: ${partnerData['city']}');
    partnerOcr.writeln('Website: ${partnerData['website']}');
    partnerOcr.writeln('Services: ${partnerData['business_activity']}');
    partnerOcr.writeln('Brands: ${partnerData['brands']}');
    partnerOcr.writeln('Notes: ${partnerData['notes']}');
    partnerOcr.writeln('Sector: ${partnerData['industry_type']}');
    _partnerOcrMasterCtrl = TextEditingController(text: partnerOcr.toString());

    if (partnerData['country'] != null && partnerData['country'].toString().isNotEmpty) {
      _selectedCountry = partnerData['country'].toString();
    }

    final cats = partnerData['categories'];
    if (cats != null) {
      _selectedCategories = List<String>.from(cats as List);
    }

    _contactNameCtrl = TextEditingController(text: contactData['contact_name']);
    _deptCtrl = TextEditingController(text: contactData['department']);
    _postCtrl = TextEditingController(text: contactData['designation']);
    _contactEmailCtrl = TextEditingController(text: contactData['email']);
    _officePhoneCtrl = TextEditingController(text: contactData['phone']);
    _mobileCtrl = TextEditingController(text: contactData['mobile']);
    _contactAddressCtrl = TextEditingController(text: contactData['address']);

    // Create rich text permanent Contact OCR Master copy
    final contactOcr = StringBuffer();
    contactOcr.writeln('=== OCR CONTACT MASTER COPY ===');
    contactOcr.writeln('Contact Name: ${contactData['contact_name']}');
    contactOcr.writeln('Post / Designation: ${contactData['designation']}');
    contactOcr.writeln('Department: ${contactData['department']}');
    contactOcr.writeln('Email Address: ${contactData['email']}');
    contactOcr.writeln('Mobile / Phone: ${contactData['mobile']}');
    contactOcr.writeln('Office Phone: ${contactData['phone']}');
    contactOcr.writeln('Contact Address: ${contactData['address']}');
    contactOcr.writeln('LinkedIn: ${contactData['linkedin']}');
    _contactOcrMasterCtrl = TextEditingController(text: contactOcr.toString());
  }

  @override
  void dispose() {
    _companyNameCtrl.dispose();
    _uenCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _pincodeCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _websiteCtrl.dispose();
    _activityCtrl.dispose();
    _brandsCtrl.dispose();
    _creditLimitCtrl.dispose();
    _creditTermsCtrl.dispose();
    _notesCtrl.dispose();
    _partnerOcrMasterCtrl.dispose();
    _contactNameCtrl.dispose();
    _deptCtrl.dispose();
    _postCtrl.dispose();
    _contactEmailCtrl.dispose();
    _officePhoneCtrl.dispose();
    _mobileCtrl.dispose();
    _contactAddressCtrl.dispose();
    _contactOcrMasterCtrl.dispose();
    super.dispose();
  }

  // Soft-Yellow highlight check for low-confidence fields
  InputDecoration _buildInputDecoration(String label, String confidenceKey) {
    final double confidence = widget.aiResult.confidenceScores[confidenceKey] ?? 1.0;
    final bool isLowConfidence = confidence < 0.85;

    return InputDecoration(
      labelText: isLowConfidence ? '$label (AI Low Confidence: ${(confidence * 100).toStringAsFixed(0)}%)' : label,
      labelStyle: TextStyle(
        color: isLowConfidence ? PremiumTheme.warning : PremiumTheme.textSecondary,
        fontWeight: isLowConfidence ? FontWeight.bold : FontWeight.normal,
      ),
      filled: true,
      fillColor: isLowConfidence
          ? PremiumTheme.warningSoft
          : PremiumTheme.surface,
      enabledBorder: OutlineInputBorder(
        borderSide: BorderSide(
          color: isLowConfidence ? PremiumTheme.warning : PremiumTheme.border,
          width: isLowConfidence ? 1.5 : 1.0,
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(
          color: isLowConfidence ? PremiumTheme.warning : PremiumTheme.primary,
          width: 2.0,
        ),
        borderRadius: BorderRadius.circular(10),
      ),
    );
  }

  Future<void> _approveAndSave() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);

    try {
      // 1. Save Partner directly into Supabase 'partners' table
      // We save the master OCR text in the 'info' field as requested
      final partner = Partner(
        name: _companyNameCtrl.text,
        types: _selectedCategories,
        others: _notesCtrl.text,
        address: _addressCtrl.text,
        country: _selectedCountry,
        email1: _emailCtrl.text,
        phone1: _phoneCtrl.text,
        weblink: _websiteCtrl.text,
        info: _partnerOcrMasterCtrl.text, // PERMANENT OCR MASTER COPY!
        customerCredit: _creditLimitCtrl.text,
        supplierCredit: _creditTermsCtrl.text,
        pincode: _pincodeCtrl.text,
        city: _cityCtrl.text,
        activitySummary: _activityCtrl.text, // Autofilled service profile
        website: _websiteCtrl.text,
        brands: _brandsCtrl.text,
        businessCardUrl: widget.frontImageUrl, // Saved as direct Drive URL!
      );

      final savedPartner = await _db.savePartner(partner);

      // 2. Save Contact directly into Supabase 'contacts' table
      // We save the master contact OCR text in the 'info' field as requested
      final contact = Contact(
        partnerId: savedPartner.id,
        name: _contactNameCtrl.text,
        post: _postCtrl.text,
        address: _contactAddressCtrl.text.isNotEmpty ? _contactAddressCtrl.text : _addressCtrl.text,
        email: _contactEmailCtrl.text,
        phone: _officePhoneCtrl.text,
        handphone: _mobileCtrl.text,
        facebook: widget.aiResult.contactData['linkedin'] ?? '',
        info: _contactOcrMasterCtrl.text, // PERMANENT CONTACT OCR MASTER COPY!
        businessCardUrl: widget.frontImageUrl, // Saved as direct Drive URL!
      );

      await _db.saveContact(contact);

      setState(() => _isSaving = false);
      Navigator.pop(context, true);
    } catch (e) {
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Save failed: $e'), backgroundColor: PremiumTheme.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: PremiumTheme.background,
      appBar: AppBar(
        title: const Text('Verify Business Partner & Contact Details'),
        backgroundColor: PremiumTheme.surface,
        elevation: 0,
      ),
      body: _isSaving
          ? const Center(child: CircularProgressIndicator(color: PremiumTheme.primary))
          : Form(
              key: _formKey,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  bool isWide = constraints.maxWidth > 900;
                  
                  Widget imagePane = Container(
                    padding: const EdgeInsets.all(16),
                    decoration: PremiumTheme.glassDecoration(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Original Business Card Image', style: PremiumTheme.headingMedium),
                        const SizedBox(height: 4),
                        Text('Stored securely in Google Drive', style: PremiumTheme.bodyNormal),
                        const SizedBox(height: 16),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: InteractiveViewer(
                              maxScale: 4.0,
                              child: Image.network(
                                widget.frontImageUrl,
                                fit: BoxFit.contain,
                                width: double.infinity,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );

                  Widget formPane = SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // STEP 1: PARTNER DETAILS
                        _buildSectionHeader('STEP 1: PARTNER INFORMATION'),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _companyNameCtrl,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('Company Name *', 'company_name'),
                          validator: (v) => v == null || v.isEmpty ? 'Company Name is required' : null,
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: _uenCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('UEN / Registration No', 'uen_registration'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _addressCtrl,
                          maxLines: 2,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('HQ Address', 'address'),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                value: _selectedCountry,
                                dropdownColor: PremiumTheme.surface,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: InputDecoration(
                                  labelText: 'Country *',
                                  filled: true,
                                  fillColor: PremiumTheme.surface,
                                  enabledBorder: OutlineInputBorder(
                                    borderSide: const BorderSide(color: PremiumTheme.border),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                ),
                                items: ['Singapore', 'Malaysia', 'Indonesia', 'China', 'Germany', 'USA', 'India']
                                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                                    .toList(),
                                onChanged: (v) => setState(() => _selectedCountry = v!),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: TextFormField(
                                controller: _cityCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('City', 'city'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: _pincodeCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Pincode / Postal Code', 'pincode'),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: TextFormField(
                                controller: _phoneCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Company Phone', 'phone1'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: _emailCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Company Email', 'email1'),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: TextFormField(
                                controller: _websiteCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Company Website', 'website'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        
                        // CATEGORIES BADGES
                        Text('CATEGORIES', style: PremiumTheme.labelMicro),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _allCategories.map((cat) {
                            final isSelected = _selectedCategories.contains(cat);
                            return ChoiceChip(
                              label: Text(cat),
                              selected: isSelected,
                              labelStyle: TextStyle(
                                color: isSelected ? Colors.white : PremiumTheme.textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                              selectedColor: PremiumTheme.primary,
                              backgroundColor: PremiumTheme.surface,
                              side: BorderSide(
                                color: isSelected ? PremiumTheme.primary : PremiumTheme.border,
                              ),
                              onSelected: (selected) {
                                setState(() {
                                  if (selected) {
                                    _selectedCategories.add(cat);
                                  } else {
                                    _selectedCategories.remove(cat);
                                  }
                                });
                              },
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 24),

                        TextFormField(
                          controller: _activityCtrl,
                          maxLines: 2,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('Company Services / Activity', 'business_activity'),
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _brandsCtrl,
                          maxLines: 2,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('Dealing Brands', 'brands'),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: _creditLimitCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Supplier Credit Limit (USD)', 'supplier_credit_limit'),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: TextFormField(
                                controller: _creditTermsCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Supplier Credit Terms (Days)', 'supplier_credit_terms'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _notesCtrl,
                          maxLines: 2,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('Notes & Business Profile', 'notes'),
                        ),
                        const SizedBox(height: 16),
                        
                        // RICH TEXT FIELD: PARTNER OCR MASTER COPY (PERMANENT)
                        TextFormField(
                          controller: _partnerOcrMasterCtrl,
                          maxLines: 6,
                          style: const TextStyle(color: Colors.greenAccent, fontFamily: 'monospace', fontSize: 12),
                          decoration: InputDecoration(
                            labelText: 'OCR Company Master Copy (Permanent Archive)',
                            labelStyle: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold),
                            filled: true,
                            fillColor: PremiumTheme.surface,
                            enabledBorder: OutlineInputBorder(
                              borderSide: const BorderSide(color: Colors.greenAccent, width: 1.0),
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                        const SizedBox(height: 32),

                        // STEP 2: CONTACT DETAILS
                        _buildSectionHeader('STEP 2: PRIMARY CONTACT'),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _contactNameCtrl,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('Contact Name *', 'contact_name'),
                          validator: (v) => v == null || v.isEmpty ? 'Contact Name is required' : null,
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: _deptCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Department', 'department'),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: TextFormField(
                                controller: _postCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Post / Designation', 'designation'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: _contactEmailCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Email Address', 'email'),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: TextFormField(
                                controller: _officePhoneCtrl,
                                style: const TextStyle(color: PremiumTheme.textPrimary),
                                decoration: _buildInputDecoration('Office Phone', 'phone'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _mobileCtrl,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('Handphone / Mobile *', 'mobile'),
                          validator: (v) => v == null || v.isEmpty ? 'Mobile number is required' : null,
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _contactAddressCtrl,
                          maxLines: 2,
                          style: const TextStyle(color: PremiumTheme.textPrimary),
                          decoration: _buildInputDecoration('Contact Address (If different)', 'address'),
                        ),
                        const SizedBox(height: 16),
                        
                        // RICH TEXT FIELD: CONTACT OCR MASTER COPY (PERMANENT)
                        TextFormField(
                          controller: _contactOcrMasterCtrl,
                          maxLines: 6,
                          style: const TextStyle(color: Colors.greenAccent, fontFamily: 'monospace', fontSize: 12),
                          decoration: InputDecoration(
                            labelText: 'OCR Contact Master Copy (Permanent Archive)',
                            labelStyle: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold),
                            filled: true,
                            fillColor: PremiumTheme.surface,
                            enabledBorder: OutlineInputBorder(
                              borderSide: const BorderSide(color: Colors.greenAccent, width: 1.0),
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                        const SizedBox(height: 32),

                        // Submission Actions
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(
                              style: TextButton.styleFrom(
                                foregroundColor: PremiumTheme.textSecondary,
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                              ),
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Cancel'),
                            ),
                            const SizedBox(width: 12),
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: PremiumTheme.primary,
                                foregroundColor: PremiumTheme.textPrimary,
                                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              onPressed: _approveAndSave,
                              icon: const Icon(Icons.verified),
                              label: const Text('Create Partner & Contact', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 48),
                      ],
                    ),
                  );

                  if (isWide) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(flex: 5, child: imagePane),
                        const SizedBox(width: 24),
                        Expanded(flex: 6, child: formPane),
                      ],
                    );
                  } else {
                    return SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          SizedBox(height: 350, child: imagePane),
                          const SizedBox(height: 24),
                          formPane,
                        ],
                      ),
                    );
                  }
                },
              ),
            ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration: BoxDecoration(
        color: PremiumTheme.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border(left: BorderSide(color: PremiumTheme.primary, width: 4)),
      ),
      child: Text(
        title,
        style: PremiumTheme.labelMicro.copyWith(
          color: PremiumTheme.primary,
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
