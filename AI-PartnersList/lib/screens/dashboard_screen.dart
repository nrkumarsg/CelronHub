import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../theme/premium_theme.dart';
import '../models/partner.dart';
import '../models/contact.dart';
import '../services/drive_service.dart';
import '../services/env_config.dart';
import '../services/supabase_service.dart';
import '../services/openai_service.dart';
import '../services/duplicate_service.dart';
import 'verification_screen.dart';
import 'directory_screen.dart';
import '../services/token_helper.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final SupabaseService _db = SupabaseService.instance;
  final DriveService _drive = DriveService.instance;
  final OpenAiService _ai = OpenAiService.instance;
  final DuplicateService _dups = DuplicateService.instance;

  List<DriveFile> _driveItems = [];
  List<Partner> _partners = [];
  List<Contact> _contacts = [];
  bool _isLoading = true;
  bool _isSyncing = false;
  String _syncMessage = '';

  // Currently Selected File from GDrive Tree
  DriveFile? _selectedFile;
  bool _isProcessingSelected = false;
  String _processingLog = '';

  // Folder expansion toggles (Folder ID -> isExpanded)
  final Map<String, bool> _folderExpansions = {};

  @override
  void initState() {
    super.initState();
    // Parse Google OAuth2 callback parameters from URL hash
    TokenHelper.parseOAuthCallback();
    
    _loadInitialData().then((_) {
      // Auto-scan on load to populate the GDrive tree explorer!
      _scanGoogleDrive();
    });
  }

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    try {
      await _db.init();
      final partners = await _db.getPartners();
      final contacts = await _db.getContacts();

      setState(() {
        _partners = partners;
        _contacts = contacts;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load CRM data: $e'), backgroundColor: PremiumTheme.error),
      );
    }
  }

  // Scan folder CelronBuscards on Google Drive
  Future<void> _scanGoogleDrive() async {
    if (_isSyncing) return;
    setState(() {
      _isSyncing = true;
      _syncMessage = 'Scanning CelronBuscards Google Drive folder...';
    });

    try {
      final driveFiles = await _drive.listCards();
      
      setState(() {
        _driveItems = driveFiles;
        _isSyncing = false;
        _syncMessage = '';
      });

      // Default expand the root folder expands
      _folderExpansions[EnvConfig.driveFolderId] = true;
      for (var item in _driveItems) {
        if (item.isFolder) {
          _folderExpansions[item.id] = _folderExpansions[item.id] ?? false;
        }
      }
    } catch (e) {
      setState(() {
        _isSyncing = false;
        _syncMessage = '';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Drive Scan failed: $e'), backgroundColor: PremiumTheme.error),
      );
    }
  }

  // Trigger AI extraction on the selected card
  Future<void> _processSelectedCard() async {
    if (_selectedFile == null || _isProcessingSelected) return;
    
    setState(() {
      _isProcessingSelected = true;
      _processingLog = 'Downloading card image from Google Drive...';
    });

    try {
      // 1. Download file bytes from Google Drive
      final bytes = await _drive.downloadFile(_selectedFile!.id);
      
      // 2. Call OpenAI Vision model
      setState(() {
        _processingLog = 'Sending image to OpenAI GPT-4o-mini Vision extraction model...';
      });
      
      final extraction = await _ai.extractBusinessCard(bytes, _selectedFile!.name);

      setState(() {
        _processingLog = 'AI analysis successfully finished! Opening form...';
        _isProcessingSelected = false;
      });

      // 3. Open manual verification screen
      _verifySelectedCard(_selectedFile!, extraction, bytes);
    } catch (e) {
      setState(() {
        _isProcessingSelected = false;
        _processingLog = 'Failed: $e';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('AI extraction failed: $e'), backgroundColor: PremiumTheme.error),
      );
    }
  }

  void _verifySelectedCard(DriveFile file, ExtractionResult extraction, Uint8List bytes) async {
    final directUrl = _drive.getDirectUrl(file.id);
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => VerificationScreen(
          driveFileId: file.id,
          filename: file.name,
          frontImageUrl: directUrl,
          aiResult: extraction,
          imageBytes: bytes,
        ),
      ),
    );

    if (result == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Partner & Contact created successfully!'), backgroundColor: PremiumTheme.success),
      );
      await _loadInitialData(); // Reload stats
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: PremiumTheme.background,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: PremiumTheme.primary))
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  _buildHeader(),
                  const SizedBox(height: 20),

                  // Main split screen explorer
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        bool isWide = constraints.maxWidth > 900;
                        if (isWide) {
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Left Panel (40% width): GDrive Explorer Tree
                              Expanded(flex: 5, child: _buildDriveExplorerPanel()),
                              const SizedBox(width: 24),
                              // Right Panel (60% width): Selected Card Preview Console
                              Expanded(flex: 7, child: _buildPreviewPanePanel()),
                            ],
                          );
                        } else {
                          return SingleChildScrollView(
                            child: Column(
                              children: [
                                SizedBox(height: 400, child: _buildDriveExplorerPanel()),
                                const SizedBox(height: 24),
                                SizedBox(height: 500, child: _buildPreviewPanePanel()),
                              ],
                            ),
                          );
                        }
                      },
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildHeader() {
    final hasToken = TokenHelper.getGoogleAccessToken() != null;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Celron Business Card CRM', style: PremiumTheme.headingLarge),
            const SizedBox(height: 4),
            Text('AI-powered supplier intelligence platform', style: PremiumTheme.bodyNormal),
          ],
        ),
        Row(
          children: [
            // Dynamic Google Authentication indicator
            if (hasToken) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: PremiumTheme.success.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: PremiumTheme.success.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: PremiumTheme.success, size: 18),
                    const SizedBox(width: 8),
                    const Text('Google Connected', style: TextStyle(color: PremiumTheme.success, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 4),
                    IconButton(
                      icon: const Icon(Icons.logout, color: PremiumTheme.error, size: 18),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        TokenHelper.logout();
                        setState(() {
                          _driveItems = [];
                          _selectedFile = null;
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Disconnected from Google Drive.'), backgroundColor: PremiumTheme.info),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ] else ...[
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: Colors.black87,
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 2,
                ),
                onPressed: () {
                  TokenHelper.login();
                },
                icon: Image.network(
                  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/24px-Google_%22G%22_logo.svg.png',
                  width: 18,
                  height: 18,
                  errorBuilder: (context, error, stackTrace) => const Icon(Icons.login, color: Colors.blue),
                ),
                label: const Text('Google Sign-In', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
            const SizedBox(width: 12),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: PremiumTheme.surface,
                foregroundColor: PremiumTheme.textPrimary,
                side: const BorderSide(color: PremiumTheme.border),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (context) => const DirectoryScreen()),
                );
              },
              icon: const Icon(Icons.folder_shared, size: 20),
              label: const Text('View Directory'),
            ),
            const SizedBox(width: 12),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: PremiumTheme.primary,
                foregroundColor: PremiumTheme.textPrimary,
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 4,
              ),
              onPressed: _isSyncing ? null : _scanGoogleDrive,
              icon: _isSyncing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh, size: 20),
              label: Text(_isSyncing ? 'Loading Drive...' : 'Refresh Google Drive'),
            ),
          ],
        ),
      ],
    );
  }

  // LEFT COLUMN: Google Drive Explorer Panel
  Widget _buildDriveExplorerPanel() {
    // Group GDrive items by their parent references
    final rootId = EnvConfig.driveFolderId;
    final List<DriveFile> rootItems = _driveItems.where((x) => x.parents.contains(rootId) || x.parents.isEmpty).toList();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: PremiumTheme.glassDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Google Drive Explorer', style: PremiumTheme.headingMedium),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: PremiumTheme.success.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'Folder: CelronBuscards',
                  style: PremiumTheme.labelMicro.copyWith(color: PremiumTheme.success),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: _driveItems.isEmpty
                ? Center(
                    child: _isSyncing
                        ? const CircularProgressIndicator(color: PremiumTheme.primary)
                        : Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.cloud_off, size: 48, color: PremiumTheme.textSecondary.withOpacity(0.5)),
                              const SizedBox(height: 16),
                              Text('No files loaded.', style: PremiumTheme.bodyBold),
                              const SizedBox(height: 8),
                              Text('Click "Refresh Google Drive" above.', style: PremiumTheme.bodyNormal),
                            ],
                          ),
                  )
                : ListView(
                    children: [
                      // Folder Root Node
                      _buildFolderNode(
                        id: rootId,
                        name: 'CelronBuscards (Root)',
                        children: rootItems,
                        depth: 0,
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  // Recursive widget helper to render folder expansions
  Widget _buildFolderNode({
    required String id,
    required String name,
    required List<DriveFile> children,
    required int depth,
  }) {
    final bool isExpanded = _folderExpansions[id] ?? false;

    // Filter subfolders and files inside this parent folder
    final folders = children.where((x) => x.isFolder).toList();
    final files = children.where((x) => !x.isFolder).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Folder Row Click trigger
        InkWell(
          onTap: () {
            setState(() {
              _folderExpansions[id] = !isExpanded;
            });
          },
          child: Padding(
            padding: EdgeInsets.only(left: depth * 16.0, top: 8, bottom: 8),
            child: Row(
              children: [
                Icon(
                  isExpanded ? Icons.arrow_drop_down : Icons.arrow_right,
                  color: PremiumTheme.textSecondary,
                ),
                const Icon(Icons.folder, color: PremiumTheme.warning, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    name,
                    style: PremiumTheme.bodyBold.copyWith(
                      color: isExpanded ? PremiumTheme.primary : PremiumTheme.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        
        // Children expansion container
        if (isExpanded) ...[
          // Subfolders
          ...folders.map((f) {
            final subChildren = _driveItems.where((x) => x.parents.contains(f.id)).toList();
            return _buildFolderNode(
              id: f.id,
              name: f.name == 'Subfolder' ? 'Subdirectory (${f.id.substring(0, 5)})' : f.name,
              children: subChildren,
              depth: depth + 1,
            );
          }),
          
          // Files
          ...files.map((file) => _buildFileNode(file, depth + 1)),
        ],
      ],
    );
  }

  Widget _buildFileNode(DriveFile file, int depth) {
    final bool isSelected = _selectedFile?.id == file.id;
    final bool isAlreadyImported = _partners.any(
      (p) => p.businessCardUrl != null && p.businessCardUrl!.contains(file.id)
    );

    IconData fileIcon = Icons.insert_drive_file;
    Color fileColor = PremiumTheme.textSecondary;

    if (file.mimeType.contains('image')) {
      fileIcon = Icons.image;
      fileColor = PremiumTheme.accent;
    } else if (file.mimeType.contains('pdf')) {
      fileIcon = Icons.picture_as_pdf;
      fileColor = PremiumTheme.error;
    }

    return InkWell(
      onTap: () {
        setState(() {
          _selectedFile = file;
          _processingLog = '';
        });
      },
      child: Container(
        margin: EdgeInsets.only(left: depth * 16.0 + 8.0, top: 4, bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? PremiumTheme.primary.withOpacity(0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isSelected ? Border.all(color: PremiumTheme.primary.withOpacity(0.5)) : null,
        ),
        child: Row(
          children: [
            Icon(fileIcon, color: fileColor, size: 16),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                file.name,
                style: PremiumTheme.bodyNormal.copyWith(
                  color: isSelected ? PremiumTheme.textPrimary : PremiumTheme.textSecondary,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ),
            if (isAlreadyImported) ...[
              const SizedBox(width: 8),
              const Icon(Icons.verified, color: PremiumTheme.success, size: 16),
            ],
          ],
        ),
      ),
    );
  }

  // RIGHT COLUMN: Selected Card Preview & AI Processing Console
  Widget _buildPreviewPanePanel() {
    if (_selectedFile == null) {
      return Container(
        padding: const EdgeInsets.all(32),
        decoration: PremiumTheme.glassDecoration(),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.touch_app, size: 64, color: PremiumTheme.textSecondary.withOpacity(0.4)),
            const SizedBox(height: 20),
            Text('No card selected', style: PremiumTheme.headingMedium),
            const SizedBox(height: 8),
            Text(
              'Select any image or PDF file from the Google Drive Tree on the left to preview and process it.',
              textAlign: TextAlign.center,
              style: PremiumTheme.bodyNormal,
            ),
          ],
        ),
      );
    }

    final directUrl = _drive.getDirectUrl(_selectedFile!.id);
    final bool isAlreadyImported = _partners.any(
      (p) => p.businessCardUrl != null && p.businessCardUrl!.contains(_selectedFile!.id)
    );

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: PremiumTheme.glassDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Selected File Header Details
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_selectedFile!.name, style: PremiumTheme.headingMedium.copyWith(fontSize: 18)),
                    const SizedBox(height: 4),
                    Text(
                      'Size: ${_selectedFile!.size != null ? (_selectedFile!.size! / 1024).toStringAsFixed(1) : "Unknown"} KB',
                      style: PremiumTheme.labelMicro,
                    ),
                  ],
                ),
              ),
              if (isAlreadyImported) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: PremiumTheme.success.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: PremiumTheme.success.withOpacity(0.4)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.verified, color: PremiumTheme.success, size: 16),
                      const SizedBox(width: 6),
                      Text('Already Imported', style: PremiumTheme.labelMicro.copyWith(color: PremiumTheme.success)),
                    ],
                  ),
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: PremiumTheme.warning.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: PremiumTheme.warning.withOpacity(0.4)),
                  ),
                  child: Text('Not Yet Processed', style: PremiumTheme.labelMicro.copyWith(color: PremiumTheme.warning)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 18),

          // Business Card Preview Area
          Expanded(
            flex: 5,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: double.infinity,
                color: PremiumTheme.background.withOpacity(0.5),
                child: InteractiveViewer(
                  maxScale: 4.0,
                  child: Image.network(
                    directUrl,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.picture_as_pdf, size: 64, color: PremiumTheme.error),
                        const SizedBox(height: 12),
                        Text('PDF / Non-Image File Preview Not Supported', style: PremiumTheme.bodyBold),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),

          // AI Console logs
          if (_processingLog.isNotEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.3),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: PremiumTheme.border.withOpacity(0.5)),
              ),
              child: Text(
                'AI Console > $_processingLog',
                style: const TextStyle(color: Colors.greenAccent, fontFamily: 'monospace', fontSize: 12),
              ),
            ),
          ],

          // Process Buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (_isProcessingSelected) ...[
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: PremiumTheme.primary),
                ),
                const SizedBox(width: 16),
              ],
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isAlreadyImported ? PremiumTheme.surface : PremiumTheme.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: _isProcessingSelected ? null : _processSelectedCard,
                icon: const Icon(Icons.rocket_launch),
                label: Text(
                  isAlreadyImported ? 'Extract Again with AI' : 'Extract & Autofill with AI',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
