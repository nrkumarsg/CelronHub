// Model for Contact Table in Supabase
class Contact {
  final String? id;
  final String? partnerId; // foreign key to partners(id)
  final String name;
  final String? post; // post / designation
  final String? address;
  final String? email;
  final String? phone; // office phone
  final String? handphone; // mobile / whatsapp
  final String? facebook; // linkedin / social link
  final String? info; // remarks / notes
  final String? companyId;
  final String? businessCardUrl;
  final String? businessCardBackUrl;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Contact({
    this.id,
    this.partnerId,
    required this.name,
    this.post,
    this.address,
    this.email,
    this.phone,
    this.handphone,
    this.facebook,
    this.info,
    this.companyId,
    this.businessCardUrl,
    this.businessCardBackUrl,
    this.createdAt,
    this.updatedAt,
  });

  factory Contact.fromJson(Map<String, dynamic> json) {
    return Contact(
      id: json['id'] as String?,
      partnerId: json['partnerId'] as String?,
      name: json['name'] as String? ?? '',
      post: json['post'] as String?,
      address: json['address'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      handphone: json['handphone'] as String?,
      facebook: json['facebook'] as String?,
      info: json['info'] as String?,
      companyId: json['company_id'] as String?,
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
      'partnerId': partnerId,
      'name': name,
      'post': post,
      'address': address,
      'email': email,
      'phone': phone,
      'handphone': handphone,
      'facebook': facebook,
      'info': info,
      'company_id': companyId,
      'business_card_url': businessCardUrl,
      'business_card_back_url': businessCardBackUrl,
    };
    if (includeId && id != null) {
      data['id'] = id;
    }
    return data;
  }

  Contact copyWith({
    String? id,
    String? partnerId,
    String? name,
    String? post,
    String? address,
    String? email,
    String? phone,
    String? handphone,
    String? facebook,
    String? info,
    String? companyId,
    String? businessCardUrl,
    String? businessCardBackUrl,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Contact(
      id: id ?? this.id,
      partnerId: partnerId ?? this.partnerId,
      name: name ?? this.name,
      post: post ?? this.post,
      address: address ?? this.address,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      handphone: handphone ?? this.handphone,
      facebook: facebook ?? this.facebook,
      info: info ?? this.info,
      companyId: companyId ?? this.companyId,
      businessCardUrl: businessCardUrl ?? this.businessCardUrl,
      businessCardBackUrl: businessCardBackUrl ?? this.businessCardBackUrl,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
