import 'dart:convert';

class AccountsPayable {
  final String? id;
  final String vendorName;
  final String? invoiceNumber;
  final DateTime invoiceDate;
  final DateTime? dueDate;
  final double totalAmount;
  final double gstAmount;
  final String currency;
  final String? driveUrl;
  final String status; // pending_approval, approved, paid, rejected
  final Map<String, dynamic>? extractedJson;
  final String? createdBy;
  final DateTime? createdAt;

  AccountsPayable({
    this.id,
    required this.vendorName,
    this.invoiceNumber,
    required this.invoiceDate,
    this.dueDate,
    required this.totalAmount,
    required this.gstAmount,
    this.currency = 'SGD',
    this.driveUrl,
    this.status = 'pending_approval',
    this.extractedJson,
    this.createdBy,
    this.createdAt,
  });

  AccountsPayable copyWith({
    String? id,
    String? vendorName,
    String? invoiceNumber,
    DateTime? invoiceDate,
    DateTime? dueDate,
    double? totalAmount,
    double? gstAmount,
    String? currency,
    String? driveUrl,
    String? status,
    Map<String, dynamic>? extractedJson,
    String? createdBy,
    DateTime? createdAt,
  }) {
    return AccountsPayable(
      id: id ?? this.id,
      vendorName: vendorName ?? this.vendorName,
      invoiceNumber: invoiceNumber ?? this.invoiceNumber,
      invoiceDate: invoiceDate ?? this.invoiceDate,
      dueDate: dueDate ?? this.dueDate,
      totalAmount: totalAmount ?? this.totalAmount,
      gstAmount: gstAmount ?? this.gstAmount,
      currency: currency ?? this.currency,
      driveUrl: driveUrl ?? this.driveUrl,
      status: status ?? this.status,
      extractedJson: extractedJson ?? this.extractedJson,
      createdBy: createdBy ?? this.createdBy,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'vendor_name': vendorName,
      'invoice_number': invoiceNumber,
      'invoice_date': invoiceDate.toIso8601String().split('T')[0],
      'due_date': dueDate?.toIso8601String().split('T')[0],
      'total_amount': totalAmount,
      'gst_amount': gstAmount,
      'currency': currency,
      'drive_url': driveUrl,
      'status': status,
      'extracted_json': extractedJson != null ? jsonEncode(extractedJson) : null,
      if (createdBy != null) 'created_by': createdBy,
    };
  }

  factory AccountsPayable.fromMap(Map<String, dynamic> map) {
    return AccountsPayable(
      id: map['id'] as String?,
      vendorName: map['vendor_name'] as String? ?? 'Unknown Vendor',
      invoiceNumber: map['invoice_number'] as String?,
      invoiceDate: map['invoice_date'] != null 
          ? DateTime.parse(map['invoice_date'] as String) 
          : DateTime.now(),
      dueDate: map['due_date'] != null 
          ? DateTime.parse(map['due_date'] as String) 
          : null,
      totalAmount: (map['total_amount'] as num? ?? 0.0).toDouble(),
      gstAmount: (map['gst_amount'] as num? ?? 0.0).toDouble(),
      currency: map['currency'] as String? ?? 'SGD',
      driveUrl: map['drive_url'] as String?,
      status: map['status'] as String? ?? 'pending_approval',
      extractedJson: map['extracted_json'] != null 
          ? (map['extracted_json'] is String 
              ? jsonDecode(map['extracted_json'] as String) as Map<String, dynamic> 
              : map['extracted_json'] as Map<String, dynamic>)
          : null,
      createdBy: map['created_by'] as String?,
      createdAt: map['created_at'] != null 
          ? DateTime.parse(map['created_at'] as String) 
          : null,
    );
  }
}
