import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/accounts_payable.dart';
import '../models/gst_record.dart';
import '../services/supabase_service.dart';
import 'accounts_payable_screen.dart';
import 'gst_reporting_screen.dart';
import 'scanner_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({Key? key}) : super(key: key);

  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final SupabaseService _supabase = SupabaseService.instance;
  
  List<AccountsPayable> _apInvoices = [];
  List<GstRecord> _gstRecords = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    setState(() => _isLoading = true);
    final apList = await _supabase.fetchAccountsPayable();
    final gstList = await _supabase.fetchGstRecords();
    
    setState(() {
      _apInvoices = apList;
      _gstRecords = gstList;
      _isLoading = false;
    });
  }

  double get _totalApAmount {
    return _apInvoices
        .where((inv) => inv.status != 'paid')
        .fold(0.0, (sum, inv) => sum + inv.totalAmount);
  }

  double get _totalGstItcAmount {
    return _gstRecords
        .where((rec) => rec.itcStatus == 'eligible')
        .fold(0.0, (sum, rec) => sum + rec.totalGst);
  }

  final currencyFormatter = NumberFormat.currency(locale: 'en_SG', symbol: 'S\$');

  @override
  Widget build(BuildContext context) {
    // Premium Design Palette (Deep Navy slate, vivid orange, emerald green)
    const bgColor = Color(0xFF0F172A);
    const cardBgColor = Color(0xFF1E293B);
    const primaryAccent = Color(0xFFF97316); // Orange
    const secondaryAccent = Color(0xFF10B981); // Emerald Green
    const textPrimary = Color(0xFFF8FAFC);
    const textSecondary = Color(0xFF94A3B8);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: primaryAccent.withOpacity(0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: primaryAccent.withOpacity(0.3)),
              ),
              child: const Icon(Icons.account_balance_wallet, color: primaryAccent, size: 24),
            ),
            const SizedBox(width: 12),
            const Text(
              'CELRON EXPENSES',
              style: TextStyle(
                color: textPrimary,
                fontWeight: FontWeight.bold,
                fontSize: 18,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _loadDashboardData,
            icon: const Icon(Icons.refresh, color: textSecondary),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: primaryAccent))
          : RefreshIndicator(
              onRefresh: _loadDashboardData,
              color: primaryAccent,
              backgroundColor: cardBgColor,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Welcome & Subtitle
                    const Text(
                      'Welcome back, Finance Team',
                      style: TextStyle(
                        color: textSecondary,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Corporate Ledger Overview',
                      style: TextStyle(
                        color: textPrimary,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Metrics Carousel Grid (Glassmorphic design blocks)
                    Row(
                      children: [
                        // Accounts Payable Card (Orange)
                        Expanded(
                          child: InkWell(
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(builder: (context) => const AccountsPayableScreen()),
                              ).then((_) => _loadDashboardData());
                            },
                            child: Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: cardBgColor,
                                borderRadius: BorderRadius.circular(24),
                                border: Border.all(color: primaryAccent.withOpacity(0.3), width: 1.5),
                                boxShadow: [
                                  BoxShadow(
                                    color: primaryAccent.withOpacity(0.1),
                                    blurRadius: 20,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: primaryAccent.withOpacity(0.15),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(Icons.hourglass_empty, color: primaryAccent, size: 20),
                                  ),
                                  const SizedBox(height: 20),
                                  const Text(
                                    'Accounts Payable',
                                    style: TextStyle(color: textSecondary, fontSize: 13, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    currencyFormatter.format(_totalApAmount),
                                    style: const TextStyle(
                                      color: textPrimary,
                                      fontSize: 20,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      Text(
                                        '${_apInvoices.where((inv) => inv.status == 'pending_approval').length} Bills Pending',
                                        style: const TextStyle(color: primaryAccent, fontSize: 11, fontWeight: FontWeight.bold),
                                      ),
                                      const Icon(Icons.arrow_forward_ios, size: 10, color: primaryAccent),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        // GST ITC Refund Card (Green)
                        Expanded(
                          child: InkWell(
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(builder: (context) => const GstReportingScreen()),
                              ).then((_) => _loadDashboardData());
                            },
                            child: Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: cardBgColor,
                                borderRadius: BorderRadius.circular(24),
                                border: Border.all(color: secondaryAccent.withOpacity(0.3), width: 1.5),
                                boxShadow: [
                                  BoxShadow(
                                    color: secondaryAccent.withOpacity(0.1),
                                    blurRadius: 20,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: secondaryAccent.withOpacity(0.15),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(Icons.percent, color: secondaryAccent, size: 20),
                                  ),
                                  const SizedBox(height: 20),
                                  const Text(
                                    'Claimable GST ITC',
                                    style: TextStyle(color: textSecondary, fontSize: 13, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    currencyFormatter.format(_totalGstItcAmount),
                                    style: const TextStyle(
                                      color: textPrimary,
                                      fontSize: 20,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      Text(
                                        '${_gstRecords.length} Invoices Tracked',
                                        style: const TextStyle(color: secondaryAccent, fontSize: 11, fontWeight: FontWeight.bold),
                                      ),
                                      const Icon(Icons.arrow_forward_ios, size: 10, color: secondaryAccent),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 32),

                    // Quick AI Scanner Banner
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [primaryAccent.withOpacity(0.8), primaryAccent],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: primaryAccent.withOpacity(0.4),
                            blurRadius: 15,
                            offset: const Offset(0, 5),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Intelligent Scanning',
                                  style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Scan bills and receipts instantly. Gemini AI extracts values and syncs database & Drive automatically.',
                                  style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 12, height: 1.4),
                                ),
                                const SizedBox(height: 16),
                                ElevatedButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(builder: (context) => const ScannerScreen()),
                                    ).then((_) => _loadDashboardData());
                                  },
                                  style: ElevatedButton.styleFrom(
                                    foregroundColor: primaryAccent,
                                    backgroundColor: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                  ),
                                  icon: const Icon(Icons.document_scanner, size: 16),
                                  label: const Text('SCAN NOW', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Opacity(
                            opacity: 0.9,
                            child: Image.network(
                              'https://cdn-icons-png.flaticon.com/512/8297/8297397.png', // Scanner Graphic
                              height: 100,
                              width: 100,
                              fit: BoxFit.contain,
                              errorBuilder: (c, o, s) => const Icon(Icons.camera_alt, size: 60, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),

                    // Recent Actions Title
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Recent Expense Invoices',
                          style: TextStyle(color: textPrimary, fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                        TextButton(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(builder: (context) => const AccountsPayableScreen()),
                            ).then((_) => _loadDashboardData());
                          },
                          child: const Text('View All', style: TextStyle(color: primaryAccent, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // AP Invoices List
                    _apInvoices.isEmpty
                        ? const Center(
                            child: Padding(
                              padding: EdgeInsets.symmetric(vertical: 30),
                              child: Text('No invoice scans found.', style: TextStyle(color: textSecondary)),
                            ),
                          )
                        : ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: _apInvoices.take(3).length,
                            separatorBuilder: (context, index) => const SizedBox(height: 12),
                            itemBuilder: (context, index) {
                              final invoice = _apInvoices[index];
                              
                              Color statusColor = primaryAccent;
                              if (invoice.status == 'approved') statusColor = Colors.blue;
                              if (invoice.status == 'paid') statusColor = secondaryAccent;
                              if (invoice.status == 'rejected') statusColor = Colors.red;

                              return Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: cardBgColor,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: textSecondary.withOpacity(0.1)),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: bgColor,
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Icon(Icons.description, color: primaryAccent, size: 24),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            invoice.vendorName,
                                            style: const TextStyle(color: textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            'Due: ${DateFormat('dd MMM yyyy').format(invoice.dueDate ?? DateTime.now())}',
                                            style: const TextStyle(color: textSecondary, fontSize: 11),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Text(
                                          currencyFormatter.format(invoice.totalAmount),
                                          style: const TextStyle(color: textPrimary, fontWeight: FontWeight.w800, fontSize: 14),
                                        ),
                                        const SizedBox(height: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: statusColor.withOpacity(0.15),
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            invoice.status.toUpperCase().replaceAll('_', ' '),
                                            style: TextStyle(color: statusColor, fontSize: 8, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ],
                ),
              ),
            ),
    );
  }
}
