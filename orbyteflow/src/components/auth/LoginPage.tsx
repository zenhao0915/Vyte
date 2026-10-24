// src/components/auth/LoginPage.tsx
import React, { useEffect, useState } from 'react';
import {
    AlertCircle, Box, CheckCircle2, Eye, EyeOff, KeyRound, Layers, Loader2, TrendingUp, X,
} from 'lucide-react';
import type { UserRole, UserSession } from '../../types/vyte.ts';
import { VyteLogo } from '../common/VyteLogo';
import { VyteDropdown } from '../common/VyteDropdown';
import { TermsAndConditionsModal } from './TermsAndConditionsModal';
import { orbyteApi } from '../../services/api';

interface LoginPageProps {
    onAuthenticated: (session: UserSession, accessToken?: string) => void;
}

interface RegisterFormState {
    firstName: string;
    lastName: string;
    email: string;
    companyName: string;
    userType: 'CEO' | 'Manager' | 'Staff';
    password: string;
    agreeTerms: boolean;
}

interface LoginFormState {
    email: string;
    password: string;
    userType: 'CEO' | 'Manager' | 'Staff';
}

const REG_KEY = 'vyte_register_draft_v2';
const LOGIN_KEY = 'vyte_login_draft_v2';
const ACCOUNTS_KEY = 'vyte_registered_accounts_v2';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ROLE_OPTIONS: { label: string; value: 'CEO' | 'Manager' | 'Staff' }[] = [
    { label: 'Role: Owner (CEO)', value: 'CEO' },
    { label: 'Role: Manager', value: 'Manager' },
    { label: 'Role: Ops Staff', value: 'Staff' },
];

const mapUserTypeToRole = (type: 'CEO' | 'Manager' | 'Staff'): UserRole =>
    type === 'CEO' ? 'SME_OWNER' : type === 'Manager' ? 'MANAGER' : 'OPERATIONS_STAFF';

const validateName = (val: string, label: string) => {
    const v = val.trim();
    if (!v) return `${label} is required.`;
    if (/\d/.test(v)) return `${label} cannot contain numbers.`;
    if (/[^A-Za-z\s'-]/.test(v)) return `${label} can only contain letters, spaces, hyphens, or apostrophes.`;
    return v.length < 2 || v.length > 40 ? `${label} must be between 2 and 40 letters.` : undefined;
};

const validateEmail = (val: string) => {
    const v = val.trim();
    if (!v) return 'Work email address is required.';
    return !EMAIL_REGEX.test(v) ? 'Enter a valid work email (e.g., name@company.com).' : undefined;
};

const validateCompany = (val: string) => {
    const v = val.trim();
    if (!v) return 'Company name is required.';
    if (/^\d+$/.test(v)) return 'Company name cannot contain only numbers.';
    return v.length < 3 ? 'Company name must be at least 3 characters.' : undefined;
};

const validatePassword = (v: string, isRegister: boolean) => {
    if (!v) return 'Password is required.';
    if (v.length < 8) return 'Password must be at least 8 characters long.';
    if (isRegister) {
        if (!/[A-Z]/.test(v)) return 'Password must include at least one uppercase letter (A-Z).';
        if (!/[a-z]/.test(v)) return 'Password must include at least one lowercase letter (a-z).';
        if (!/\d/.test(v)) return 'Password must include at least one number (0-9).';
        if (!/[!@#$%^&*(),.?":{}|<>_\-=+]/.test(v)) return 'Password must include at least one special character.';
    }
    return undefined;
};

const readStorage = <T,>(key: string, fallback: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch {
        return fallback;
    }
};

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
    const [mode, setMode] = useState<'register' | 'login'>('login');
    const [registerForm, setRegisterForm] = useState<RegisterFormState>(() =>
        readStorage(REG_KEY, { firstName: '', lastName: '', email: '', companyName: '', userType: 'CEO', password: '', agreeTerms: false })
    );
    const [loginForm, setLoginForm] = useState<LoginFormState>(() =>
        readStorage(LOGIN_KEY, { email: '', password: '', userType: 'CEO' })
    );
    const [registeredAccounts, setRegisteredAccounts] = useState<Record<string, any>>(() => readStorage(ACCOUNTS_KEY, {}));

    const [showRegisterPwd, setShowRegisterPwd] = useState(false);
    const [showLoginPwd, setShowLoginPwd] = useState(false);
    const [registerErrors, setRegisterErrors] = useState<Record<string, string | undefined>>({});
    const [loginErrors, setLoginErrors] = useState<Record<string, string | undefined>>({});

    const [showTermsModal, setShowTermsModal] = useState(false);
    const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [ssoLoadingProvider, setSsoLoadingProvider] = useState<'Google' | 'SSO' | null>(null);

    // Forgot Password State
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotStep, setForgotStep] = useState<'REQUEST' | 'RESET'>('REQUEST');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotTokenInput, setForgotTokenInput] = useState('');
    const [generatedResetToken, setGeneratedResetToken] = useState('');
    const [newResetPassword, setNewResetPassword] = useState('');
    const [confirmResetPassword, setConfirmResetPassword] = useState('');
    const [showNewResetPwd, setShowNewResetPwd] = useState(false);
    const [forgotErrors, setForgotErrors] = useState<Record<string, string | undefined>>({});
    const [isForgotLoading, setIsForgotLoading] = useState(false);

    useEffect(() => {
        localStorage.setItem(REG_KEY, JSON.stringify(registerForm));
        localStorage.setItem(LOGIN_KEY, JSON.stringify(loginForm));
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(registeredAccounts));
    }, [registerForm, loginForm, registeredAccounts]);

    const persistAuthAndSwitchWorkspace = (session: UserSession, token: string) => {
        const tenantId = (session.email || session.userID || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        localStorage.setItem('vyte_workspace_id', tenantId);
        localStorage.setItem('active_workspace_id', tenantId);
        localStorage.setItem('vyte_session', JSON.stringify(session));
        localStorage.setItem('accessToken', token);
        localStorage.setItem('vyte_jwt', token);
        onAuthenticated(session, token);
    };

    const switchAuthMode = (target: 'register' | 'login') => {
        setMode(target);
        setStatusBanner(null);
        setShowRegisterPwd(false);
        setShowLoginPwd(false);
        setRegisterErrors({});
        setLoginErrors({});
    };

    const updateRegField = <K extends keyof RegisterFormState>(field: K, value: RegisterFormState[K]) => {
        setRegisterForm((p) => ({ ...p, [field]: value }));
        const validators: Record<string, () => string | undefined> = {
            firstName: () => validateName(String(value), 'First name'),
            lastName: () => validateName(String(value), 'Last name'),
            email: () => validateEmail(String(value)),
            companyName: () => validateCompany(String(value)),
            password: () => validatePassword(String(value), true),
            agreeTerms: () => (value ? undefined : 'You must accept the Terms & Conditions to create an account.'),
        };
        if (validators[field]) setRegisterErrors((p) => ({ ...p, [field]: validators[field]() }));
    };

    const updateLogField = <K extends keyof LoginFormState>(field: K, value: LoginFormState[K]) => {
        setLoginForm((p) => ({ ...p, [field]: value }));
        if (field === 'email') setLoginErrors((p) => ({ ...p, email: validateEmail(String(value)) }));
        if (field === 'password') setLoginErrors((p) => ({ ...p, password: validatePassword(String(value), false) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusBanner(null);

        if (mode === 'register') {
            const errs = {
                firstName: validateName(registerForm.firstName, 'First name'),
                lastName: validateName(registerForm.lastName, 'Last name'),
                email: validateEmail(registerForm.email),
                companyName: validateCompany(registerForm.companyName),
                password: validatePassword(registerForm.password, true),
                agreeTerms: registerForm.agreeTerms ? undefined : 'You must accept the Terms & Conditions to create an account.',
            };
            setRegisterErrors(errs);
            if (Object.values(errs).some(Boolean)) return;

            setIsSubmitting(true);
            try {
                const cleanFirst = registerForm.firstName.trim();
                const cleanLast = registerForm.lastName.trim();
                const fullName = `${cleanFirst} ${cleanLast}`.trim();
                const cleanEmail = registerForm.email.trim();
                const cleanCompany = registerForm.companyName.trim();
                const selectedType = registerForm.userType;
                const mappedRole = mapUserTypeToRole(selectedType);

                const res = await orbyteApi.registerAccount({
                    firstName: cleanFirst,
                    lastName: cleanLast,
                    email: cleanEmail,
                    password: registerForm.password,
                    companyName: cleanCompany,
                    userType: selectedType,
                    role: mappedRole,
                    acceptedTermsAt: new Date().toISOString(),
                });

                // 安全读取属性，解决 TS2339 错误
                const data = (res?.data || {}) as Record<string, any>;
                const finalToken = data.accessToken || `vyte-jwt-${Date.now()}`;
                const finalSession: UserSession = data.session || {
                    userID: data.userID || (selectedType === 'CEO' ? 'M067' : selectedType === 'Manager' ? 'M102' : 'S204'),
                    userName: fullName,
                    email: cleanEmail,
                    userType: selectedType,
                    role: mappedRole,
                    companyName: cleanCompany,
                    companyOwnerName: fullName,
                };

                setRegisteredAccounts((prev) => ({
                    ...prev,
                    [cleanEmail.toLowerCase()]: {
                        firstName: cleanFirst,
                        lastName: cleanLast,
                        email: cleanEmail,
                        password: registerForm.password,
                        companyName: cleanCompany,
                        userType: selectedType,
                        userID: finalSession.userID,
                    },
                }));

                localStorage.removeItem(REG_KEY);
                persistAuthAndSwitchWorkspace(finalSession, finalToken);
            } catch (err: any) {
                setStatusBanner({ type: 'error', text: err.response?.data?.error || err.message || 'Registration failed.' });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        // LOGIN
        const errs = {
            email: validateEmail(loginForm.email),
            password: validatePassword(loginForm.password, false),
        };
        setLoginErrors(errs);
        if (Object.values(errs).some(Boolean)) return;

        setIsSubmitting(true);
        try {
            const emailKey = loginForm.email.trim().toLowerCase();
            const matched = registeredAccounts[emailKey];
            const activeUserType = matched ? matched.userType : loginForm.userType;
            const activeFullName = matched ? `${matched.firstName} ${matched.lastName}` : loginForm.email.trim().split('@')[0] || 'Vyte Operator';
            const activeCompany = matched ? matched.companyName : 'Vyte Smart Logistics Sdn Bhd';

            const loginRes = await orbyteApi.loginAccount({
                email: loginForm.email.trim(),
                password: loginForm.password,
                companyName: activeCompany,
                userType: activeUserType,
            });

            const data = (loginRes?.data || {}) as Record<string, any>;
            const session: UserSession = data.session || {
                userID: matched?.userID || 'M067',
                userName: activeFullName,
                email: loginForm.email.trim(),
                userType: activeUserType,
                role: mapUserTypeToRole(activeUserType),
                companyName: activeCompany,
                companyOwnerName: activeFullName,
            };
            persistAuthAndSwitchWorkspace(session, data.accessToken || `vyte-jwt-${Date.now()}`);
        } catch (err: any) {
            setStatusBanner({ type: 'error', text: err.response?.data?.error || err.message || 'Incorrect email or password.' });
            setLoginErrors((p) => ({ ...p, password: 'Authentication failed.' }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleQuickSSO = async (provider: 'Google' | 'SSO') => {
        setStatusBanner(null);
        if (mode === 'register' && !registerForm.agreeTerms) {
            setRegisterErrors((p) => ({ ...p, agreeTerms: `Please accept the Terms & Conditions before registering with ${provider}.` }));
            return;
        }

        setSsoLoadingProvider(provider);
        const activeType = mode === 'register' ? registerForm.userType : loginForm.userType;
        const mappedRole = mapUserTypeToRole(activeType);
        const targetEmail = (mode === 'register' ? registerForm.email : loginForm.email).trim() || 'jayden@vyte.my';
        const targetName = mode === 'register' && (registerForm.firstName.trim() || registerForm.lastName.trim())
            ? `${registerForm.firstName.trim()} ${registerForm.lastName.trim()}`.trim()
            : targetEmail.split('@')[0] || 'Jayden Lai';

        try {
            const apiCall = provider === 'Google'
                ? orbyteApi.loginWithGoogle({
                    idToken: `mock-google-jwt-${Date.now()}`,
                    email: targetEmail,
                    fullName: targetName,
                    companyName: registerForm.companyName.trim() || 'Vyte Smart Logistics Sdn Bhd',
                    userType: activeType,
                    role: mappedRole,
                })
                : orbyteApi.loginWithEnterpriseSso({
                    ssoAssertionToken: `mock-saml-oidc-token-${Date.now()}`,
                    corporateDomain: (targetEmail.split('@')[1] || 'vyte.my').trim(),
                    email: targetEmail,
                    companyName: registerForm.companyName.trim() || 'Vyte Smart Logistics Sdn Bhd',
                    userType: activeType,
                    role: mappedRole,
                });

            const res = await apiCall;
            persistAuthAndSwitchWorkspace({ ...res.data.session, email: targetEmail, userName: targetName }, res.data.accessToken);
        } catch (err: any) {
            setStatusBanner({ type: 'error', text: `${provider} authentication failed: ${err.message}` });
        } finally {
            setSsoLoadingProvider(null);
        }
    };

    const handleRequestResetCode = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validateEmail(forgotEmail);
        if (err) return setForgotErrors({ email: err });

        setIsForgotLoading(true);
        try {
            const res = await orbyteApi.requestPasswordReset({ email: forgotEmail.trim() });
            setGeneratedResetToken(res.data.resetToken);
            setForgotTokenInput(res.data.resetToken);
            setForgotErrors({});
            setForgotStep('RESET');
        } catch (err: any) {
            setForgotErrors({ email: err.response?.data?.error || err.message || 'Request failed' });
        } finally {
            setIsForgotLoading(false);
        }
    };

    const handleConfirmPasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs: Record<string, string | undefined> = {
            token: !forgotTokenInput.trim() ? 'Verification code is required.' : (generatedResetToken && forgotTokenInput.trim().toUpperCase() !== generatedResetToken.toUpperCase() ? 'Invalid verification code.' : undefined),
            newPassword: validatePassword(newResetPassword, true),
            confirmPassword: !confirmResetPassword ? 'Please confirm your new password.' : (confirmResetPassword !== newResetPassword ? 'Passwords do not match.' : undefined),
        };
        setForgotErrors(errs);
        if (Object.values(errs).some(Boolean)) return;

        setIsForgotLoading(true);
        try {
            const res = await orbyteApi.confirmPasswordReset({ email: forgotEmail.trim(), resetToken: forgotTokenInput.trim(), newPassword: newResetPassword });
            const emailKey = forgotEmail.trim().toLowerCase();
            if (registeredAccounts[emailKey]) {
                setRegisteredAccounts((p) => ({ ...p, [emailKey]: { ...p[emailKey], password: newResetPassword } }));
            }
            setShowForgotModal(false);
            setForgotStep('REQUEST');
            setNewResetPassword('');
            setConfirmResetPassword('');
            setMode('login');
            setLoginForm((p) => ({ ...p, email: forgotEmail.trim(), password: '' }));
            setStatusBanner({ type: 'success', text: res.data.message });
        } catch (err: any) {
            setForgotErrors({ token: err.response?.data?.error || err.message || 'Reset failed' });
        } finally {
            setIsForgotLoading(false);
        }
    };

    const renderErr = (msg?: string) =>
        msg ? (
            <p className="text-[11px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{msg}</span>
            </p>
        ) : null;

    return (
        <div className="min-h-screen bg-[#0B0C0E] flex items-center justify-center p-4 md:p-8 font-sans select-none">
            <div className="fixed w-[580px] h-[580px] rounded-full bg-[#2BB656]/10 blur-[130px] pointer-events-none -top-24 -left-24" />
            <div className="fixed w-[520px] h-[520px] rounded-full bg-[#2BB656]/10 blur-[140px] pointer-events-none bottom-0 right-0" />

            <div className="w-full max-w-[1080px] bg-[#14181D] border border-slate-800/90 rounded-[28px] p-4 md:p-5 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
                {/* LEFT SHOWCASE PANEL */}
                <div className="lg:col-span-6 relative rounded-[22px] overflow-hidden min-h-[500px] lg:min-h-[620px] flex flex-col justify-between p-8 bg-gradient-to-br from-[#0F291E] via-[#0B1913] to-[#080B0E] border border-[#2BB656]/25">
                    <svg viewBox="0 0 600 700" preserveAspectRatio="none" className="absolute inset-0 w-full h-full object-cover pointer-events-none">
                        <defs>
                            <radialGradient id="vyte-spot" cx="50%" cy="28%" r="60%">
                                <stop offset="0%" stopColor="#2BB656" stopOpacity="0.24" />
                                <stop offset="100%" stopColor="#080B0E" stopOpacity="0" />
                            </radialGradient>
                            <linearGradient id="vyte-wave-1" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#2BB656" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="#0A1812" stopOpacity="0.95" />
                            </linearGradient>
                            <linearGradient id="vyte-wave-2" x1="100%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                                <stop offset="100%" stopColor="#07090B" stopOpacity="0.98" />
                            </linearGradient>
                        </defs>
                        <rect width="600" height="700" fill="url(#vyte-spot)" />
                        <path d="M -40 410 Q 180 270 360 355 T 640 315 L 640 700 L -40 700 Z" fill="url(#vyte-wave-1)" />
                        <path d="M -40 485 Q 250 360 430 450 T 640 410 L 640 700 L -40 700 Z" fill="url(#vyte-wave-2)" />
                    </svg>

                    <div className="relative z-10 flex flex-col items-center pt-4">
                        <div className="bg-[#F6F7F4] px-7 py-5 rounded-2xl shadow-xl border border-white/80 flex items-center justify-center">
                            <VyteLogo variant="dark-text" showSubtitle={true} className="h-24 w-auto" />
                        </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-2 gap-3.5 my-auto py-6">
                        <div className="p-4 rounded-2xl bg-white/[0.06] backdrop-blur-md border border-white/10 space-y-1.5">
                            <div className="w-8 h-8 rounded-lg bg-[#2BB656]/20 text-[#2BB656] flex items-center justify-center">
                                <Box className="w-4 h-4" />
                            </div>
                            <p className="text-xs font-bold text-white">Autonomous Restock</p>
                            <p className="text-[11px] text-slate-300/80 leading-relaxed">Depletion-driven PO drafting with human-in-the-loop approval.</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/[0.06] backdrop-blur-md border border-white/10 space-y-1.5">
                            <div className="w-8 h-8 rounded-lg bg-[#2BB656]/20 text-[#2BB656] flex items-center justify-center">
                                <TrendingUp className="w-4 h-4" />
                            </div>
                            <p className="text-xs font-bold text-white">AI Sales &amp; Expiry</p>
                            <p className="text-[11px] text-slate-300/80 leading-relaxed">Quarterly holding-cost analytics &amp; proactive batch quality alerts.</p>
                        </div>
                    </div>

                    <div className="relative z-10 text-center space-y-2 pb-1">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Smart Inventory, Zero Stockouts</h2>
                        <p className="text-xs text-slate-300/80 max-w-sm mx-auto leading-relaxed">
                            Unified stock automation, AI procurement reviews, and supplier orchestration built for growing businesses.
                        </p>
                    </div>
                </div>

                {/* RIGHT AUTHENTICATION FORM PANEL */}
                <div className="lg:col-span-6 flex flex-col justify-center px-4 sm:px-8 md:px-10 py-6 text-slate-100">
                    <div className="max-w-md w-full mx-auto space-y-5">
                        <div className="space-y-2">
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                                {mode === 'register' ? 'Create an account' : 'Welcome back'}
                            </h1>
                            <p className="text-sm text-slate-400">
                                {mode === 'register' ? 'Already have an account? ' : "Don't have a Vyte account yet? "}
                                <button
                                    type="button"
                                    onClick={() => switchAuthMode(mode === 'register' ? 'login' : 'register')}
                                    className="text-[#2BB656] hover:text-emerald-400 font-semibold underline underline-offset-4 transition cursor-pointer"
                                >
                                    {mode === 'register' ? 'Log in' : 'Create account'}
                                </button>
                            </p>
                        </div>

                        {statusBanner && (
                            <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${statusBanner.type === 'success' ? 'bg-emerald-950/70 border-[#2BB656]/50 text-emerald-200' : 'bg-rose-950/70 border-rose-500/50 text-rose-200'}`}>
                                {statusBanner.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-[#2BB656] shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                                <span>{statusBanner.text}</span>
                            </div>
                        )}

                        {mode === 'register' ? (
                            <form key="vyte-register-form" onSubmit={handleSubmit} noValidate className="space-y-4">
                                <div className="grid grid-cols-2 gap-3.5">
                                    <div>
                                        <input
                                            type="text"
                                            placeholder="First name"
                                            value={registerForm.firstName}
                                            onChange={(e) => updateRegField('firstName', e.target.value)}
                                            className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${registerErrors.firstName ? 'border-rose-500 focus:border-rose-500' : 'border-[#2BB656]/50 focus:border-[#2BB656]'}`}
                                        />
                                        {renderErr(registerErrors.firstName)}
                                    </div>
                                    <div>
                                        <input
                                            type="text"
                                            placeholder="Last name"
                                            value={registerForm.lastName}
                                            onChange={(e) => updateRegField('lastName', e.target.value)}
                                            className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${registerErrors.lastName ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700/80 focus:border-[#2BB656]'}`}
                                        />
                                        {renderErr(registerErrors.lastName)}
                                    </div>
                                </div>

                                <div>
                                    <input
                                        type="email"
                                        placeholder="Work email address"
                                        value={registerForm.email}
                                        onChange={(e) => updateRegField('email', e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${registerErrors.email ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700/80 focus:border-[#2BB656]'}`}
                                    />
                                    {renderErr(registerErrors.email)}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                                    <div className="sm:col-span-3">
                                        <input
                                            type="text"
                                            placeholder="Company Name"
                                            value={registerForm.companyName}
                                            onChange={(e) => updateRegField('companyName', e.target.value)}
                                            className={`w-full px-4 py-2.5 rounded-xl bg-[#1E242B] border text-slate-200 placeholder-slate-500 text-xs focus:outline-none transition ${registerErrors.companyName ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700/80 focus:border-[#2BB656]'}`}
                                        />
                                        {renderErr(registerErrors.companyName)}
                                    </div>
                                    <div className="sm:col-span-2">
                                        <VyteDropdown variant="dark" value={registerForm.userType} onChange={(val) => updateRegField('userType', val)} options={ROLE_OPTIONS} />
                                    </div>
                                </div>

                                <div>
                                    <div className="relative">
                                        <input
                                            type={showRegisterPwd ? 'text' : 'password'}
                                            placeholder="Create a strong password"
                                            value={registerForm.password}
                                            onChange={(e) => updateRegField('password', e.target.value)}
                                            autoComplete="new-password"
                                            className={`w-full pl-4 pr-11 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${registerErrors.password ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700/80 focus:border-[#2BB656]'}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowRegisterPwd((p) => !p)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer p-1"
                                        >
                                            {showRegisterPwd ? <EyeOff className="w-4 h-4 text-[#2BB656]" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {renderErr(registerErrors.password)}
                                </div>

                                <div className="space-y-1 pt-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5 text-xs text-slate-300">
                                            <input
                                                type="checkbox"
                                                id="vyte-agree-terms"
                                                checked={registerForm.agreeTerms}
                                                onChange={(e) => updateRegField('agreeTerms', e.target.checked)}
                                                className="w-4 h-4 rounded accent-[#2BB656] cursor-pointer"
                                            />
                                            <label htmlFor="vyte-agree-terms" className="cursor-pointer">I agree to the </label>
                                            <button type="button" onClick={() => setShowTermsModal(true)} className="text-[#2BB656] hover:text-emerald-400 font-semibold underline underline-offset-2 cursor-pointer">
                                                Terms &amp; Conditions
                                            </button>
                                        </div>
                                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Auto-Sign In Enabled
                                        </span>
                                    </div>
                                    {renderErr(registerErrors.agreeTerms)}
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] disabled:opacity-60 active:scale-[0.99] text-[#0B0C0E] font-bold text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    <span>{isSubmitting ? 'Creating account & signing in...' : 'Create account & Enter Hub'}</span>
                                </button>
                            </form>
                        ) : (
                            <form key="vyte-login-form" onSubmit={handleSubmit} noValidate className="space-y-4">
                                <div>
                                    <input
                                        type="email"
                                        placeholder="Work email address"
                                        value={loginForm.email}
                                        onChange={(e) => updateLogField('email', e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${loginErrors.email ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700/80 focus:border-[#2BB656]'}`}
                                    />
                                    {renderErr(loginErrors.email)}
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs text-slate-400">Workspace Role Profile:</span>
                                    <div className="w-48">
                                        <VyteDropdown variant="dark" value={loginForm.userType} onChange={(val) => updateLogField('userType', val)} options={ROLE_OPTIONS} />
                                    </div>
                                </div>

                                <div>
                                    <div className="relative">
                                        <input
                                            type={showLoginPwd ? 'text' : 'password'}
                                            placeholder="Enter your password"
                                            value={loginForm.password}
                                            onChange={(e) => updateLogField('password', e.target.value)}
                                            autoComplete="current-password"
                                            className={`w-full pl-4 pr-11 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${loginErrors.password ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700/80 focus:border-[#2BB656]'}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowLoginPwd((p) => !p)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer p-1"
                                        >
                                            {showLoginPwd ? <EyeOff className="w-4 h-4 text-[#2BB656]" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {renderErr(loginErrors.password)}
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForgotEmail(loginForm.email);
                                            setForgotErrors({});
                                            setForgotStep('REQUEST');
                                            setShowForgotModal(true);
                                        }}
                                        className="text-xs text-[#2BB656] hover:text-emerald-400 font-semibold underline underline-offset-2 cursor-pointer"
                                    >
                                        Forgot password?
                                    </button>
                                    <button type="button" onClick={() => setShowTermsModal(true)} className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 cursor-pointer">
                                        Terms &amp; Conditions
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] disabled:opacity-60 active:scale-[0.99] text-[#0B0C0E] font-bold text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    <span>{isSubmitting ? 'Signing in...' : 'Log in to Vyte'}</span>
                                </button>
                            </form>
                        )}

                        <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-slate-800" />
                            <span className="flex-shrink mx-4 text-xs text-slate-500">
                                Or {mode === 'register' ? 'register' : 'continue'} with
                            </span>
                            <div className="flex-grow border-t border-slate-800" />
                        </div>

                        <div className="grid grid-cols-2 gap-3.5">
                            <button
                                type="button"
                                disabled={ssoLoadingProvider !== null}
                                onClick={() => void handleQuickSSO('Google')}
                                className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-700/80 hover:border-slate-600 disabled:opacity-50 bg-[#1A1F26] hover:bg-[#222831] text-white text-xs font-semibold transition cursor-pointer"
                            >
                                {ssoLoadingProvider === 'Google' ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-[#2BB656]" />
                                ) : (
                                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                                        <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z" />
                                        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z" />
                                        <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z" />
                                        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5L1.6 17c1.9 3.9 5.8 7 10.4 7z" />
                                    </svg>
                                )}
                                Google
                            </button>

                            <button
                                type="button"
                                disabled={ssoLoadingProvider !== null}
                                onClick={() => void handleQuickSSO('SSO')}
                                className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-700/80 hover:border-slate-600 disabled:opacity-50 bg-[#1A1F26] hover:bg-[#222831] text-white text-xs font-semibold transition cursor-pointer"
                            >
                                {ssoLoadingProvider === 'SSO' ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-[#2BB656]" />
                                ) : (
                                    <Layers className="w-4 h-4 text-slate-200" />
                                )}
                                Enterprise SSO
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* FORGOT PASSWORD MODAL */}
            {showForgotModal && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-[#14181D] border border-slate-800 rounded-[24px] overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 bg-gradient-to-r from-[#0F291E] via-[#0B1913] to-[#080B0E] border-b border-[#2BB656]/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-[#2BB656]/20 text-[#2BB656] flex items-center justify-center">
                                    <KeyRound className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Reset Vyte Password</h3>
                                    <p className="text-[11px] text-emerald-300/80">
                                        {forgotStep === 'REQUEST' ? 'Verify your work email' : 'Enter code & new password'}
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setShowForgotModal(false)} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {forgotStep === 'REQUEST' ? (
                            <form onSubmit={handleRequestResetCode} noValidate className="p-6 space-y-4">
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    Enter the work email associated with your Vyte account and we will generate a verification reset code.
                                </p>
                                <div>
                                    <input
                                        type="email"
                                        placeholder="Work email address"
                                        value={forgotEmail}
                                        onChange={(e) => {
                                            setForgotEmail(e.target.value);
                                            setForgotErrors({ email: validateEmail(e.target.value) });
                                        }}
                                        className="w-full px-4 py-3 rounded-xl bg-[#1E242B] border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#2BB656]"
                                    />
                                    {renderErr(forgotErrors.email)}
                                </div>
                                <div className="flex justify-end gap-2.5 pt-2">
                                    <button type="button" onClick={() => setShowForgotModal(false)} className="px-4 py-2.5 rounded-xl bg-white text-[#0B0C0E] font-bold text-xs cursor-pointer">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={isForgotLoading} className="px-4 py-2.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] text-[#0B0C0E] font-bold text-xs flex items-center gap-1.5 cursor-pointer">
                                        {isForgotLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Send Reset Code
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleConfirmPasswordReset} noValidate className="p-6 space-y-4">
                                <div className="p-3 rounded-xl bg-emerald-950/60 border border-[#2BB656]/40 text-xs text-emerald-200">
                                    Verification code for <strong>{forgotEmail}</strong>: <span className="font-mono font-bold text-[#2BB656]">{generatedResetToken}</span>
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 block mb-1">Verification Code</label>
                                    <input
                                        type="text"
                                        value={forgotTokenInput}
                                        onChange={(e) => {
                                            setForgotTokenInput(e.target.value);
                                            setForgotErrors((p) => ({ ...p, token: undefined }));
                                        }}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#1E242B] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-[#2BB656]"
                                    />
                                    {renderErr(forgotErrors.token)}
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 block mb-1">New Password</label>
                                    <div className="relative">
                                        <input
                                            type={showNewResetPwd ? 'text' : 'password'}
                                            placeholder="Enter new strong password"
                                            value={newResetPassword}
                                            onChange={(e) => {
                                                setNewResetPassword(e.target.value);
                                                setForgotErrors((p) => ({ ...p, newPassword: validatePassword(e.target.value, true) }));
                                            }}
                                            className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#1E242B] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#2BB656]"
                                        />
                                        <button type="button" onClick={() => setShowNewResetPwd((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer">
                                            {showNewResetPwd ? <EyeOff className="w-3.5 h-3.5 text-[#2BB656]" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    {renderErr(forgotErrors.newPassword)}
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 block mb-1">Confirm New Password</label>
                                    <input
                                        type={showNewResetPwd ? 'text' : 'password'}
                                        placeholder="Re-enter new password"
                                        value={confirmResetPassword}
                                        onChange={(e) => {
                                            setConfirmResetPassword(e.target.value);
                                            setForgotErrors((p) => ({ ...p, confirmPassword: e.target.value !== newResetPassword ? 'Passwords do not match.' : undefined }));
                                        }}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#1E242B] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#2BB656]"
                                    />
                                    {renderErr(forgotErrors.confirmPassword)}
                                </div>

                                <div className="flex justify-end gap-2.5 pt-2">
                                    <button type="button" onClick={() => setShowForgotModal(false)} className="px-4 py-2.5 rounded-xl bg-white text-[#0B0C0E] font-bold text-xs cursor-pointer">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={isForgotLoading} className="px-4 py-2.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] text-[#0B0C0E] font-bold text-xs flex items-center gap-1.5 cursor-pointer">
                                        {isForgotLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Update Password
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <TermsAndConditionsModal
                isOpen={showTermsModal}
                onAccept={() => {
                    updateRegField('agreeTerms', true);
                    setShowTermsModal(false);
                }}
                onDecline={() => {
                    updateRegField('agreeTerms', false);
                    setShowTermsModal(false);
                }}
            />
        </div>
    );
};