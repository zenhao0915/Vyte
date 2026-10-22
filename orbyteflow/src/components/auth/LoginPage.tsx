// src/components/auth/LoginPage.tsx
import React, { useState, useEffect } from 'react';
import {
    Eye,
    EyeOff,
    Layers,
    CheckCircle2,
    TrendingUp,
    Box,
    AlertCircle,
    Loader2,
    KeyRound,
    X,
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

interface RegisterFormErrors {
    firstName?: string;
    lastName?: string;
    email?: string;
    companyName?: string;
    password?: string;
    agreeTerms?: string;
}

interface LoginFormErrors {
    email?: string;
    password?: string;
}

const REG_DRAFT_STORAGE_KEY = 'vyte_register_draft_v2';
const LOGIN_DRAFT_STORAGE_KEY = 'vyte_login_draft_v2';
const ACCOUNTS_STORAGE_KEY = 'vyte_registered_accounts_v2';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const validatePersonName = (value: string, label: 'First name' | 'Last name'): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return `${label} is required.`;
    if (/\d/.test(trimmed)) return `${label} cannot contain numbers.`;
    if (/[^A-Za-z\s'-]/.test(trimmed)) {
        return `${label} can only contain letters, spaces, hyphens, or apostrophes.`;
    }
    if (trimmed.length < 2 || trimmed.length > 40) {
        return `${label} must be between 2 and 40 letters.`;
    }
    return undefined;
};

const validateEmailField = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return 'Work email address is required.';
    if (!EMAIL_REGEX.test(trimmed)) return 'Enter a valid work email (e.g., name@company.com).';
    return undefined;
};

const validateCompanyField = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return 'Company name is required.';
    if (/^\d+$/.test(trimmed)) return 'Company name cannot contain only numbers.';
    if (trimmed.length < 3) return 'Company name must be at least 3 characters.';
    return undefined;
};

const validatePasswordField = (value: string, isRegister: boolean): string | undefined => {
    if (!value) return 'Password is required.';
    if (value.length < 8) return 'Password must be at least 8 characters long.';
    if (isRegister) {
        if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter (A-Z).';
        if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter (a-z).';
        if (!/\d/.test(value)) return 'Password must include at least one number (0-9).';
        if (!/[!@#$%^&*(),.?":{}|<>_\-=+]/.test(value)) {
            return 'Password must include at least one special character (e.g., @, !, #).';
        }
    }
    return undefined;
};

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
    const [mode, setMode] = useState<'register' | 'login'>('register');

    const [registerForm, setRegisterForm] = useState<RegisterFormState>(() => {
        try {
            const saved = localStorage.getItem(REG_DRAFT_STORAGE_KEY);
            if (saved) return JSON.parse(saved) as RegisterFormState;
        } catch {
            // ignore
        }
        return {
            firstName: '',
            lastName: '',
            email: '',
            companyName: '',
            userType: 'CEO',
            password: '',
            agreeTerms: false,
        };
    });
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);
    const [registerErrors, setRegisterErrors] = useState<RegisterFormErrors>({});

    const [loginForm, setLoginForm] = useState<LoginFormState>(() => {
        try {
            const saved = localStorage.getItem(LOGIN_DRAFT_STORAGE_KEY);
            if (saved) return JSON.parse(saved) as LoginFormState;
        } catch {
            // ignore
        }
        return {
            email: '',
            password: '',
            userType: 'CEO',
        };
    });
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [loginErrors, setLoginErrors] = useState<LoginFormErrors>({});

    const [showTermsModal, setShowTermsModal] = useState(false);
    const [statusBanner, setStatusBanner] = useState<string | null>(null);
    const [isSubmittingMain, setIsSubmittingMain] = useState(false);
    const [ssoLoadingProvider, setSsoLoadingProvider] = useState<'Google' | 'SSO' | null>(null);

    const [registeredAccounts, setRegisteredAccounts] = useState<
        Record<
            string,
            {
                firstName: string;
                lastName: string;
                email: string;
                password: string;
                companyName: string;
                userType: 'CEO' | 'Manager' | 'Staff';
                userID: string;
            }
        >
    >(() => {
        try {
            const saved = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    // Persist typed form inputs & registered accounts in localStorage
    useEffect(() => {
        localStorage.setItem(REG_DRAFT_STORAGE_KEY, JSON.stringify(registerForm));
    }, [registerForm]);

    useEffect(() => {
        localStorage.setItem(LOGIN_DRAFT_STORAGE_KEY, JSON.stringify(loginForm));
    }, [loginForm]);

    useEffect(() => {
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(registeredAccounts));
    }, [registeredAccounts]);

    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotStep, setForgotStep] = useState<'REQUEST' | 'RESET'>('REQUEST');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotTokenInput, setForgotTokenInput] = useState('');
    const [generatedResetToken, setGeneratedResetToken] = useState('');
    const [newResetPassword, setNewResetPassword] = useState('');
    const [confirmResetPassword, setConfirmResetPassword] = useState('');
    const [showNewResetPassword, setShowNewResetPassword] = useState(false);
    const [forgotErrors, setForgotErrors] = useState<{
        email?: string;
        token?: string;
        newPassword?: string;
        confirmPassword?: string;
    }>({});
    const [isForgotLoading, setIsForgotLoading] = useState(false);

    const mapUserTypeToRole = (type: 'CEO' | 'Manager' | 'Staff'): UserRole => {
        if (type === 'CEO') return 'SME_OWNER';
        if (type === 'Manager') return 'MANAGER';
        return 'OPERATIONS_STAFF';
    };

    const switchAuthMode = (targetMode: 'register' | 'login') => {
        setMode(targetMode);
        setStatusBanner(null);
        setShowRegisterPassword(false);
        setShowLoginPassword(false);
    };

    const updateRegisterField = <K extends keyof RegisterFormState>(
        field: K,
        value: RegisterFormState[K]
    ) => {
        setRegisterForm((prev) => ({ ...prev, [field]: value }));

        setRegisterErrors((prev) => {
            const next = { ...prev };
            if (field === 'firstName') {
                next.firstName = validatePersonName(String(value), 'First name');
            } else if (field === 'lastName') {
                next.lastName = validatePersonName(String(value), 'Last name');
            } else if (field === 'email') {
                next.email = validateEmailField(String(value));
            } else if (field === 'companyName') {
                next.companyName = validateCompanyField(String(value));
            } else if (field === 'password') {
                next.password = validatePasswordField(String(value), true);
            } else if (field === 'agreeTerms') {
                next.agreeTerms = value
                    ? undefined
                    : 'You must accept the Terms & Conditions to create an account.';
            }
            return next;
        });
    };

    const updateLoginField = <K extends keyof LoginFormState>(
        field: K,
        value: LoginFormState[K]
    ) => {
        setLoginForm((prev) => ({ ...prev, [field]: value }));

        setLoginErrors((prev) => {
            const next = { ...prev };
            if (field === 'email') {
                next.email = validateEmailField(String(value));
            } else if (field === 'password') {
                next.password = validatePasswordField(String(value), false);
            }
            return next;
        });
    };

    const validateRegisterSubmit = (): boolean => {
        const errs: RegisterFormErrors = {
            firstName: validatePersonName(registerForm.firstName, 'First name'),
            lastName: validatePersonName(registerForm.lastName, 'Last name'),
            email: validateEmailField(registerForm.email),
            companyName: validateCompanyField(registerForm.companyName),
            password: validatePasswordField(registerForm.password, true),
            agreeTerms: registerForm.agreeTerms
                ? undefined
                : 'You must accept the Terms & Conditions to create an account.',
        };
        setRegisterErrors(errs);
        return !Object.values(errs).some(Boolean);
    };

    const validateLoginSubmit = (): boolean => {
        const errs: LoginFormErrors = {
            email: validateEmailField(loginForm.email),
            password: validatePasswordField(loginForm.password, false),
        };

        const normalizedEmail = loginForm.email.trim().toLowerCase();
        const matchedAccount = registeredAccounts[normalizedEmail];
        if (!errs.password && matchedAccount && matchedAccount.password !== loginForm.password) {
            errs.password = 'Incorrect password for this account.';
        }

        setLoginErrors(errs);
        return !Object.values(errs).some(Boolean);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusBanner(null);

        if (mode === 'register') {
            if (!validateRegisterSubmit()) return;

            setIsSubmittingMain(true);
            try {
                const mappedRole = mapUserTypeToRole(registerForm.userType);
                const cleanFirst = registerForm.firstName.trim();
                const cleanLast = registerForm.lastName.trim();
                const fullName = `${cleanFirst} ${cleanLast}`.trim();
                const cleanEmail = registerForm.email.trim();
                const cleanCompany = registerForm.companyName.trim();
                const selectedType = registerForm.userType;

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

                const emailKey = cleanEmail.toLowerCase();
                setRegisteredAccounts((prev) => ({
                    ...prev,
                    [emailKey]: {
                        firstName: cleanFirst,
                        lastName: cleanLast,
                        email: cleanEmail,
                        password: registerForm.password,
                        companyName: cleanCompany,
                        userType: selectedType,
                        userID: res.data.userID,
                    },
                }));

                localStorage.removeItem(REG_DRAFT_STORAGE_KEY);

                // Requirement 2: Immediately auto-login with the registered email & account!
                onAuthenticated(
                    {
                        userID:
                            res.data.userID ||
                            (selectedType === 'CEO' ? 'M067' : selectedType === 'Manager' ? 'M102' : 'S204'),
                        userName: fullName,
                        email: cleanEmail,
                        userType: selectedType,
                        role: mappedRole,
                        companyName: cleanCompany,
                        companyOwnerName: fullName,
                    },
                    `vyte-jwt-${Date.now()}`
                );
            } finally {
                setIsSubmittingMain(false);
            }
            return;
        }

        // LOGIN MODE
        if (!validateLoginSubmit()) return;

        setIsSubmittingMain(true);
        try {
            const emailKey = loginForm.email.trim().toLowerCase();
            const matchedAccount = registeredAccounts[emailKey];

            const activeUserType = matchedAccount ? matchedAccount.userType : loginForm.userType;
            const activeRole = mapUserTypeToRole(activeUserType);
            const activeFullName = matchedAccount
                ? `${matchedAccount.firstName} ${matchedAccount.lastName}`
                : loginForm.email.trim().split('@')[0] || 'Vyte Operator';
            const activeCompany = matchedAccount
                ? matchedAccount.companyName
                : 'Vyte Smart Logistics Sdn Bhd';

            const loginRes = await orbyteApi.loginAccount({
                email: loginForm.email.trim(),
                password: loginForm.password,
                companyName: activeCompany,
                userType: activeUserType,
            });

            onAuthenticated(
                {
                    userID:
                        matchedAccount?.userID ??
                        loginRes.data.session?.userID ??
                        (activeUserType === 'CEO'
                            ? 'M067'
                            : activeUserType === 'Manager'
                                ? 'M102'
                                : 'S204'),
                    userName: activeFullName,
                    email: loginForm.email.trim(),
                    userType: activeUserType,
                    role: activeRole,
                    companyName: activeCompany,
                    companyOwnerName: activeFullName,
                },
                loginRes.data.accessToken
            );
        } finally {
            setIsSubmittingMain(false);
        }
    };

    const handleQuickSSO = async (provider: 'Google' | 'SSO') => {
        setStatusBanner(null);

        if (mode === 'register' && !registerForm.agreeTerms) {
            setRegisterErrors((prev) => ({
                ...prev,
                agreeTerms: `Please accept the Terms & Conditions before registering with ${provider}.`,
            }));
            return;
        }

        setSsoLoadingProvider(provider);
        const activeUserType = mode === 'register' ? registerForm.userType : loginForm.userType;
        const mappedRole = mapUserTypeToRole(activeUserType);
        const targetEmail =
            (mode === 'register' ? registerForm.email : loginForm.email).trim() || 'jayden@vyte.my';
        const targetFullName =
            mode === 'register' && (registerForm.firstName.trim() || registerForm.lastName.trim())
                ? `${registerForm.firstName.trim()} ${registerForm.lastName.trim()}`.trim()
                : targetEmail.split('@')[0] || 'Jayden Lai';

        try {
            if (provider === 'Google') {
                const googleRes = await orbyteApi.loginWithGoogle({
                    idToken: `mock-google-jwt-${Date.now()}`,
                    email: targetEmail,
                    fullName: targetFullName,
                    companyName: registerForm.companyName.trim() || 'Vyte Smart Logistics Sdn Bhd',
                    userType: activeUserType,
                    role: mappedRole,
                });

                onAuthenticated(
                    {
                        ...googleRes.data.session,
                        email: targetEmail,
                        userName: targetFullName,
                    },
                    googleRes.data.accessToken
                );
            } else {
                const ssoRes = await orbyteApi.loginWithEnterpriseSso({
                    ssoAssertionToken: `mock-saml-oidc-token-${Date.now()}`,
                    corporateDomain: (targetEmail.split('@')[1] || 'vyte.my').trim(),
                    email: targetEmail,
                    companyName: registerForm.companyName.trim() || 'Vyte Smart Logistics Sdn Bhd',
                    userType: activeUserType,
                    role: mappedRole,
                });

                onAuthenticated(
                    {
                        ...ssoRes.data.session,
                        email: targetEmail,
                        userName: targetFullName,
                    },
                    ssoRes.data.accessToken
                );
            }
        } finally {
            setSsoLoadingProvider(null);
        }
    };

    const handleRequestResetCode = async (e: React.FormEvent) => {
        e.preventDefault();
        const emailErr = validateEmailField(forgotEmail);
        if (emailErr) {
            setForgotErrors({ email: emailErr });
            return;
        }

        setIsForgotLoading(true);
        try {
            const res = await orbyteApi.requestPasswordReset({ email: forgotEmail.trim() });
            setGeneratedResetToken(res.data.resetToken);
            setForgotTokenInput(res.data.resetToken);
            setForgotErrors({});
            setForgotStep('RESET');
        } finally {
            setIsForgotLoading(false);
        }
    };

    const handleConfirmPasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs: {
            token?: string;
            newPassword?: string;
            confirmPassword?: string;
        } = {};

        if (!forgotTokenInput.trim()) {
            errs.token = 'Verification code is required.';
        } else if (
            generatedResetToken &&
            forgotTokenInput.trim().toUpperCase() !== generatedResetToken.toUpperCase()
        ) {
            errs.token = 'Invalid verification code.';
        }

        const pwdErr = validatePasswordField(newResetPassword, true);
        if (pwdErr) errs.newPassword = pwdErr;

        if (!confirmResetPassword) {
            errs.confirmPassword = 'Please confirm your new password.';
        } else if (confirmResetPassword !== newResetPassword) {
            errs.confirmPassword = 'Passwords do not match.';
        }

        if (Object.values(errs).some(Boolean)) {
            setForgotErrors(errs);
            return;
        }

        setIsForgotLoading(true);
        try {
            const res = await orbyteApi.confirmPasswordReset({
                email: forgotEmail.trim(),
                resetToken: forgotTokenInput.trim(),
                newPassword: newResetPassword,
            });

            const emailKey = forgotEmail.trim().toLowerCase();
            if (registeredAccounts[emailKey]) {
                setRegisteredAccounts((prev) => ({
                    ...prev,
                    [emailKey]: {
                        ...prev[emailKey],
                        password: newResetPassword,
                    },
                }));
            }

            setShowForgotModal(false);
            setForgotStep('REQUEST');
            setNewResetPassword('');
            setConfirmResetPassword('');
            setMode('login');
            setLoginForm((prev) => ({ ...prev, email: forgotEmail.trim(), password: '' }));
            setStatusBanner(res.data.message);
        } finally {
            setIsForgotLoading(false);
        }
    };

    const renderFieldError = (msg?: string) =>
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
                    <svg
                        viewBox="0 0 600 700"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    >
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
                        <path
                            d="M -40 410 Q 180 270 360 355 T 640 315 L 640 700 L -40 700 Z"
                            fill="url(#vyte-wave-1)"
                        />
                        <path
                            d="M -40 485 Q 250 360 430 450 T 640 410 L 640 700 L -40 700 Z"
                            fill="url(#vyte-wave-2)"
                        />
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
                            <p className="text-[11px] text-slate-300/80 leading-relaxed">
                                Depletion-driven PO drafting with human-in-the-loop approval.
                            </p>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/[0.06] backdrop-blur-md border border-white/10 space-y-1.5">
                            <div className="w-8 h-8 rounded-lg bg-[#2BB656]/20 text-[#2BB656] flex items-center justify-center">
                                <TrendingUp className="w-4 h-4" />
                            </div>
                            <p className="text-xs font-bold text-white">AI Sales &amp; Expiry</p>
                            <p className="text-[11px] text-slate-300/80 leading-relaxed">
                                Quarterly holding-cost analytics &amp; proactive batch quality alerts.
                            </p>
                        </div>
                    </div>

                    <div className="relative z-10 text-center space-y-2 pb-1">
                        <h2 className="text-2xl font-bold text-white tracking-tight">
                            Smart Inventory, Zero Stockouts
                        </h2>
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
                                {mode === 'register'
                                    ? 'Already have an account? '
                                    : "Don't have a Vyte account yet? "}
                                <button
                                    type="button"
                                    onClick={() =>
                                        switchAuthMode(mode === 'register' ? 'login' : 'register')
                                    }
                                    className="text-[#2BB656] hover:text-emerald-400 font-semibold underline underline-offset-4 transition cursor-pointer"
                                >
                                    {mode === 'register' ? 'Log in' : 'Create account'}
                                </button>
                            </p>
                        </div>

                        {statusBanner && (
                            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-[#2BB656]/50 text-emerald-200 text-xs font-medium flex items-start gap-2.5">
                                <CheckCircle2 className="w-4 h-4 text-[#2BB656] shrink-0 mt-0.5" />
                                <span>{statusBanner}</span>
                            </div>
                        )}

                        {mode === 'register' ? (
                            <form
                                key="vyte-register-form"
                                onSubmit={handleSubmit}
                                noValidate
                                className="space-y-4"
                            >
                                <div className="grid grid-cols-2 gap-3.5">
                                    <div>
                                        <input
                                            key="reg-first-name"
                                            type="text"
                                            placeholder="First name"
                                            value={registerForm.firstName}
                                            onChange={(e) =>
                                                updateRegisterField('firstName', e.target.value)
                                            }
                                            className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${
                                                registerErrors.firstName
                                                    ? 'border-rose-500 focus:border-rose-500'
                                                    : 'border-[#2BB656]/50 focus:border-[#2BB656]'
                                            }`}
                                        />
                                        {renderFieldError(registerErrors.firstName)}
                                    </div>
                                    <div>
                                        <input
                                            key="reg-last-name"
                                            type="text"
                                            placeholder="Last name"
                                            value={registerForm.lastName}
                                            onChange={(e) =>
                                                updateRegisterField('lastName', e.target.value)
                                            }
                                            className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${
                                                registerErrors.lastName
                                                    ? 'border-rose-500 focus:border-rose-500'
                                                    : 'border-slate-700/80 focus:border-[#2BB656]'
                                            }`}
                                        />
                                        {renderFieldError(registerErrors.lastName)}
                                    </div>
                                </div>

                                <div>
                                    <input
                                        key="reg-email"
                                        type="email"
                                        placeholder="Work email address"
                                        value={registerForm.email}
                                        onChange={(e) => updateRegisterField('email', e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${
                                            registerErrors.email
                                                ? 'border-rose-500 focus:border-rose-500'
                                                : 'border-slate-700/80 focus:border-[#2BB656]'
                                        }`}
                                    />
                                    {renderFieldError(registerErrors.email)}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                                    <div className="sm:col-span-3">
                                        <input
                                            key="reg-company"
                                            type="text"
                                            placeholder="Company Name"
                                            value={registerForm.companyName}
                                            onChange={(e) =>
                                                updateRegisterField('companyName', e.target.value)
                                            }
                                            className={`w-full px-4 py-2.5 rounded-xl bg-[#1E242B] border text-slate-200 placeholder-slate-500 text-xs focus:outline-none transition ${
                                                registerErrors.companyName
                                                    ? 'border-rose-500 focus:border-rose-500'
                                                    : 'border-slate-700/80 focus:border-[#2BB656]'
                                            }`}
                                        />
                                        {renderFieldError(registerErrors.companyName)}
                                    </div>
                                    <div className="sm:col-span-2">
                                        <VyteDropdown
                                            variant="dark"
                                            value={registerForm.userType}
                                            onChange={(val) => updateRegisterField('userType', val)}
                                            options={[
                                                { label: 'Role: Owner (CEO)', value: 'CEO' },
                                                { label: 'Role: Manager', value: 'Manager' },
                                                { label: 'Role: Ops Staff', value: 'Staff' },
                                            ]}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="relative">
                                        <input
                                            key="reg-password"
                                            type={showRegisterPassword ? 'text' : 'password'}
                                            placeholder="Create a strong password"
                                            value={registerForm.password}
                                            onChange={(e) =>
                                                updateRegisterField('password', e.target.value)
                                            }
                                            autoComplete="new-password"
                                            className={`w-full pl-4 pr-11 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${
                                                registerErrors.password
                                                    ? 'border-rose-500 focus:border-rose-500'
                                                    : 'border-slate-700/80 focus:border-[#2BB656]'
                                            }`}
                                        />
                                        <button
                                            type="button"
                                            aria-label={
                                                showRegisterPassword ? 'Hide password' : 'Show password'
                                            }
                                            onClick={() => setShowRegisterPassword((prev) => !prev)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer p-1"
                                        >
                                            {showRegisterPassword ? (
                                                <EyeOff className="w-4 h-4 text-[#2BB656]" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                    {renderFieldError(registerErrors.password)}
                                </div>

                                <div className="space-y-1 pt-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5 text-xs text-slate-300">
                                            <input
                                                type="checkbox"
                                                id="vyte-agree-terms"
                                                checked={registerForm.agreeTerms}
                                                onChange={(e) =>
                                                    updateRegisterField('agreeTerms', e.target.checked)
                                                }
                                                className="w-4 h-4 rounded accent-[#2BB656] cursor-pointer"
                                            />
                                            <label htmlFor="vyte-agree-terms" className="cursor-pointer">
                                                I agree to the{' '}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowTermsModal(true)}
                                                className="text-[#2BB656] hover:text-emerald-400 font-semibold underline underline-offset-2 cursor-pointer"
                                            >
                                                Terms &amp; Conditions
                                            </button>
                                        </div>

                                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Auto-Sign In Enabled
                    </span>
                                    </div>
                                    {renderFieldError(registerErrors.agreeTerms)}
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmittingMain}
                                    className="w-full py-3.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] disabled:opacity-60 active:scale-[0.99] text-[#0B0C0E] font-bold text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {isSubmittingMain && <Loader2 className="w-4 h-4 animate-spin" />}
                                    <span>
                    {isSubmittingMain
                        ? 'Creating account & signing in...'
                        : 'Create account & Enter Hub'}
                  </span>
                                </button>
                            </form>
                        ) : (
                            <form
                                key="vyte-login-form"
                                onSubmit={handleSubmit}
                                noValidate
                                className="space-y-4"
                            >
                                <div>
                                    <input
                                        key="login-email"
                                        type="email"
                                        placeholder="Work email address"
                                        value={loginForm.email}
                                        onChange={(e) => updateLoginField('email', e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${
                                            loginErrors.email
                                                ? 'border-rose-500 focus:border-rose-500'
                                                : 'border-slate-700/80 focus:border-[#2BB656]'
                                        }`}
                                    />
                                    {renderFieldError(loginErrors.email)}
                                </div>

                                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">
                    Workspace Role Profile:
                  </span>
                                    <div className="w-48">
                                        <VyteDropdown
                                            variant="dark"
                                            value={loginForm.userType}
                                            onChange={(val) => updateLoginField('userType', val)}
                                            options={[
                                                { label: 'Role: Owner (CEO)', value: 'CEO' },
                                                { label: 'Role: Manager', value: 'Manager' },
                                                { label: 'Role: Ops Staff', value: 'Staff' },
                                            ]}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="relative">
                                        <input
                                            key="login-password"
                                            type={showLoginPassword ? 'text' : 'password'}
                                            placeholder="Enter your password"
                                            value={loginForm.password}
                                            onChange={(e) =>
                                                updateLoginField('password', e.target.value)
                                            }
                                            autoComplete="current-password"
                                            className={`w-full pl-4 pr-11 py-3 rounded-xl bg-[#1E242B] border text-white placeholder-slate-500 text-sm focus:outline-none transition ${
                                                loginErrors.password
                                                    ? 'border-rose-500 focus:border-rose-500'
                                                    : 'border-slate-700/80 focus:border-[#2BB656]'
                                            }`}
                                        />
                                        <button
                                            type="button"
                                            aria-label={
                                                showLoginPassword ? 'Hide password' : 'Show password'
                                            }
                                            onClick={() => setShowLoginPassword((prev) => !prev)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer p-1"
                                        >
                                            {showLoginPassword ? (
                                                <EyeOff className="w-4 h-4 text-[#2BB656]" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                    {renderFieldError(loginErrors.password)}
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

                                    <button
                                        type="button"
                                        onClick={() => setShowTermsModal(true)}
                                        className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 cursor-pointer"
                                    >
                                        Terms &amp; Conditions
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmittingMain}
                                    className="w-full py-3.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] disabled:opacity-60 active:scale-[0.99] text-[#0B0C0E] font-bold text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {isSubmittingMain && <Loader2 className="w-4 h-4 animate-spin" />}
                                    <span>
                    {isSubmittingMain ? 'Signing in...' : 'Log in to Vyte'}
                  </span>
                                </button>
                            </form>
                        )}

                        <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-slate-800"></div>
                            <span className="flex-shrink mx-4 text-xs text-slate-500">
                Or {mode === 'register' ? 'register' : 'continue'} with
              </span>
                            <div className="flex-grow border-t border-slate-800"></div>
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
                                        <path
                                            fill="#EA4335"
                                            d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                                        />
                                        <path
                                            fill="#4285F4"
                                            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                                        />
                                        <path
                                            fill="#FBBC05"
                                            d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                                        />
                                        <path
                                            fill="#34A853"
                                            d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5L1.6 17c1.9 3.9 5.8 7 10.4 7z"
                                        />
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
                                    <h3 className="text-sm font-bold text-white">
                                        Reset Vyte Password
                                    </h3>
                                    <p className="text-[11px] text-emerald-300/80">
                                        {forgotStep === 'REQUEST'
                                            ? 'Step 1: Verify your work email'
                                            : 'Step 2: Enter code & new password'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowForgotModal(false)}
                                className="text-slate-400 hover:text-white p-1 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {forgotStep === 'REQUEST' ? (
                            <form
                                onSubmit={handleRequestResetCode}
                                noValidate
                                className="p-6 space-y-4"
                            >
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
                                            setForgotErrors({
                                                email: validateEmailField(e.target.value),
                                            });
                                        }}
                                        className="w-full px-4 py-3 rounded-xl bg-[#1E242B] border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#2BB656]"
                                    />
                                    {renderFieldError(forgotErrors.email)}
                                </div>
                                <div className="flex justify-end gap-2.5 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowForgotModal(false)}
                                        className="px-4 py-2.5 rounded-xl bg-white text-[#0B0C0E] font-bold text-xs cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isForgotLoading}
                                        className="px-4 py-2.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] text-[#0B0C0E] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {isForgotLoading && (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        )}
                                        Send Reset Code
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form
                                onSubmit={handleConfirmPasswordReset}
                                noValidate
                                className="p-6 space-y-4"
                            >
                                <div className="p-3 rounded-xl bg-emerald-950/60 border border-[#2BB656]/40 text-xs text-emerald-200">
                                    Verification code for <strong>{forgotEmail}</strong>:{' '}
                                    <span className="font-mono font-bold text-[#2BB656]">
                    {generatedResetToken}
                  </span>
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 block mb-1">
                                        Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        value={forgotTokenInput}
                                        onChange={(e) => {
                                            setForgotTokenInput(e.target.value);
                                            setForgotErrors((prev) => ({
                                                ...prev,
                                                token: undefined,
                                            }));
                                        }}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#1E242B] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-[#2BB656]"
                                    />
                                    {renderFieldError(forgotErrors.token)}
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 block mb-1">
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showNewResetPassword ? 'text' : 'password'}
                                            placeholder="Enter new strong password"
                                            value={newResetPassword}
                                            onChange={(e) => {
                                                setNewResetPassword(e.target.value);
                                                setForgotErrors((prev) => ({
                                                    ...prev,
                                                    newPassword: validatePasswordField(
                                                        e.target.value,
                                                        true
                                                    ),
                                                }));
                                            }}
                                            className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#1E242B] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#2BB656]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewResetPassword((p) => !p)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                                        >
                                            {showNewResetPassword ? (
                                                <EyeOff className="w-3.5 h-3.5 text-[#2BB656]" />
                                            ) : (
                                                <Eye className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                    {renderFieldError(forgotErrors.newPassword)}
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 block mb-1">
                                        Confirm New Password
                                    </label>
                                    <input
                                        type={showNewResetPassword ? 'text' : 'password'}
                                        placeholder="Re-enter new password"
                                        value={confirmResetPassword}
                                        onChange={(e) => {
                                            setConfirmResetPassword(e.target.value);
                                            setForgotErrors((prev) => ({
                                                ...prev,
                                                confirmPassword:
                                                    e.target.value !== newResetPassword
                                                        ? 'Passwords do not match.'
                                                        : undefined,
                                            }));
                                        }}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#1E242B] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#2BB656]"
                                    />
                                    {renderFieldError(forgotErrors.confirmPassword)}
                                </div>

                                <div className="flex justify-end gap-2.5 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowForgotModal(false)}
                                        className="px-4 py-2.5 rounded-xl bg-white text-[#0B0C0E] font-bold text-xs cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isForgotLoading}
                                        className="px-4 py-2.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] text-[#0B0C0E] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {isForgotLoading && (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        )}
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
                    updateRegisterField('agreeTerms', true);
                    setShowTermsModal(false);
                }}
                onDecline={() => {
                    updateRegisterField('agreeTerms', false);
                    setShowTermsModal(false);
                }}
            />
        </div>
    );
};