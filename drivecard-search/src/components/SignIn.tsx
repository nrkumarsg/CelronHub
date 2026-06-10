import React, { useState } from "react";
import { LogIn, Sparkles, FolderClosed, ShieldCheck, Mail } from "lucide-react";
import { googleSignIn } from "../firebase";

interface SignInProps {
  onSignInSuccess: (user: any, token: string) => void;
}

export default function SignIn({ onSignInSuccess }: SignInProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        onSignInSuccess(res.user, res.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to complete Google Sign-In pop-up. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans relative overflow-hidden">
      {/* Absolute ambient light leaks */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[130px] pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center">
          {/* Logo badge */}
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/35 flex items-center justify-center text-indigo-400 mb-6 shadow-[0_0_20px_rgba(79,70,229,0.15)]">
            <Sparkles className="w-8 h-8" />
          </div>

          <h1 className="text-3xl font-bold font-display tracking-tight text-white mb-2">
            DriveCard Search
          </h1>
          <p className="text-slate-400 text-sm max-w-xs mb-8">
            An intelligent, AI-powered business card browser and search engine linked directly to your Google Drive folder.
          </p>

          {/* Features checkmark list */}
          <div className="w-full self-start space-y-4 mb-8 bg-slate-950/40 p-5 rounded-2xl border border-slate-800/60 text-left">
            <div className="flex gap-3 text-sm">
              <FolderClosed className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-slate-200">Google Drive Integration</span>
                <p className="text-xs text-slate-400">Directly sync visual `.jpg` business cards inside any shared drive folder.</p>
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-slate-200">Gemini 3.5 AI Parser</span>
                <p className="text-xs text-slate-400">Automatic OCR, email detection, phone lookup, and physical address sorting.</p>
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-slate-200">Serverless & Private Cache</span>
                <p className="text-xs text-slate-400">Your card index is saved securely inside your own Google Drive folder.</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="w-full mb-6 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/25 px-4 py-3 rounded-xl flex gap-2 items-center">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
              <span className="text-left font-mono text-xs leading-relaxed">{error}</span>
            </div>
          )}

          {/* Material Sign in with Google Button */}
          <button
            onClick={handleSignIn}
            disabled={loading}
            className={`w-full group cursor-pointer relative overflow-hidden h-12 flex items-center justify-center gap-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-900 rounded-2xl font-semibold transition-all shadow-[0_4px_12px_rgba(255,255,255,0.08)] ${
              loading ? "opacity-75 cursor-not-allowed" : "hover:scale-[1.01]"
            }`}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-slate-900" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-slate-800 text-sm">Signing in...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 w-emerald-500">
                {/* Standard Google logo SVG */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span className="text-slate-800 text-sm font-semibold">Sign in with Google</span>
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="mt-8 text-xs text-slate-500 flex items-center gap-1">
        <Mail className="w-3.5 h-3.5" /> Direct Workspace API Handled securely with client-side OAuth
      </div>
    </div>
  );
}
