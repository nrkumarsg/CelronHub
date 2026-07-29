import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class CelronGatewayScreen extends StatefulWidget {
  const CelronGatewayScreen({Key? key}) : super(key: key);

  @override
  _CelronGatewayScreenState createState() => _CelronGatewayScreenState();
}

class _CelronGatewayScreenState extends State<CelronGatewayScreen> {
  static const String celronScansUrl = 'https://drive.google.com/drive/folders/1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w?usp=drive_link';
  static const String celronHubWebUrl = 'https://celronhub.vercel.app/scan-gateway';
  static const String celronWizardUrl = 'https://celronhub.vercel.app/workflows/wizard';
  static const String celronWhiteboardUrl = 'https://celronhub.vercel.app/workflows/whiteboard';

  Future<void> _launchUrl(String urlString) async {
    final Uri uri = Uri.parse(urlString);
    try {
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      }
    } catch (e) {
      debugPrint('Could not launch $urlString: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFF0F172A);
    const cardBgColor = Color(0xFF1E293B);
    const primaryIndigo = Color(0xFF6366F1);
    const textPrimary = Color(0xFFF8FAFC);
    const textSecondary = Color(0xFF94A3B8);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        centerTitle: false,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: primaryIndigo.withOpacity(0.2),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: primaryIndigo.withOpacity(0.4)),
              ),
              child: const Icon(Icons.qr_code_scanner, color: Color(0xFF38BDF8), size: 22),
            ),
            const SizedBox(width: 12),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CELRON GATEWAY',
                  style: TextStyle(
                    color: textPrimary,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    letterSpacing: 1.1,
                  ),
                ),
                Text(
                  'Direct Drive Scanner & Job Builder',
                  style: TextStyle(color: textSecondary, fontSize: 10),
                ),
              ],
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Dark Header Banner
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1E1B4B), Color(0xFF312E81)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.3),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    )
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withOpacity(0.2)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.phone_android, color: Color(0xFF38BDF8), size: 14),
                          SizedBox(width: 6),
                          Text(
                            'DEDICATED MOBILE SCAN GATEWAY',
                            style: TextStyle(color: Color(0xFF38BDF8), fontSize: 10, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Start From Scan & Direct Drive Launcher',
                      style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Tap any of the 3 Google Drive folder launchers below to scan paper using your phone\'s native camera scanner (with hardware edge-detection at 0 token cost), then tap Build Job.',
                      style: TextStyle(color: Color(0xFFC7D2FE), fontSize: 12, height: 1.4),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Start From Scan Instant Job Builder Action Banner
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF4F46E5).withOpacity(0.35),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    )
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.auto_awesome, color: Colors.white, size: 24),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Start From Scan: Instant Job Auto-Builder',
                            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Reads recent paper scan / email note -> Auto-generates ENQ No -> Provisions project folder & builds job',
                      style: TextStyle(color: Color(0xFFE0E7FF), fontSize: 11),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => _launchUrl(celronWizardUrl),
                        icon: const Icon(Icons.rocket_launch, color: Color(0xFF4F46E5), size: 18),
                        label: const Text(
                          '🚀 Parse Scan & Build Job',
                          style: TextStyle(color: Color(0xFF4F46E5), fontWeight: FontWeight.w800, fontSize: 14),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          elevation: 2,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => _launchUrl(celronWhiteboardUrl),
                        icon: const Icon(Icons.view_kanban, color: Colors.white, size: 18),
                        label: const Text(
                          '📌 Open Jobs Whiteboard',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFF59E0B),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          elevation: 2,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              const Text(
                '3 Primary Direct 1-Tap Google Drive Folder Launchers',
                style: TextStyle(color: textPrimary, fontSize: 14, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 14),

              // CARD 1: Celron_Scans Inbox (Enquiries)
              _buildFolderCard(
                badgeText: 'FOLDER 1 (ENQUIRIES)',
                badgeColor: const Color(0xFFDBEAFE),
                badgeTextColor: const Color(0xFF1E40AF),
                icon: Icons.folder,
                iconColor: const Color(0xFF2563EB),
                iconBg: const Color(0xFFEFF6FF),
                title: 'Celron_Scans Inbox',
                description: 'Primary landing folder for email enquiry printouts, paper notes & job specs. Native edge-detection scanning on phone.',
                buttonText: 'Open Celron_Scans (GDrive App)',
                buttonColor: const Color(0xFF2563EB),
                borderColor: const Color(0xFF3B82F6),
                onTap: () => _launchUrl(celronScansUrl),
              ),

              const SizedBox(height: 14),

              // CARD 2: Celron_BusinessCards Repository (Name Cards)
              _buildFolderCard(
                badgeText: 'FOLDER 2 (NAME CARDS)',
                badgeColor: const Color(0xFFF3E8FF),
                badgeTextColor: const Color(0xFF6B21A8),
                icon: Icons.contact_mail,
                iconColor: const Color(0xFFA855F7),
                iconBg: const Color(0xFFF3E8FF),
                title: 'Celron_BusinessCards Repository',
                description: 'Repository for single or merged Front & Back business card scans. Auto-saves contacts to Supabase.',
                buttonText: 'Open Business Cards (GDrive App)',
                buttonColor: const Color(0xFFA855F7),
                borderColor: const Color(0xFFA855F7),
                onTap: () => _launchUrl(celronScansUrl),
              ),

              const SizedBox(height: 14),

              // CARD 3: Celron_Invoices & Bills Scan (Bills & GST)
              _buildFolderCard(
                badgeText: 'FOLDER 3 (BILLS & GST)',
                badgeColor: const Color(0xFFD1FAE5),
                badgeTextColor: const Color(0xFF065F46),
                icon: Icons.receipt_long,
                iconColor: const Color(0xFF10B981),
                iconBg: const Color(0xFFECFDF5),
                title: 'Celron_Invoices & Bills Scan',
                description: 'Purchased items, supplier invoices & expense bills. Extracts 9% GST & connects directly to Accounts Payable (P&L).',
                buttonText: 'Open Invoices (GDrive App)',
                buttonColor: const Color(0xFF10B981),
                borderColor: const Color(0xFF10B981),
                onTap: () => _launchUrl(celronScansUrl),
              ),

              const SizedBox(height: 24),

              // Open CelronHub Web Portal Button
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => _launchUrl(celronHubWebUrl),
                  icon: const Icon(Icons.language, color: Color(0xFF38BDF8), size: 20),
                  label: const Text(
                    '🌐 Open CelronHub Web Portal',
                    style: TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: Color(0xFF38BDF8), width: 1.5),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFolderCard({
    required String badgeText,
    required Color badgeColor,
    required Color badgeTextColor,
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String description,
    required String buttonText,
    required Color buttonColor,
    required Color borderColor,
    required VoidCallback onTap,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor.withOpacity(0.5), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 8,
            offset: const Offset(0, 3),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor, size: 24),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: badgeColor,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badgeText,
                  style: TextStyle(color: badgeTextColor, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onTap,
              icon: const Icon(Icons.open_in_new, color: Colors.white, size: 16),
              label: Text(
                buttonText,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: buttonColor,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
