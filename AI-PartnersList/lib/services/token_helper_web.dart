import 'dart:html' as html;

// Web implementation accessing browser's localStorage
String? getStoredToken() {
  try {
    final token = html.window.localStorage['google_access_token'];
    final expiryStr = html.window.localStorage['google_token_expiry'];
    
    if (token == null || expiryStr == null) return null;
    
    // Check if token is still valid
    final expiry = DateTime.parse(expiryStr);
    if (expiry.isBefore(DateTime.now())) {
      clearToken();
      return null;
    }
    return token;
  } catch (e) {
    print('Failed to read localStorage token: $e');
    return null;
  }
}

void parseUrlToken() {
  try {
    final hash = html.window.location.hash;
    if (hash.contains('access_token=')) {
      final cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
      final params = Uri.splitQueryString(cleanHash);
      final token = params['access_token'];
      
      if (token != null) {
        html.window.localStorage['google_access_token'] = token;
        
        final expiry = DateTime.now().add(const Duration(hours: 1));
        html.window.localStorage['google_token_expiry'] = expiry.toIso8601String();
        
        html.window.history.replaceState(
          null, 
          html.document.title ?? '', 
          html.window.location.pathname ?? '/'
        );
        
        print('Google access token successfully registered and saved.');
      }
    }
  } catch (e) {
    print('Failed to parse OAuth URL token: $e');
  }
}

void clearToken() {
  try {
    html.window.localStorage.remove('google_access_token');
    html.window.localStorage.remove('google_token_expiry');
    print('Google access token successfully cleared.');
  } catch (e) {
    print('Failed to clear localStorage token: $e');
  }
}

void triggerGoogleLogin() {
  try {
    final clientId = '696421975815-2tp2llpdq92jubtivn1hpqd1jji421ur.apps.googleusercontent.com';
    final redirectUri = Uri.encodeComponent(html.window.location.origin ?? '');
    
    // Scopes for Drive access
    final scopes = Uri.encodeComponent(
      'https://www.googleapis.com/auth/drive '
      'https://www.googleapis.com/auth/userinfo.profile '
      'https://www.googleapis.com/auth/userinfo.email'
    );
    
    final oauthUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
        '?client_id=$clientId'
        '&redirect_uri=$redirectUri'
        '&response_type=token'
        '&scope=$scopes'
        '&prompt=select_account';
        
    html.window.location.href = oauthUrl;
  } catch (e) {
    print('Failed to trigger Google Login: $e');
  }
}
