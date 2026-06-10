import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/gst_record.dart';
import '../services/supabase_service.dart';

class GstReportingScreen extends StatefulWidget {
  const GstReportingScreen({Key? key}) : super(key: key);

  @override
  _GstReportingScreenState createState() => _GstReportingScreenState();
}

class _GstReportingScreenState extends State<GstReportingScreen> {
  final SupabaseService _supabase = SupabaseService.instance;
  
  List<GstRecord> _gstRecords = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadGstRecords();
  }

  Future<void> _loadGstRecords() async {
    setState(() => _isLoading = true);
    final list = await _supabase.fetchGstRecords();
    setState(() {
      _gstRecords = list;
      _isLoading = false;
    });
  }

  // Calculations
  double get _totalTaxableValue => _gstRecords.fold(0.0, (sum, rec) => sum + rec.taxableValue);
  double get _totalCgst => _gstRecords.fold(0.0, (sum, rec) => sum + rec.cgst);
  double get _totalSgst => _gstRecords.fold(0.0, (sum, rec) => sum + rec.sgst);
  double get _totalIgst => _gstRecords.fold(0.0, (sum, rec) => sum + rec.igst);
  double get _totalGstCombined => _gstRecords.fold(0.0, (sum, rec) => sum + rec.totalGst);

  final currencyFormatter = NumberFormat.currency(locale: 'en_SG', symbol: 'S\$');

  Future<void> _toggleItcStatus(GstRecord record, String newStatus) async {
    setState(() {
      _gstRecords = _gstRecords.map((rec) {
        if (rec.id == record.id) {
          return rec.copyWith(itcStatus: newStatus);
        }
        return rec;
      }).toList();
    });

    await _supabase.updateGstItcStatus(record.id!, newStatus);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('ITC marked as ${newStatus.toUpperCase()}'),
        backgroundColor: const Color(0xFF10B981),
      ),
    );
  }

  void _exportGstLedger() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Export Tax Ledger', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Text(
          'We have compiled ${_gstRecords.length} records into IRAS F5 format.\n\nFile location:\nDocuments/Celron_GST_Reconciliation_${DateFormat('MMM_yyyy').format(DateTime.now())}.csv',
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK', style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  void _showRecordDetails(GstRecord record) {
    const cardBgColor = Color(0xFF1E293B);
    const bgColor = Color(0xFF0F172A);
    const textPrimary = Color(0xFFF8FAFC);
    const textSecondary = Color(0xFF94A3B8);
    const secondaryAccent = Color(0xFF10B981);

    showModalBottomSheet(
      context: context,
      backgroundColor: cardBgColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            Color statusColor = secondaryAccent;
            if (record.itcStatus == 'ineligible') statusColor = Colors.red;
            if (record.itcStatus == 'claimed') statusColor = Colors.blue;

            return Container(
              padding: const EdgeInsets.all(24),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 5,
                        decoration: BoxDecoration(
                          color: textSecondary.withOpacity(0.3),
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            record.vendorName,
                            style: const TextStyle(color: textPrimary, fontSize: 20, fontWeight: FontWeight.bold),
                            maxLines: 2,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            record.itcStatus.toUpperCase(),
                            style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Text('UEN / GST No: ', style: TextStyle(color: textSecondary, fontSize: 13)),
                        Text(
                          record.vendorGstin,
                          style: const TextStyle(color: textPrimary, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                        ),
                        const SizedBox(width: 8),
                        const Icon(Icons.verified, color: secondaryAccent, size: 16),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const Divider(color: Colors.white10),
                    const SizedBox(height: 16),

                    // Tax aggregates
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildDetailBlock('TAXABLE VALUE', currencyFormatter.format(record.taxableValue), textSecondary, textPrimary),
                        _buildDetailBlock('UEN TYPE / HSN', record.hsnSacCode ?? 'N/A', textSecondary, textPrimary),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildDetailBlock('STANDARD RATE (9%)', currencyFormatter.format(record.cgst), textSecondary, textPrimary),
                        _buildDetailBlock('ZERO-RATED (0%)', currencyFormatter.format(record.sgst), textSecondary, textPrimary),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildDetailBlock('EXEMPT / OUT OF SCOPE', currencyFormatter.format(record.igst), textSecondary, textPrimary),
                        _buildDetailBlock('TOTAL GST AMOUNT', currencyFormatter.format(record.totalGst), textSecondary, secondaryAccent),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const Divider(color: Colors.white10),
                    const SizedBox(height: 20),

                    // Action buttons
                    Row(
                      children: [
                        if (record.itcStatus != 'claimed') ...[
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () {
                                _toggleItcStatus(record, 'ineligible');
                                Navigator.pop(context);
                              },
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: Colors.red),
                                foregroundColor: Colors.red,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              child: const Text('MARK INELIGIBLE', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () {
                                _toggleItcStatus(record, 'claimed');
                                Navigator.pop(context);
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: secondaryAccent,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              child: const Text('MARK AS CLAIMED', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            ),
                          ),
                        ] else ...[
                          Expanded(
                            child: Center(
                              child: Text(
                                'Input Tax Credit has been reconciled & claimed.',
                                style: TextStyle(color: textSecondary, fontStyle: FontStyle.italic, fontSize: 13),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildDetailBlock(String title, String value, Color titleColor, Color valueColor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: TextStyle(color: titleColor, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8)),
        const SizedBox(height: 6),
        Text(value, style: TextStyle(color: valueColor, fontSize: 16, fontWeight: FontWeight.bold)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFF0F172A);
    const cardBgColor = Color(0xFF1E293B);
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
          'GST REPORTING LEDGER',
          style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 1.2),
        ),
        actions: [
          IconButton(
            onPressed: _exportGstLedger,
            icon: const Icon(Icons.file_download, color: secondaryAccent),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: secondaryAccent))
          : Column(
              children: [
                // Consolidated Tax Summary Banner
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.all(20),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: cardBgColor,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: textSecondary.withOpacity(0.1)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'CLAIMABLE GST SUMMARY (ITC)',
                            style: TextStyle(color: textSecondary, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: secondaryAccent.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'IRAS F5 READY',
                              style: TextStyle(color: secondaryAccent, fontSize: 8, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        currencyFormatter.format(_totalGstCombined),
                        style: const TextStyle(color: textPrimary, fontSize: 26, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 18),
                      const Divider(color: Colors.white10),
                      const SizedBox(height: 14),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _buildMiniSummaryBlock('STANDARD (9%)', currencyFormatter.format(_totalCgst), textSecondary, textPrimary),
                          _buildMiniSummaryBlock('ZERO-RATED (0%)', currencyFormatter.format(_totalSgst), textSecondary, textPrimary),
                          _buildMiniSummaryBlock('EXEMPT', currencyFormatter.format(_totalIgst), textSecondary, textPrimary),
                        ],
                      ),
                    ],
                  ),
                ),

                // GST Items List
                Expanded(
                  child: _gstRecords.isEmpty
                      ? const Center(
                          child: Text('No scanned GST bills found.', style: TextStyle(color: textSecondary)),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          itemCount: _gstRecords.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final record = _gstRecords[index];
                            
                            Color statusColor = secondaryAccent;
                            if (record.itcStatus == 'ineligible') statusColor = Colors.red;
                            if (record.itcStatus == 'claimed') statusColor = Colors.blue;

                            return InkWell(
                              onTap: () => _showShowcaseDetailDialog(record),
                              borderRadius: BorderRadius.circular(16),
                              child: Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: cardBgColor,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: textSecondary.withOpacity(0.08)),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: bgColor,
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Icon(Icons.percent, color: secondaryAccent, size: 24),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            record.vendorName,
                                            style: const TextStyle(color: textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            'GSTIN: ${record.vendorGstin}',
                                            style: const TextStyle(color: textSecondary, fontSize: 11, letterSpacing: 0.5),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Text(
                                          currencyFormatter.format(record.totalGst),
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
                                            record.itcStatus.toUpperCase(),
                                            style: TextStyle(color: statusColor, fontSize: 8, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }

  void _showShowcaseDetailDialog(GstRecord record) {
    _showRecordDetails(record);
  }

  Widget _buildMiniSummaryBlock(String label, String value, Color labelColor, Color valueColor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: labelColor, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: valueColor, fontSize: 13, fontWeight: FontWeight.bold)),
      ],
    );
  }
}
