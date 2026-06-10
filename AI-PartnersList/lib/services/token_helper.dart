import 'token_helper_stub.dart'
    if (dart.library.html) 'token_helper_web.dart';

class TokenHelper {
  static String? getGoogleAccessToken() {
    return getStoredToken();
  }

  static void parseOAuthCallback() {
    parseUrlToken();
  }

  static void logout() {
    clearToken();
  }

  static void login() {
    triggerGoogleLogin();
  }
}
