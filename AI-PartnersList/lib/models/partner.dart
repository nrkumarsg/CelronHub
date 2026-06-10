// Model for Partner / Company Table in Supabase
class Partner {
  final String? id;
  final String name;
  final List<String> types;
  final String? others;
  final String? address;
  final String? country;
  final String? email1;
  final String? email2;
  final String? phone1;
  final String? phone2;
  final String? weblink;
  final String? info;
  final String? customerCredit;
  final String? supplierCredit;
  final String? companyId;
  final String? pincode;
  final String? city;
  final String? activitySummary;
  final String? website;
  final String? brands;
  final String? customerCreditTime;
  final String? supplierCreditTime;
  final String? businessCardUrl;
  final String? businessCardBackUrl;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Partner({
    this.id,
    required this.name,
    this.types = const [],
    this.others,
    this.address,
    this.country,
    this.email1,
    this.email2,
    this.phone1,
    this.phone2,
    this.weblink,
    this.info,
    this.customerCredit,
    this.supplierCredit,
    this.companyId,
    this.pincode,
    this.city,
    this.activitySummary,
    this.website,
    this.brands,
    this.customerCreditTime,
    this.supplierCreditTime,
    this.businessCardUrl,
    this.businessCardBackUrl,
    this.createdAt,
    this.updatedAt,
  });

  factory Partner.fromJson(Map<String, dynamic> json) {
    return Partner(
      id: json['id'] as String?,
      name: json['name'] as String? ?? '',
      types: json['types'] != null
          ? List<String>.from(json['types'] as List)
          : const [],
      others: json['others'] as String?,
      address: json['address'] as String?,
      country: json['country'] as String?,
      email1: json['email1'] as String?,
      email2: json['email2'] as String?,
      phone1: json['phone1'] as String?,
      phone2: json['phone2'] as String?,
      weblink: json['weblink'] as String?,
      info: json['info'] as String?,
      customerCredit: json['customerCredit'] as String?,
      supplierCredit: json['supplierCredit'] as String?,
      companyId: json['company_id'] as String?,
      pincode: json['pincode'] as String?,
      city: json['city'] as String?,
      activitySummary: json['activity_summary'] as String?,
      website: json['website'] as String?,
      brands: json['brands'] as String?,
      customerCreditTime: json['customerCreditTime'] as String?,
      supplierCreditTime: json['supplierCreditTime'] as String?,
      businessCardUrl: json['business_card_url'] as String?,
      businessCardBackUrl: json['business_card_back_url'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson({bool includeId = false}) {
    final data = <String, dynamic>{
      'name': name,
      'types': types,
      'others': others,
      'address': address,
      'country': country,
      'email1': email1,
      'email2': email2,
      'phone1': phone1,
      'phone2': phone2,
      'weblink': weblink,
      'info': info,
      'customerCredit': customerCredit,
      'supplierCredit': supplierCredit,
      'company_id': companyId,
      'pincode': pincode,
      'city': city,
      'activity_summary': activitySummary,
      'website': website,
      'brands': brands,
      'customerCreditTime': customerCreditTime,
      'supplierCreditTime': supplierCreditTime,
      'business_card_url': businessCardUrl,
      'business_card_back_url': businessCardBackUrl,
    };
    if (includeId && id != null) {
      data['id'] = id;
    }
    return data;
  }

  Partner copyWith({
    String? id,
    String? name,
    List<String>? types,
    String? others,
    String? address,
    String? country,
    String? email1,
    String? email2,
    String? phone1,
    String? phone2,
    String? weblink,
    String? info,
    String? customerCredit,
    String? supplierCredit,
    String? companyId,
    String? pincode,
    String? city,
    String? activitySummary,
    String? website,
    String? brands,
    String? customerCreditTime,
    String? supplierCreditTime,
    String? businessCardUrl,
    String? businessCardBackUrl,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Partner(
      id: id ?? this.id,
      name: name ?? this.name,
      types: types ?? this.types,
      others: others ?? this.others,
      address: address ?? this.address,
      country: country ?? this.country,
      email1: email1 ?? this.email1,
      email2: email2 ?? this.email2,
      phone1: phone1 ?? this.phone1,
      phone2: phone2 ?? this.phone2,
      weblink: weblink ?? this.weblink,
      info: info ?? this.info,
      customerCredit: customerCredit ?? this.customerCredit,
      supplierCredit: supplierCredit ?? this.supplierCredit,
      companyId: companyId ?? this.companyId,
      pincode: pincode ?? this.pincode,
      city: city ?? this.city,
      activitySummary: activitySummary ?? this.activitySummary,
      website: website ?? this.website,
      brands: brands ?? this.brands,
      customerCreditTime: customerCreditTime ?? this.customerCreditTime,
      supplierCreditTime: supplierCreditTime ?? this.supplierCreditTime,
      businessCardUrl: businessCardUrl ?? this.businessCardUrl,
      businessCardBackUrl: businessCardBackUrl ?? this.businessCardBackUrl,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
