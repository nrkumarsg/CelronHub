import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/accounts_payable.dart';
import '../services/supabase_service.dart';

class AccountsPayableScreen extends StatefulWidget {
  const AccountsPayableScreen({Key? key}) : super(key: key);

  @override
  _AccountsPayableScreenState createState() => _AccountsPayableScreenState();
}

class _AccountsPayableScreenState extends State<AccountsPayableScreen> with SingleTickerProviderStateMixin {
  final SupabaseService _supabase = SupabaseService.instance;
  late TabController _tabController;
  
  List<AccountsPayable> _invoices = [];
  bool _isLoading = true;
  String _selectedStatusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _tabController.addListener(_handleTabChange);
    _loadInvoices();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _handleTabChange() {
    if (_tabController.indexIsChanging) return;
    
    final filters = ['all', 'pending_approval', 'approved', 'paid'];
    setState(() {
      _selectedStatusFilter = filters[_tabController.index];
    });
  }

  Future<void> _loadInvoices() async {
    setState(() => _isLoading = true);
    final list = await _supabase.fetchAccountsPayable();
    setState(() {
      _invoices = list;
      _isLoading = false;
    });
  }

  List<AccountsPayable> get _filteredInvoices {
    if (_selectedStatusFilter == 'all') return _invoices;
    return _invoices.where((inv) => inv.status == _selectedStatusFilter).toList();
  }

  double get _totalApAmount {
    return _filteredInvoices.fold(0.0, (sum, inv) => sum + inv.totalAmount);
  }

  final currencyFormatter = NumberFormat.currency(locale: 'en_SG', symbol: 'S\$');

  Future<void> _updateInvoiceStatus(AccountsPayable invoice, String newStatus) async {
    // Optimistic UI Update
    setState(() {
      _invoices = _invoices.map((inv) {
        if (inv.id == invoice.id) {
          return inv.copyWith(status: newStatus);
        }
        return inv;
      }).toList();
    });

    await _supabase.updateApStatus(invoice.id!, newStatus);
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Bill marked as ${newStatus.toUpperCase().replaceAll('_', ' ')}'),
        backgroundColor: const Color(0xFF10B981),
      ),
    );
  }

  void _showInvoiceDetails(AccountsPayable invoice) {
    const cardBgColor = Color(0xFF1E293B);
    const bgColor = Color(0xFF0F172A);
    const primaryAccent = Color(0xFFF97316);
    const textPrimary = Color(0xFFF8FAFC);
    const textSecondary = Color(0xFF94A3B8);

    showModalBottomSheet(
      context: context,
      backgroundColor: cardBgColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            Color statusColor = primaryAccent;
            if (invoice.status == 'approved') statusColor = Colors.blue;
            if (invoice.status == 'paid') statusColor = const Color(0xFF10B981);
            if (invoice.status == 'rejected') statusColor = Colors.red;

            return Container(
              padding: const EdgeInsets.all(24),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Pull Handle bar
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
                            invoice.vendorName,
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
                            invoice.status.toUpperCase().replaceAll('_', ' '),
                            style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Invoice No: ${invoice.invoiceNumber ?? "N/A"}',
                      style: const TextStyle(color: textSecondary, fontSize: 13),
                    ),
                    const SizedBox(height: 20),
                    const Divider(color: Colors.white10),
                    const SizedBox(height: 16),
                    
                    // Core Details
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildDetailBlock('INVOICE DATE', DateFormat('dd MMM yyyy').format(invoice.invoiceDate), textSecondary, textPrimary),
                        _buildDetailBlock('DUE DATE', DateFormat('dd MMM yyyy').format(invoice.dueDate ?? DateTime.now()), textSecondary, textPrimary),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildDetailBlock('GST AMOUNT', currencyFormatter.format(invoice.gstAmount), textSecondary, textPrimary),
                        _buildDetailBlock('TOTAL AMOUNT', currencyFormatter.format(invoice.totalAmount), textSecondary, primaryAccent),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const Divider(color: Colors.white10),
                    const SizedBox(height: 20),
                    
                    // Google Drive Filing URL
                    if (invoice.driveUrl != null)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: bgColor,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.cloud_done, color: Colors.blue, size: 24),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Filed in Google Drive', style: TextStyle(color: textPrimary, fontSize: 13, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 2),
                                  Text(
                                    invoice.driveUrl!,
                                    style: const TextStyle(color: textSecondary, fontSize: 10),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () {
                                // Simulate launching Drive URL
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Opening Google Drive scanned document...')),
                                );
                              },
                              icon: const Icon(Icons.open_in_new, color: textSecondary, size: 20),
                            ),
                          ],
                        ),
                      ),
                    
                    const SizedBox(height: 28),
                    // Action Buttons for Approval Matrix
                    Row(
                      children: [
                        if (invoice.status == 'pending_approval') ...[
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () {
                                _updateInvoiceStatus(invoice, 'rejected');
                                Navigator.pop(context);
                              },
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: Colors.red),
                                foregroundColor: Colors.red,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              child: const Text('REJECT', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () {
                                _updateInvoiceStatus(invoice, 'approved');
                                Navigator.pop(context);
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.blue,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              child: const Text('APPROVE', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ] else if (invoice.status == 'approved') ...[
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () {
                                _updateInvoiceStatus(invoice, 'paid');
                                Navigator.pop(context);
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF10B981),
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              icon: const Icon(Icons.check_circle_outline),
                              label: const Text('MARK AS PAID', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ] else ...[
                          Expanded(
                            child: Center(
                              child: Text(
                                'Invoice processing is finalized.',
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
    const primaryAccent = Color(0xFFF97316);
    const textPrimary = Color(0xFFF8FAFC);
    const textSecondary = Color(0xFF94A3B8);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: textPrimary),
        title: const Text(
          'ACCOUNTS PAYABLE',
          style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 1.2),
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: primaryAccent,
          labelColor: primaryAccent,
          unselectedLabelColor: textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          tabs: const [
            Tab(text: 'ALL'),
            Tab(text: 'PENDING'),
            Tab(text: 'APPROVED'),
            Tab(text: 'PAID'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: primaryAccent))
          : Column(
              children: [
                // Summary Panel
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.all(20),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: cardBgColor,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: textSecondary.withOpacity(0.1)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'TOTAL OUTSTANDING LIABILITIES',
                        style: TextStyle(color: textSecondary, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        currencyFormatter.format(_totalApAmount),
                        style: const TextStyle(color: textPrimary, fontSize: 26, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'For ${_filteredInvoices.length} invoices matching active filters',
                        style: const TextStyle(color: textSecondary, fontSize: 11),
                      ),
                    ],
                  ),
                ),

                // Invoice List
                Expanded(
                  child: _filteredInvoices.isEmpty
                      ? const Center(
                          child: Text('No accounts payable bills match this filter.', style: TextStyle(color: textSecondary)),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          itemCount: _filteredInvoices.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final invoice = _filteredInvoices[index];
                            
                            Color statusColor = primaryAccent;
                            if (invoice.status == 'approved') statusColor = Colors.blue;
                            if (invoice.status == 'paid') statusColor = const Color(0xFF10B981);
                            if (invoice.status == 'rejected') statusColor = Colors.red;

                            return InkWell(
                              onTap: () => _showInvoiceDetails(invoice),
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
                                      child: const Icon(Icons.receipt_long, color: primaryAccent, size: 24),
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
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}
