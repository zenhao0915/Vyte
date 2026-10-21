// src/components/auth/LoginPage.tsx
import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Layers, CheckCircle2, TrendingUp, Box } from 'lucide-react';
import type { UserRole, UserSession } from '../../types/vyte.ts';
import { VyteLogo } from '../common/VyteLogo';
import { VyteDropdown } from '../common/VyteDropdown';

interface LoginPageProps {
    onAuthenticated: (session: UserSession) => void;
}

/** @Composable */
export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
    const [mode, setMode] = useState<'register' | 'login'>('register');
    const [firstName, setFirstName] = useState('Jayden');
    const [lastName, setLastName] = useState('Lai');
    const [email, setEmail] = useState('jayden@vyte.my');
    const [password, setPassword] = useState('••••••••••••');
    const [companyName, setCompanyName] = useState('Vyte Smart Logistics Sdn Bhd');
    const [userType, setUserType] = useState<'CEO' | 'Manager' | 'Staff'>('CEO');
    const [showPassword, setShowPassword] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(true);

    const mapUserTypeToRole = (type: 'CEO' | 'Manager' | 'Staff'): UserRole => {
        if (type === 'CEO') return 'SME_OWNER';
        if (type === 'Manager') return 'MANAGER';
        return 'OPERATIONS_STAFF';
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const mappedRole = mapUserTypeToRole(userType);
        const fullName = `${firstName.trim() || 'Vyte'} ${lastName.trim() || 'Operator'}`.trim();

        onAuthenticated({
            userID: userType === 'CEO' ? 'M067' : userType === 'Manager' ? 'M102' : 'S204',
            userName: fullName,
            email,
            userType,
            role: mappedRole,
            companyName,
            companyOwnerName: fullName,
        });
    };

    const handleQuickSSO = (provider: 'Google' | 'SSO') => {
        const mappedRole = mapUserTypeToRole(userType);
        onAuthenticated({
            userID: userType === 'CEO' ? 'M067' : userType === 'Manager' ? 'M102' : 'S204',
            userName: `Jayden Lai (${provider})`,
            email: 'jayden@vyte.my',
            userType,
            role: mappedRole,
            companyName,
            companyOwnerName: 'Jayden Lai',
        });
    };

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
                    <div className="max-w-md w-full mx-auto space-y-6">
                        <div className="space-y-2">
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                                {mode === 'register' ? 'Create an account' : 'Welcome back'}
                            </h1>
                            <p className="text-sm text-slate-400">
                                {mode === 'register' ? 'Already have an account? ' : "Don't have a Vyte account yet? "}
                                <button
                                    type="button"
                                    onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
                                    className="text-[#2BB656] hover:text-emerald-400 font-semibold underline underline-offset-4 transition cursor-pointer"
                                >
                                    {mode === 'register' ? 'Log in' : 'Create account'}
                                </button>
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'register' && (
                                <div className="grid grid-cols-2 gap-3.5">
                                    <div>
                                        <input
                                            type="text"
                                            required
                                            placeholder="First name"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl bg-[#1E242B] border border-[#2BB656]/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#2BB656] focus:ring-2 focus:ring-[#2BB656]/20 transition"
                                        />
                                    </div>
                                    <div>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Last name"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl bg-[#1E242B] border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#2BB656] transition"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <input
                                    type="email"
                                    required
                                    placeholder="Work email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-[#1E242B] border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#2BB656] transition"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                                <div className="sm:col-span-3">
                                    <input
                                        type="text"
                                        required
                                        placeholder="Company Name"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl bg-[#1E242B] border border-slate-700/80 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-[#2BB656] transition"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <VyteDropdown
                                        variant="dark"
                                        value={userType}
                                        onChange={(val) => setUserType(val)}
                                        options={[
                                            { label: 'Role: Owner (CEO)', value: 'CEO' },
                                            { label: 'Role: Manager', value: 'Manager' },
                                            { label: 'Role: Ops Staff', value: 'Staff' },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-4 pr-11 py-3 rounded-xl bg-[#1E242B] border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#2BB656] transition"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={agreeTerms}
                                        onChange={(e) => setAgreeTerms(e.target.checked)}
                                        className="w-4 h-4 rounded accent-[#2BB656] cursor-pointer"
                                    />
                                    <span>
                                        I agree to the{' '}
                                        <span className="text-[#2BB656] underline underline-offset-2">
                                            Terms &amp; Conditions
                                        </span>
                                    </span>
                                </label>
                                <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Role Locked on Login
                                </span>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] active:scale-[0.99] text-[#0B0C0E] font-bold text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                            >
                                {mode === 'register' ? 'Create account' : 'Log in to Vyte'}
                            </button>
                        </form>

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
                                onClick={() => handleQuickSSO('Google')}
                                className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-700/80 hover:border-slate-600 bg-[#1A1F26] hover:bg-[#222831] text-white text-xs font-semibold transition cursor-pointer"
                            >
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
                                Google
                            </button>

                            <button
                                type="button"
                                onClick={() => handleQuickSSO('SSO')}
                                className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-700/80 hover:border-slate-600 bg-[#1A1F26] hover:bg-[#222831] text-white text-xs font-semibold transition cursor-pointer"
                            >
                                <Layers className="w-4 h-4 text-slate-200" />
                                Enterprise SSO
                            </button>
                        </div>

                        <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-500">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#2BB656]" />
                            <span>Vyte Security • Malaysia PDPA Compliant • Role-Based Access</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};