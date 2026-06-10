// Environment configuration file for Celron Business Card CRM
// This is generated using credentials from the parent .env file.

class EnvConfig {
  static const String supabaseUrl = "https://dfoihdzpgkrtyerzzchm.supabase.co";
  
  static const String supabaseAnonKey = 
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4";
  
  static const String googleApiKey = 
      "AIzaSyA5YW4mWUo__7hwGjvLor-DDsh-spg2r5M";
  
  static const String openaiApiKey = 
      String.fromEnvironment('OPENAI_API_KEY', defaultValue: '');

  // Google Drive folder ID for CelronBuscards
  static const String driveFolderId = "1FopCXZKCiKTQrwExkB2D_JGm1tVWqOwU";
}
