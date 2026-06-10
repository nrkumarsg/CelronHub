import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/premium_theme.dart';
import '../models/partner.dart';
import '../models/contact.dart';
import '../services/supabase_service.dart';

class DirectoryScreen extends StatefulWidget {
  const DirectoryScreen({super.key});

  @override
  State<DirectoryScreen> createState() => _DirectoryScreenState();
}

class _DirectoryScreenState extends State<DirectoryScreen> {
  final SupabaseService _db = SupabaseService.instance;

  List<Partner> _allPartners = [];
  List<Contact> _allContacts = [];
  List<Partner> _filteredPartners = [];
  bool _isLoading = true;

  // Search & Filter state
  String _searchQuery = '';
  String _selectedCategory = 'All';
  String _selectedCountry = 'All';
  String _selectedIndustry = 'All';

  final List<String> _categories = [
    'All', 'Principal', 'Supplier', 'Customer', 'Automation', 'Electrical', 'Mechanical', 'Instrumentation', 'Safety Equipment'
  ];

  final List<String> _countries = ['All', 'Singapore', 'Malaysia', 'Indonesia', 'Germany', 'USA', 'India'];
  
  final List<String> _industries = [
    'All', 'Marine', 'Offshore', 'Automation', 'Electrical', 'Hydraulic', 'Safety', 'Industrial', 'Instrumentation', 'Spare Parts', 'Ship Repair'
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final partners = await _db.getPartners();
      final contacts = await _db.getContacts();
      setState(() {
        _allPartners = partners;
        _allContacts = contacts;
        _filteredPartners = partners;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load directory: $e'), backgroundColor: PremiumTheme.error),
      );
    }
  }

  void _applyFilters() {
    setState(() {
      _filteredPartners = _allPartners.where((partner) {
        // 1. Search Query filter
        final matchSearch = partner.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
            (partner.address != null && partner.address!.toLowerCase().contains(_searchQuery.toLowerCase())) ||
            (partner.brands != null && partner.brands!.toLowerCase().contains(_searchQuery.toLowerCase()));

        // 2. Category tag filter
        final matchCategory = _selectedCategory == 'All' ||
            partner.types.any((t) => t.toLowerCase() == _selectedCategory.toLowerCase());

        // 3. Country filter
        final matchCountry = _selectedCountry == 'All' ||
            (partner.country != null && partner.country!.toLowerCase() == _selectedCountry.toLowerCase());

        // 4. Industry filter (mapped in other fields or notes)
        final matchIndustry = _selectedIndustry == 'All' ||
            (partner.others != null && partner.others!.toLowerCase().contains(_selectedIndustry.toLowerCase())) ||
            (partner.info != null && partner.info!.toLowerCase().contains(_selectedIndustry.toLowerCase()));

        return matchSearch && matchCategory && matchCountry && matchIndustry;
      }).toList();
    });
  }

  // Quick WhatsApp link trigger
  Future<void> _launchWhatsApp(String phone) async {
    final cleanPhone = phone.replaceAll(RegExp(r'\D'), '');
    final url = Uri.parse('https://wa.me/$cleanPhone');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  // Quick Mail trigger
  Future<void> _launchMail(String email) async {
    final url = Uri.parse('mailto:$email');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: PremiumTheme.background,
      appBar: AppBar(
        title: const Text('Marine Supplier & Partner Directory'),
        backgroundColor: PremiumTheme.surface,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: PremiumTheme.primary))
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Filter bar Row
                  _buildFilterBar(),
                  const SizedBox(height: 24),

                  // Directory Table list
                  Expanded(
                    child: _filteredPartners.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.search_off, size: 64, color: PremiumTheme.textSecondary.withOpacity(0.5)),
                                const SizedBox(height: 16),
                                Text('No matching partners found.', style: PremiumTheme.bodyBold),
                              ],
                            ),
                          )
                        : ListView.separated(
                            itemCount: _filteredPartners.length,
                            separatorBuilder: (context, index) => const SizedBox(height: 16),
                            itemBuilder: (context, index) {
                              final partner = _filteredPartners[index];
                              final partnerContacts = _allContacts.where((c) => c.partnerId == partner.id).toList();
                              return _buildPartnerCard(partner, partnerContacts);
                            },
                          ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: PremiumTheme.glassDecoration(),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextField(
                  style: const TextStyle(color: PremiumTheme.textPrimary),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search, color: PremiumTheme.textSecondary),
                    hintText: 'Search companies, brands, services, address...',
                    hintStyle: const TextStyle(color: PremiumTheme.textSecondary),
                    filled: true,
                    fillColor: PremiumTheme.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: PremiumTheme.border),
                    ),
                  ),
                  onChanged: (v) {
                    _searchQuery = v;
                    _applyFilters();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Dropdowns
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _selectedCategory,
                  dropdownColor: PremiumTheme.surface,
                  style: const TextStyle(color: PremiumTheme.textPrimary),
                  decoration: const InputDecoration(labelText: 'Category Tag', border: InputBorder.none),
                  items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                  onChanged: (v) {
                    _selectedCategory = v!;
                    _applyFilters();
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _selectedCountry,
                  dropdownColor: PremiumTheme.surface,
                  style: const TextStyle(color: PremiumTheme.textPrimary),
                  decoration: const InputDecoration(labelText: 'Country Location', border: InputBorder.none),
                  items: _countries.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                  onChanged: (v) {
                    _selectedCountry = v!;
                    _applyFilters();
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _selectedIndustry,
                  dropdownColor: PremiumTheme.surface,
                  style: const TextStyle(color: PremiumTheme.textPrimary),
                  decoration: const InputDecoration(labelText: 'Industry Sector', border: InputBorder.none),
                  items: _industries.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                  onChanged: (v) {
                    _selectedIndustry = v!;
                    _applyFilters();
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPartnerCard(Partner partner, List<Contact> contacts) {
    return Container(
      decoration: PremiumTheme.glassDecoration(),
      child: ExpansionTile(
        iconColor: PremiumTheme.primary,
        collapsedIconColor: PremiumTheme.textSecondary,
        title: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(partner.name, style: PremiumTheme.headingMedium.copyWith(fontSize: 18)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.location_on, size: 12, color: PremiumTheme.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        '${partner.city ?? ""}, ${partner.country ?? ""}',
                        style: PremiumTheme.labelMicro,
                      ),
                      if (partner.weblink != null && partner.weblink!.isNotEmpty) ...[
                        const SizedBox(width: 16),
                        const Icon(Icons.language, size: 12, color: PremiumTheme.textSecondary),
                        const SizedBox(width: 4),
                        Text(partner.weblink!, style: PremiumTheme.labelMicro),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            // Category badges
            Wrap(
              spacing: 6,
              children: partner.types.take(3).map((t) {
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: PremiumTheme.primary.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: PremiumTheme.primary.withOpacity(0.3)),
                  ),
                  child: Text(
                    t,
                    style: PremiumTheme.labelMicro.copyWith(color: PremiumTheme.primary, fontSize: 10),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Divider(color: PremiumTheme.border),
                const SizedBox(height: 12),
                
                // Detailed Information Fields
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildDetailRow('HQ Address', partner.address ?? 'Not Set'),
                          _buildDetailRow('Email', partner.email1 ?? 'Not Set'),
                          _buildDetailRow('Phone', partner.phone1 ?? 'Not Set'),
                          _buildDetailRow('Brands Handled', partner.brands ?? 'Not Set'),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildDetailRow('Business Activity', partner.info ?? 'Not Set'),
                          _buildDetailRow('Credit Limit', '\$${partner.customerCredit ?? "Not Set"}'),
                          _buildDetailRow('Credit Terms', '${partner.supplierCredit ?? "Not Set"} Days'),
                          _buildDetailRow('Remarks & Profile', partner.others ?? 'Not Set'),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Contact Persons list
                Text('CONTACT PERSONS (${contacts.length})', style: PremiumTheme.labelMicro),
                const SizedBox(height: 12),
                
                if (contacts.isEmpty) ...[
                  Text('No contacts linked yet.', style: PremiumTheme.bodyNormal),
                ] else ...[
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: contacts.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final contact = contacts[index];
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: PremiumTheme.background.withOpacity(0.5),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: PremiumTheme.border.withOpacity(0.4)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(contact.name, style: PremiumTheme.bodyBold),
                                const SizedBox(height: 4),
                                Text(
                                  '${contact.post ?? "Designation Not Set"} • ${contact.info ?? "General"}',
                                  style: PremiumTheme.labelMicro,
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                if (contact.email != null && contact.email!.isNotEmpty)
                                  IconButton(
                                    icon: const Icon(Icons.email, color: PremiumTheme.accent, size: 20),
                                    onPressed: () => _launchMail(contact.email!),
                                  ),
                                if (contact.handphone != null && contact.handphone!.isNotEmpty)
                                  IconButton(
                                    icon: const Icon(Icons.message, color: PremiumTheme.success, size: 20),
                                    onPressed: () => _launchWhatsApp(contact.handphone!),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: RichText(
        text: TextSpan(
          children: [
            TextSpan(text: '$label: ', style: PremiumTheme.bodyNormal.copyWith(fontWeight: FontWeight.bold)),
            TextSpan(text: value, style: PremiumTheme.bodyNormal),
          ],
        ),
      ),
    );
  }
}
