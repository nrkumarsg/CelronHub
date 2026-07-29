import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { getDocumentSettings } from '../../lib/store';
import { useEffect } from 'react';

const Login = () => {
    const { signIn, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const isCatalogOnly = window.location.hostname.includes('celronpricescanner') || 
                          window.location.hostname.includes('celronspares') || 
                          (import.meta.env.VITE_CATALOG_ONLY === 'true' && 
                           !window.location.hostname.includes('celronhub') && 
                           !window.location.hostname.includes('celron-partners'));
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [allowSignup, setAllowSignup] = useState(true);

    useEffect(() => {
        async function fetchSettings() {
            const settings = await getDocumentSettings();
            if (settings && settings.allow_signup !== undefined) {
                setAllowSignup(settings.allow_signup);
            }
        }
        fetchSettings();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error } = await signIn({ email, password });

        if (error) {
            setError(error.message);
        } else {
            navigate('/');
        }

        setLoading(false);
    };

    if (isCatalogOnly) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', margin: '20px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <img src="/logo.png" alt="Celron Logo" style={{ width: '80px', height: '80px', marginBottom: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>Celron Catalog</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Enter UEN PIN to Access</p>
                    </div>

                    {error && (
                        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <label className="form-label">Access PIN</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '12px', color: 'var(--text-secondary)' }} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="form-input"
                                    style={{ paddingLeft: '38px', paddingRight: '40px' }}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setEmail('nrkumarsg@gmail.com');
                                    }}
                                    placeholder="Enter UEN PIN"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        right: '12px',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '12px' }}
                            disabled={loading}
                        >
                            {loading ? 'Verifying PIN...' : 'Access Catalog'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', margin: '20px' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>Welcome Back</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Sign in to CelronHub</p>
                </div>

                {error && (
                    <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
                        {error}
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

                    <div className="form-group" style={{ marginBottom: '16px' }}>
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
                                    position: 'absolute',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    right: '12px',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                        <Link to="/forgot-password" style={{ color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}>
                            Forgot Password?
                        </Link>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '12px' }}
                        disabled={loading}
                    >
                        {loading ? 'Signing In...' : 'Sign In'}
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
                        Continue with Google
                    </button>

                    {allowSignup && (
                        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Don't have an account? <Link to="/signup" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Sign Up</Link>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Login;
