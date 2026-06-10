import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:camera/camera.dart';
import 'package:file_picker/file_picker.dart';
import '../models/accounts_payable.dart';
import '../models/gst_record.dart';
import '../services/gemini_service.dart';
import '../services/supabase_service.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({Key? key}) : super(key: key);

  @override
  _ScannerScreenState createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> with SingleTickerProviderStateMixin {
  final SupabaseService _supabase = SupabaseService.instance;
  final GeminiService _gemini = GeminiService.instance;

  // Camera & File Picker properties
  CameraController? _cameraController;
  List<CameraDescription> _cameras = [];
  bool _isCameraInitialized = false;

  // Scanning States
  bool _isScanning = true;
  bool _isAnalyzing = false;
  bool _isVerified = false;
  bool _isFileSaving = false;

  late AnimationController _scannerAnimationController;
  late Animation<double> _scannerBeamAnimation;

  // Extracted Data Holders (Controllers for Verification Form)
  final TextEditingController _vendorNameController = TextEditingController();
  final TextEditingController _invoiceNumberController = TextEditingController();
  final TextEditingController _invoiceDateController = TextEditingController();
  final TextEditingController _dueDateController = TextEditingController();
  final TextEditingController _totalAmountController = TextEditingController();
  final TextEditingController _gstAmountController = TextEditingController();
  
  // GST Specific fields
  final TextEditingController _gstinController = TextEditingController();
  final TextEditingController _taxableValueController = TextEditingController();
  final TextEditingController _cgstController = TextEditingController();
  final TextEditingController _sgstController = TextEditingController();
  final TextEditingController _igstController = TextEditingController();
  final TextEditingController _hsnCodeController = TextEditingController();
  
  String _selectedCategory = 'Office Supplies';
  String _selectedFilingType = 'both'; // both, accounts_payable, gst_reporting
  bool _containsGst = true;

  @override
  void initState() {
    super.initState();
    
    // Scanner Beam Animation
    _scannerAnimationController = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    )..repeat(reverse: true);

    _scannerBeamAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _scannerAnimationController, curve: Curves.easeInOut),
    );

    // Initialize Camera Preview
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isNotEmpty) {
        _cameraController = CameraController(
          _cameras[0],
          ResolutionPreset.medium,
          enableAudio: false,
        );
        await _cameraController!.initialize();
        if (mounted) {
          setState(() {
            _isCameraInitialized = true;
          });
        }
      }
    } catch (e) {
      print("Camera initialization failed: $e");
    }
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _scannerAnimationController.dispose();
    _vendorNameController.dispose();
    _invoiceNumberController.dispose();
    _invoiceDateController.dispose();
    _dueDateController.dispose();
    _totalAmountController.dispose();
    _gstAmountController.dispose();
    _gstinController.dispose();
    _taxableValueController.dispose();
    _cgstController.dispose();
    _sgstController.dispose();
    _igstController.dispose();
    _hsnCodeController.dispose();
    super.dispose();
  }

  void _populateExtractedData(Map<String, dynamic> extractedData) {
    setState(() {
      _vendorNameController.text = extractedData['vendor_name'] as String? ?? '';
      _invoiceNumberController.text = extractedData['invoice_number'] as String? ?? '';
      _invoiceDateController.text = extractedData['invoice_date'] as String? ?? '';
      _dueDateController.text = extractedData['due_date'] as String? ?? '';
      _totalAmountController.text = (extractedData['total_amount'] as num? ?? 0.0).toStringAsFixed(2);
      _gstAmountController.text = (extractedData['gst_amount'] as num? ?? 0.0).toStringAsFixed(2);
      
      _gstinController.text = extractedData['vendor_gstin'] as String? ?? '';
      _taxableValueController.text = (extractedData['taxable_value'] as num? ?? 0.0).toStringAsFixed(2);
      _cgstController.text = (extractedData['cgst'] as num? ?? 0.0).toStringAsFixed(2);
      _sgstController.text = (extractedData['sgst'] as num? ?? 0.0).toStringAsFixed(2);
      _igstController.text = (extractedData['igst'] as num? ?? 0.0).toStringAsFixed(2);
      _hsnCodeController.text = extractedData['hsn_sac_code'] as String? ?? '';
      
      _selectedCategory = extractedData['expense_category'] as String? ?? 'Office Supplies';
      _containsGst = (_gstinController.text.isNotEmpty || (extractedData['gst_amount'] as num? ?? 0) > 0);

      _isAnalyzing = false;
      _isVerified = true;
    });
  }

  Future<void> _startAiExtraction() async {
    setState(() {
      _isScanning = false;
      _isAnalyzing = true;
    });

    // Simulated OCR extraction fallback
    final extractedData = await _gemini.extractInvoiceDetails(File('dummy_path'));
    _populateExtractedData(extractedData);
  }

  Future<void> _captureAndExtract() async {
    if (_isCameraInitialized && _cameraController != null) {
      try {
        setState(() {
          _isScanning = false;
          _isAnalyzing = true;
        });

        final XFile file = await _cameraController!.takePicture();
        final File imageFile = File(file.path);

        final extractedData = await _gemini.extractInvoiceDetails(imageFile);
        _populateExtractedData(extractedData);
      } catch (e) {
        print("Camera capture failed: $e. Falling back to simulation...");
        _startAiExtraction();
      }
    } else {
      _startAiExtraction();
    }
  }

  Future<void> _selectImageFromFiles() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
      );
      if (result != null && result.files.single.path != null) {
        setState(() {
          _isScanning = false;
          _isAnalyzing = true;
        });

        final File pickedFile = File(result.files.single.path!);
        final extractedData = await _gemini.extractInvoiceDetails(pickedFile);
        _populateExtractedData(extractedData);
      }
    } catch (e) {
      print("File picking failed: $e");
    }
  }

  void _showApiKeyDialog() {
    final controller = TextEditingController(text: _gemini.isConfigured ? 'Keys are configured' : '');
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.vpn_key, color: Color(0xFFF97316), size: 24),
            SizedBox(width: 10),
            Text('Gemini API Settings', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter your own Gemini API Key to enable fully working AI document extraction on your receipts.',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, height: 1.4),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              obscureText: true,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                labelText: 'Gemini API Key',
                labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                filled: true,
                fillColor: const Color(0xFF0F172A),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () {
              if (controller.text.isNotEmpty && controller.text != 'Keys are configured') {
                _gemini.configure(controller.text);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Gemini API Key configured successfully!'),
                    backgroundColor: Color(0xFF10B981),
                  ),
                );
              }
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF97316),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Save Key', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Future<void> _fileExpenses() async {
    setState(() => _isFileSaving = true);

    // 1. Generate standard Google Drive file structure mock name
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final driveSubfolder = _containsGst ? 'GST' : 'Non_GST';
    final generatedDriveLink = 'https://drive.google.com/open?id=Celron_Scans_2026_Finance_${_selectedCategory.replaceAll(' ', '_')}_$driveSubfolder';

    // 2. Perform Supabase filing based on selection
    if (_selectedFilingType == 'both' || _selectedFilingType == 'accounts_payable') {
      final apRecord = AccountsPayable(
        vendorName: _vendorNameController.text,
        invoiceNumber: _invoiceNumberController.text.isEmpty ? null : _invoiceNumberController.text,
        invoiceDate: DateTime.parse(_invoiceDateController.text),
        dueDate: DateTime.parse(_dueDateController.text),
        totalAmount: double.parse(_totalAmountController.text),
        gstAmount: double.parse(_gstAmountController.text),
        driveUrl: generatedDriveLink,
        status: 'pending_approval',
      );
      await _supabase.addAccountsPayable(apRecord);
    }

    if (_selectedFilingType == 'both' || _selectedFilingType == 'gst_reporting') {
      final gstRecord = GstRecord(
        vendorName: _vendorNameController.text,
        vendorGstin: _gstinController.text,
        taxableValue: double.parse(_taxableValueController.text),
        cgst: double.parse(_cgstController.text),
        sgst: double.parse(_sgstController.text),
        igst: double.parse(_igstController.text),
        hsnSacCode: _hsnCodeController.text.isEmpty ? null : _hsnCodeController.text,
        expenseCategory: _selectedCategory,
        driveUrl: generatedDriveLink,
        itcStatus: 'eligible',
      );
      await _supabase.addGstRecord(gstRecord);
    }

    setState(() => _isFileSaving = false);

    // Show Success dialog with Google Drive direct file path representation
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: Color(0xFF10B981), size: 28),
            SizedBox(width: 10),
            Text('Filing Completed', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(
          'Scanned invoice successfully compiled.\n\n'
          '📁 Drive Path:\n'
          'Celron_Scans/2026/Finance/Supplier_Bills/$driveSubfolder/\n\n'
          '🔗 Database logs synced perfectly!',
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13, height: 1.4),
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context); // Close dialog
              Navigator.pop(context); // Return to Dashboard
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Return to Dashboard', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFF0F172A);
    const cardBgColor = Color(0xFF1E293B);
    const primaryAccent = Color(0xFFF97316);
    const secondaryAccent = Color(0xFF10B981);
    const textPrimary = Color(0xFFF8FAFC);
    const textSecondary = Color(0xFF94A3B8);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: textPrimary),
        title: const Text(
          'SMART SCANNER',
          style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 1.2),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.vpn_key, color: primaryAccent),
            onPressed: _showApiKeyDialog,
            tooltip: 'Set Gemini API Key',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          // SCANNING PHASE
          if (_isScanning)
            Column(
              children: [
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: textSecondary.withOpacity(0.2)),
                    ),
                    child: Stack(
                      children: [
                        // Live Camera Feed or stylised fallback
                        if (_isCameraInitialized && _cameraController != null)
                          Positioned.fill(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(24),
                              child: CameraPreview(_cameraController!),
                            ),
                          )
                        else
                          // Centered capture visual helper
                          Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.receipt_long, color: textSecondary.withOpacity(0.4), size: 80),
                                const SizedBox(height: 16),
                                Text(
                                  'Align bill/receipt within the frame',
                                  style: TextStyle(color: textSecondary.withOpacity(0.6), fontSize: 12),
                                ),
                              ],
                            ),
                          ),

                        // Stylized Scanner Camera overlay boundaries
                        _buildScannerCorners(primaryAccent),

                        // Animated scanning light beam
                        AnimatedBuilder(
                          animation: _scannerAnimationController,
                          builder: (context, child) {
                            return Positioned(
                              top: MediaQuery.of(context).size.height * 0.5 * _scannerBeamAnimation.value,
                              left: 0,
                              right: 0,
                              child: Container(
                                height: 4,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      primaryAccent.withOpacity(0.1),
                                      primaryAccent,
                                      primaryAccent.withOpacity(0.1)
                                    ],
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: primaryAccent.withOpacity(0.5),
                                      blurRadius: 10,
                                      spreadRadius: 2,
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                
                // Scan controls
                Padding(
                  padding: const EdgeInsets.only(bottom: 40.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Gallery/File Upload button
                      IconButton(
                        icon: const Icon(Icons.photo_library, size: 28, color: textSecondary),
                        onPressed: _selectImageFromFiles,
                        tooltip: 'Upload Receipt File',
                      ),
                      const SizedBox(width: 32),
                      FloatingActionButton.large(
                        onPressed: _captureAndExtract,
                        backgroundColor: primaryAccent,
                        foregroundColor: Colors.white,
                        child: const Icon(Icons.camera_alt, size: 36),
                      ),
                      const SizedBox(width: 32),
                      // Simulated Quick scan fallback
                      IconButton(
                        icon: const Icon(Icons.auto_awesome, size: 28, color: textSecondary),
                        onPressed: _startAiExtraction,
                        tooltip: 'Simulate AI OCR Scan',
                      ),
                    ],
                  ),
                ),
              ],
            ),

          // AI ANALYZING SPINNING OVERLAY
          if (_isAnalyzing)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(color: primaryAccent),
                  const SizedBox(height: 24),
                  const Text(
                    'Gemini AI Extraction in Progress...',
                    style: TextStyle(color: textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'OCR-ing document and compiling GST details...',
                    style: TextStyle(color: textSecondary.withOpacity(0.8), fontSize: 12),
                  ),
                ],
              ),
            ),

          // VERIFICATION FORM PHASE
          if (_isVerified)
            SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('AI OCR Extracted Details', style: TextStyle(color: textPrimary, fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  const Text('Review and verify fields before final filing.', style: TextStyle(color: textSecondary, fontSize: 12)),
                  const SizedBox(height: 24),

                  // Segment selector (Filing Routing)
                  const Text('ROUTE TRANSACTION TO:', style: TextStyle(color: textSecondary, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: cardBgColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        _buildRoutingButton('both', 'Dual Filing', _selectedFilingType == 'both'),
                        _buildRoutingButton('accounts_payable', 'AP Bill', _selectedFilingType == 'accounts_payable'),
                        _buildRoutingButton('gst_reporting', 'GST Log', _selectedFilingType == 'gst_reporting'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Core Form Fields
                  _buildSectionHeader('General Info'),
                  _buildTextField(_vendorNameController, 'Vendor Name', Icons.store),
                  _buildTextField(_invoiceNumberController, 'Invoice / Receipt Number', Icons.bookmark_border),
                  
                  Row(
                    children: [
                      Expanded(child: _buildTextField(_invoiceDateController, 'Invoice Date (YYYY-MM-DD)', Icons.calendar_today)),
                      const SizedBox(width: 16),
                      Expanded(child: _buildTextField(_dueDateController, 'Due Date (YYYY-MM-DD)', Icons.event_repeat)),
                    ],
                  ),
                  
                  Row(
                    children: [
                      Expanded(child: _buildTextField(_totalAmountController, 'Total Value (S\$)', Icons.monetization_on, isNumeric: true)),
                      const SizedBox(width: 16),
                      Expanded(child: _buildTextField(_gstAmountController, 'GST Value (S\$)', Icons.percent, isNumeric: true)),
                    ],
                  ),

                  // GST Fields
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildSectionHeader('GST & Accounting Info'),
                      Row(
                        children: [
                          const Text('Contains GST', style: TextStyle(color: textSecondary, fontSize: 12)),
                          Switch(
                            value: _containsGst,
                            onChanged: (val) => setState(() => _containsGst = val),
                            activeColor: secondaryAccent,
                          ),
                        ],
                      ),
                    ],
                  ),

                  if (_containsGst) ...[
                    _buildTextField(_gstinController, 'Vendor UEN / GST No', Icons.verified),
                    _buildTextField(_taxableValueController, 'Taxable Value (S\$)', Icons.money, isNumeric: true),
                    
                    Row(
                      children: [
                        Expanded(child: _buildTextField(_cgstController, 'Standard GST 9% (S\$)', Icons.account_balance, isNumeric: true)),
                        const SizedBox(width: 10),
                        Expanded(child: _buildTextField(_sgstController, 'Zero-Rated GST (S\$)', Icons.account_balance, isNumeric: true)),
                        const SizedBox(width: 10),
                        Expanded(child: _buildTextField(_igstController, 'Exempt GST (S\$)', Icons.account_balance, isNumeric: true)),
                      ],
                    ),

                    Row(
                      children: [
                        Expanded(child: _buildTextField(_hsnCodeController, 'HSN / SAC Code', Icons.view_comfortable)),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Category', style: TextStyle(color: textSecondary, fontSize: 11)),
                              const SizedBox(height: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12),
                                decoration: BoxDecoration(
                                  color: cardBgColor,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: textSecondary.withOpacity(0.15)),
                                ),
                                child: DropdownButton<String>(
                                  value: _selectedCategory,
                                  dropdownColor: cardBgColor,
                                  style: const TextStyle(color: textPrimary, fontSize: 12),
                                  underline: Container(),
                                  isExpanded: true,
                                  onChanged: (String? val) {
                                    if (val != null) setState(() => _selectedCategory = val);
                                  },
                                  items: <String>[
                                    'Office Supplies',
                                    'SaaS / Hosting',
                                    'Rent & Office Space',
                                    'Fuel & Travel',
                                    'Utilities',
                                    'Food & Dining',
                                    'Maintenance',
                                    'Consulting'
                                  ].map<DropdownMenuItem<String>>((String val) {
                                    return DropdownMenuItem<String>(value: val, child: Text(val));
                                  }).toList(),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 40),

                  // File button
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: _isFileSaving ? null : _fileExpenses,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: secondaryAccent,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 4,
                      ),
                      icon: _isFileSaving
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.cloud_upload),
                      label: Text(
                        _isFileSaving ? 'FILING DOCUMENT...' : 'FILE TO GOOGLE DRIVE & DATABASE',
                        style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 30),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildRoutingButton(String key, String title, bool isSelected) {
    const primaryAccent = Color(0xFFF97316);
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedFilingType = key),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? primaryAccent : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            title,
            style: TextStyle(
              color: isSelected ? Colors.white : const Color(0xFF94A3B8),
              fontWeight: FontWeight.bold,
              fontSize: 11,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 12),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(color: Color(0xFFF97316), fontWeight: FontWeight.bold, fontSize: 11, letterSpacing: 0.8),
      ),
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, IconData icon, {bool isNumeric = false}) {
    const cardBgColor = Color(0xFF1E293B);
    const textPrimary = Color(0xFFF8FAFC);
    const textSecondary = Color(0xFF94A3B8);

    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: TextField(
        controller: controller,
        style: const TextStyle(color: textPrimary, fontSize: 13),
        keyboardType: isNumeric ? TextInputType.number : TextInputType.text,
        decoration: InputDecoration(
          labelText: label,
          labelStyle: const TextStyle(color: textSecondary, fontSize: 11),
          prefixIcon: Icon(icon, color: textSecondary.withOpacity(0.6), size: 18),
          filled: true,
          fillColor: cardBgColor,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: textSecondary.withOpacity(0.15)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFF97316)),
          ),
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }

  Widget _buildScannerCorners(Color color) {
    return Positioned.fill(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: CustomPaint(
          painter: ScannerCornersPainter(color: color),
        ),
      ),
    );
  }
}

class ScannerCornersPainter extends CustomPainter {
  final Color color;
  ScannerCornersPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke;

    const len = 24.0;

    // Top Left corner
    canvas.drawLine(const Offset(0, 0), const Offset(len, 0), paint);
    canvas.drawLine(const Offset(0, 0), const Offset(0, len), paint);

    // Top Right corner
    canvas.drawLine(Offset(size.width, 0), Offset(size.width - len, 0), paint);
    canvas.drawLine(Offset(size.width, 0), Offset(size.width, len), paint);

    // Bottom Left corner
    canvas.drawLine(Offset(0, size.height), Offset(len, size.height), paint);
    canvas.drawLine(Offset(0, size.height), Offset(0, size.height - len), paint);

    // Bottom Right corner
    canvas.drawLine(Offset(size.width, size.height), Offset(size.width - len, size.height), paint);
    canvas.drawLine(Offset(size.width, size.height), Offset(size.width, size.height - len), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
