import React, { useState } from 'react';
import { auth, googleProvider, hasFirebaseConfig } from '../firebaseConfig';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';

const BACKEND_URL = 'http://localhost:5010';

const AuthModal = ({ isOpen, onClose, onAuthSuccess, onManualUserSet }) => {
    const [loginMode, setLoginMode] = useState('google'); // 'google' or 'phone'
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState('input'); // 'input' or 'verify'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleGoogleLogin = async () => {
        setError('');
        if (!auth || !googleProvider) {
            alert('Firebase login is not configured.');
            return;
        }

        try {
            await signInWithPopup(auth, googleProvider);
            onAuthSuccess?.();
            onClose();
        } catch (error) {
            console.error('Login error:', error);
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
                await signInWithRedirect(auth, googleProvider);
                return;
            }
            setError('Google login failed.');
        }
    };

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/otp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, email })
            });
            const data = await res.json();
            if (res.ok) {
                setStep('verify');
            } else {
                setError(data.error || 'Failed to send OTP.');
            }
        } catch (err) {
            setError('Network error. Check if backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/otp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, otp })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                // Manually set user in App.jsx
                onManualUserSet?.({
                    uid: `otp-${phone}`,
                    displayName: phone,
                    email: data.user.email,
                    photoURL: `https://ui-avatars.com/api/?name=${phone}&background=ff7b48&color=fff`
                });
                onClose();
            } else {
                setError(data.error || 'Invalid OTP.');
            }
        } catch (err) {
            setError('Network error.');
        } finally {
            setLoading(false);
        }
    };

    const resetStates = () => {
        setLoginMode('google');
        setStep('input');
        setPhone('');
        setEmail('');
        setOtp('');
        setError('');
    };

    const handleClose = () => {
        resetStates();
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={handleClose}>&times;</button>
                <div className="auth-content">
                    <span className="section-kicker">{step === 'verify' ? 'Verification' : 'Welcome back'}</span>
                    <h2>{step === 'verify' ? 'Confirm OTP' : 'Unlock Your Musify'}</h2>
                    
                    {error && <p className="error-text" style={{ color: '#ff5a5a', marginBottom: '16px' }}>{error}</p>}

                    {loginMode === 'google' ? (
                        <>
                            <p className="muted-text">Sign in to save your favorite tracks, create personal playlists, and sync your music across devices.</p>
                            
                            <div className="auth-benefits">
                                <div className="benefit-item">
                                    <span className="benefit-icon">✨</span>
                                    <span>Unlimited Liked Songs</span>
                                </div>
                                <div className="benefit-item">
                                    <span className="benefit-icon">📂</span>
                                    <span>Custom Playlists</span>
                                </div>
                            </div>

                            <button 
                                onClick={handleGoogleLogin} 
                                className="google-auth-button"
                                disabled={!hasFirebaseConfig || loading}
                            >
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
                                <span>Continue with Google</span>
                            </button>

                            <div className="auth-divider">
                                <span>OR</span>
                            </div>

                            <button onClick={() => setLoginMode('phone')} className="ghost-button full-width">
                                Login with Phone Number
                            </button>
                        </>
                    ) : (
                        <div className="phone-login-container">
                            {step === 'input' ? (
                                <form onSubmit={handleSendOtp} className="auth-form">
                                    <p className="muted-text">Enter your phone and an email to receive your secure login code.</p>
                                    <input 
                                        type="tel" 
                                        placeholder="Phone Number" 
                                        value={phone} 
                                        onChange={(e) => setPhone(e.target.value)} 
                                        className="search-input"
                                        required
                                    />
                                    <input 
                                        type="email" 
                                        placeholder="Recovery Email (for OTP)" 
                                        value={email} 
                                        onChange={(e) => setEmail(e.target.value)} 
                                        className="search-input"
                                        required
                                    />
                                    <button type="submit" className="primary-button full-width" disabled={loading}>
                                        {loading ? 'Sending...' : 'Send OTP'}
                                    </button>
                                    <button type="button" onClick={() => setLoginMode('google')} className="ghost-button full-width">
                                        Back to Google Login
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={handleVerifyOtp} className="auth-form">
                                    <p className="muted-text">A 6-digit code has been sent to <strong>{email}</strong></p>
                                    <input 
                                        type="text" 
                                        placeholder="Enter 6-digit OTP" 
                                        value={otp} 
                                        onChange={(e) => setOtp(e.target.value)} 
                                        className="search-input otp-input"
                                        maxLength="6"
                                        required
                                    />
                                    <button type="submit" className="primary-button full-width" disabled={loading}>
                                        {loading ? 'Verifying...' : 'Verify & Login'}
                                    </button>
                                    <button type="button" onClick={() => setStep('input')} className="ghost-button full-width">
                                        Change Phone/Email
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                    
                    {!hasFirebaseConfig && loginMode === 'google' && (
                        <p className="error-text small">Firebase keys are missing in .env.local</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
