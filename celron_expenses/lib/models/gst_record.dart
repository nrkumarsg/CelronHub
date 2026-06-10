class GstRecord {
  final String? id;
  final String vendorName;
  final String vendorGstin;
  final double taxableValue;
  final double cgst;
  final double sgst;
  final double igst;
  final double totalGst;
  final String? hsnSacCode;
  final String expenseCategory;
  final String? driveUrl;
  final String itcStatus; // eligible, ineligible, claimed
  final String? createdBy;
  final DateTime? createdAt;

  GstRecord({
    this.id,
    required this.vendorName,
    required this.vendorGstin,
    required this.taxableValue,
    required this.cgst,
    required this.sgst,
    required this.igst,
    double? totalGst,
    this.hsnSacCode,
    this.expenseCategory = 'Office Supplies',
    this.driveUrl,
    this.itcStatus = 'eligible',
    this.createdBy,
    this.createdAt,
  }) : totalGst = totalGst ?? (cgst + sgst + igst);

  GstRecord copyWith({
    String? id,
    String? vendorName,
    String? vendorGstin,
    double? taxableValue,
    double? cgst,
    double? sgst,
    double? igst,
    double? totalGst,
    String? hsnSacCode,
    String? expenseCategory,
    String? driveUrl,
    String? itcStatus,
    String? createdBy,
    DateTime? createdAt,
  }) {
    return GstRecord(
      id: id ?? this.id,
      vendorName: vendorName ?? this.vendorName,
      vendorGstin: vendorGstin ?? this.vendorGstin,
      taxableValue: taxableValue ?? this.taxableValue,
      cgst: cgst ?? this.cgst,
      sgst: sgst ?? this.sgst,
      igst: igst ?? this.igst,
      totalGst: totalGst ?? this.totalGst,
      hsnSacCode: hsnSacCode ?? this.hsnSacCode,
      expenseCategory: expenseCategory ?? this.expenseCategory,
      driveUrl: driveUrl ?? this.driveUrl,
      itcStatus: itcStatus ?? this.itcStatus,
      createdBy: createdBy ?? this.createdBy,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'vendor_name': vendorName,
      'vendor_gstin': vendorGstin,
      'taxable_value': taxableValue,
      'cgst': cgst,
      'sgst': sgst,
      'igst': igst,
      // total_gst is database generated, so we omit from insert/update
      'hsn_sac_code': hsnSacCode,
      'expense_category': expenseCategory,
      'drive_url': driveUrl,
      'itc_status': itcStatus,
      if (createdBy != null) 'created_by': createdBy,
    };
  }

  factory GstRecord.fromMap(Map<String, dynamic> map) {
    return GstRecord(
      id: map['id'] as String?,
      vendorName: map['vendor_name'] as String? ?? 'Unknown Vendor',
      vendorGstin: map['vendor_gstin'] as String? ?? '',
      taxableValue: (map['taxable_value'] as num? ?? 0.0).toDouble(),
      cgst: (map['cgst'] as num? ?? 0.0).toDouble(),
      sgst: (map['sgst'] as num? ?? 0.0).toDouble(),
      igst: (map['igst'] as num? ?? 0.0).toDouble(),
      totalGst: (map['total_gst'] as num? ?? 0.0).toDouble(),
      hsnSacCode: map['hsn_sac_code'] as String?,
      expenseCategory: map['expense_category'] as String? ?? 'Office Supplies',
      driveUrl: map['drive_url'] as String?,
      itcStatus: map['itc_status'] as String? ?? 'eligible',
      createdBy: map['created_by'] as String?,
      createdAt: map['created_at'] != null 
          ? DateTime.parse(map['created_at'] as String) 
          : null,
    );
  }
}
