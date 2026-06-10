import 'package:supabase_flutter/supabase_flutter.dart';
import 'env_config.dart';
import '../models/partner.dart';
import '../models/contact.dart';

class SupabaseService {
  static final SupabaseService instance = SupabaseService._internal();
  bool _initialized = false;
  late final SupabaseClient client;

  SupabaseService._internal();

  Future<void> init() async {
    if (_initialized) return;
    await Supabase.initialize(
      url: EnvConfig.supabaseUrl,
      anonKey: EnvConfig.supabaseAnonKey,
    );
    client = Supabase.instance.client;
    _initialized = true;
  }

  // --- PARTNERS METHODS ---
  Future<List<Partner>> getPartners() async {
    await init();
    final response = await client
        .from('partners')
        .select()
        .order('name', ascending: true);
    return (response as List).map((x) => Partner.fromJson(x)).toList();
  }

  Future<Partner?> getPartnerById(String id) async {
    await init();
    try {
      final response = await client.from('partners').select().eq('id', id).maybeSingle();
      if (response == null) return null;
      return Partner.fromJson(response);
    } catch (e) {
      return null;
    }
  }

  // Query partners to check if a Google Drive File ID has already been imported
  Future<Partner?> getPartnerByDriveFileId(String fileId) async {
    await init();
    try {
      // Find a partner where business_card_url contains the Google Drive File ID
      final response = await client
          .from('partners')
          .select()
          .like('business_card_url', '%$fileId%')
          .maybeSingle();
      if (response == null) return null;
      return Partner.fromJson(response);
    } catch (e) {
      return null;
    }
  }

  Future<Partner> savePartner(Partner partner) async {
    await init();
    final partnerData = partner.toJson();
    if (partner.id != null) {
      final response = await client
          .from('partners')
          .update(partnerData)
          .eq('id', partner.id!)
          .select()
          .single();
      return Partner.fromJson(response);
    } else {
      final response = await client
          .from('partners')
          .insert(partnerData)
          .select()
          .single();
      return Partner.fromJson(response);
    }
  }

  // --- CONTACTS METHODS ---
  Future<List<Contact>> getContacts() async {
    await init();
    final response = await client
        .from('contacts')
        .select()
        .order('name', ascending: true);
    return (response as List).map((x) => Contact.fromJson(x)).toList();
  }

  Future<List<Contact>> getContactsByPartnerId(String partnerId) async {
    await init();
    final response = await client
        .from('contacts')
        .select()
        .eq('partnerId', partnerId);
    return (response as List).map((x) => Contact.fromJson(x)).toList();
  }

  Future<Contact> saveContact(Contact contact) async {
    await init();
    final contactData = contact.toJson();
    if (contact.id != null) {
      final response = await client
          .from('contacts')
          .update(contactData)
          .eq('id', contact.id!)
          .select()
          .single();
      return Contact.fromJson(response);
    } else {
      final response = await client
          .from('contacts')
          .insert(contactData)
          .select()
          .single();
      return Contact.fromJson(response);
    }
  }
}
