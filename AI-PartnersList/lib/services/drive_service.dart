import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'env_config.dart';
import 'token_helper.dart';

class DriveFile {
  final String id;
  final String name;
  final String mimeType;
  final int? size;
  final String? md5Checksum;
  final DateTime? createdTime;
  final List<String> parents;

  DriveFile({
    required this.id,
    required this.name,
    required this.mimeType,
    this.size,
    this.md5Checksum,
    this.createdTime,
    this.parents = const [],
  });

  bool get isFolder => mimeType == 'application/vnd.google-apps.folder';

  factory DriveFile.fromJson(Map<String, dynamic> json) {
    return DriveFile(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      mimeType: json['mimeType'] as String? ?? '',
      size: json['size'] != null ? int.tryParse(json['size'].toString()) : null,
      md5Checksum: json['md5Checksum'] as String?,
      createdTime: json['createdTime'] != null
          ? DateTime.parse(json['createdTime'] as String)
          : null,
      parents: json['parents'] != null
          ? List<String>.from(json['parents'] as List)
          : const [],
    );
  }
}

class DriveService {
  static final DriveService instance = DriveService._internal();

  DriveService._internal();

  Map<String, String> _getHeaders(String? token) {
    final Map<String, String> headers = {};
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Uri _buildUri(String basePath, Map<String, String> queryParams, String? token) {
    final Map<String, String> params = Map.from(queryParams);
    if (token == null || token.isEmpty) {
      params['key'] = EnvConfig.googleApiKey;
    }
    final uriStr = Uri.parse(basePath).replace(queryParameters: params).toString();
    return Uri.parse(uriStr);
  }

  // Fetch all folders and files inside the root folder CelronBuscards recursively
  Future<List<DriveFile>> listCards() async {
    final String folderId = EnvConfig.driveFolderId;
    final String? token = TokenHelper.getGoogleAccessToken();
    
    try {
      // 1. First, query all subfolder IDs inside the root folder
      final folderUri = _buildUri(
        'https://www.googleapis.com/drive/v3/files',
        {
          'q': '\'$folderId\' in parents and mimeType = \'application/vnd.google-apps.folder\' and trashed = false',
          'fields': 'files(id)',
        },
        token,
      );
      
      final folderRes = await http.get(folderUri, headers: _getHeaders(token));
      List<String> allParentIds = [folderId];

      if (folderRes.statusCode == 200) {
        final folderData = jsonDecode(folderRes.body);
        final folderList = folderData['files'] as List? ?? [];
        for (var f in folderList) {
          if (f['id'] != null) {
            allParentIds.add(f['id'].toString());
          }
        }
      }

      // 2. Query all files and folders belonging to any of these parents
      final parentQueries = allParentIds.map((id) => '\'$id\' in parents').join(' or ');
      
      final filesUri = _buildUri(
        'https://www.googleapis.com/drive/v3/files',
        {
          'q': '($parentQueries) and trashed = false',
          'fields': 'files(id,name,mimeType,size,md5Checksum,createdTime,parents)',
          'maxResults': '1000',
        },
        token,
      );

      final response = await http.get(filesUri, headers: _getHeaders(token));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final list = data['files'] as List? ?? [];
        
        List<DriveFile> results = list.map((x) => DriveFile.fromJson(x)).toList();
        
        // Ensure root subfolders are also returned in the results list
        for (var pid in allParentIds) {
          if (pid != folderId && !results.any((r) => r.id == pid)) {
            // Find folder metadata to represent it correctly
            results.add(DriveFile(
              id: pid,
              name: 'Subfolder',
              mimeType: 'application/vnd.google-apps.folder',
              parents: [folderId],
            ));
          }
        }
        
        return results;
      } else {
        throw Exception(
            'Failed to load files from Drive: Status ${response.statusCode}, ${response.body}');
      }
    } catch (e) {
      print('Drive listCards error: $e');
      rethrow;
    }
  }

  // Download binary data from Drive for a specific file ID
  Future<Uint8List> downloadFile(String fileId) async {
    final String? token = TokenHelper.getGoogleAccessToken();
    final url = _buildUri(
      'https://www.googleapis.com/drive/v3/files/$fileId',
      {
        'alt': 'media',
      },
      token,
    );

    try {
      final response = await http.get(url, headers: _getHeaders(token));
      if (response.statusCode == 200) {
        return response.bodyBytes;
      } else {
        throw Exception(
            'Failed to download file from Drive: Status ${response.statusCode}');
      }
    } catch (e) {
      print('Drive downloadFile error: $e');
      rethrow;
    }
  }

  // Get a direct viewable web URL for the card image
  String getDirectUrl(String fileId) {
    final String? token = TokenHelper.getGoogleAccessToken();
    final url = _buildUri(
      'https://www.googleapis.com/drive/v3/files/$fileId',
      {
        'alt': 'media',
      },
      token,
    );
    return url.toString();
  }
}
