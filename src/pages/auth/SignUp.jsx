import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { getDocumentSettings } from '../../lib/store';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const SignUp = () => {
    const { signUp, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [allowSignup, setAllowSignup] = useState(true);
    const [checkingSettings, setCheckingSettings] = useState(true);

    useEffect(() => {
        async function fetchSettings() {
            const settings = await getDocumentSettings();
            if (settings && settings.allow_signup === false) {
                setAllowSignup(false);
            }
            setCheckingSettings(false);
        }
        fetchSettings();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (password !== confirmPassword) {
            return setError("Passwords do not match");
        }

        setLoading(true);

        const { data, error } = await signUp({ email, password });

        if (error) {
            setError(error.message);
        } else {
            // Self-healing: verify profile and company assignment
            if (data?.user) {
                try {
                    const { data: existingProfile } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('id', data.user.id)
                        .maybeSingle();

                    if (!existingProfile) {
                        console.log("Trigger did not run. Creating profile manually...");
                        let companyId = '8431cd0b-7449-44a5-8213-2a8680d09ebe'; // default corporate company
                        
                        // Verify company exists
                        const { data: comp } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle();
                        if (!comp) {
                            const { data: allComps } = await supabase.from('companies').select('id').limit(1);
                            if (allComps && allComps.length > 0) {
                                companyId = allComps[0].id;
                            }
                        }

                        // Insert profile
                        await supabase.from('profiles').insert([{
                            id: data.user.id,
                            email: email,
                            role: 'user',
                            status: 'active',
                            company_id: companyId,
                            accessible_modules: ['catalog', 'settings']
                        }]);

                        // Assign company user role
                        await supabase.from('company_users').insert([{
                            user_id: data.user.id,
                            company_id: companyId,
                            role: 'user'
                        }]);
                    }
                } catch (profileErr) {
                    console.error("Self-healing profile setup failed:", profileErr);
                }
            }
            setSuccess("Account created successfully. An admin needs to approve your account before you can log in.");
            setEmail('');
            setPassword('');
            setConfirmPassword('');
        }

        setLoading(false);
    };

    if (checkingSettings) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)', color: 'white' }}>Loading...</div>;
    }

    if (!allowSignup) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', margin: '20px', textAlign: 'center' }}>
                    <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
                    <h2 style={{ marginBottom: '8px' }}>Signup Disabled</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Public account registration is currently restricted by the administrator.</p>
                    <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>Go to Login</Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', margin: '20px' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>Create Account</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Request access to CelronHub</p>
                </div>

                {error && (
                    <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
                        {error}
                    </div>
                )}

                {success && (
                    <div style={{ background: '#dcfce7', color: '#15803d', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
                        {success}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type="email"
                                className="form-input"
                                style={{ paddingLeft: '38px' }}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type={showPassword ? "text" : "password"}
                                className="form-input"
                                style={{ paddingLeft: '38px', paddingRight: '40px' }}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: '12px',
                                    background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex'
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Confirm Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                className="form-input"
                                style={{ paddingLeft: '38px', paddingRight: '40px' }}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                style={{
                                    position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: '12px',
                                    background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex'
                                }}
                            >
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '12px', marginTop: '16px' }}
                        disabled={loading}
                    >
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border-color)', opacity: 0.2 }}></div>
                        <span style={{ padding: '0 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>OR</span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border-color)', opacity: 0.2 }}></div>
                    </div>

                    <button
                        type="button"
                        onClick={async () => {
                            setError('');
                            const { error } = await signInWithGoogle();
                            if (error) setError(error.message);
                        }}
                        className="btn"
                        style={{
                            width: '100%',
                            padding: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            fontWeight: 600,
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                        }}
                        disabled={loading}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                            />
                            <path d="M1 1h22v22H1z" fill="none" />
                        </svg>
                        Sign Up with Google
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Already have an account? <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Sign In</Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SignUp;
