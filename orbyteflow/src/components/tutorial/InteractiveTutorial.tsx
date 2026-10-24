// src/components/tutorial/InteractiveTutorial.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Sparkles,
    ChevronRight,
    ChevronLeft,
    X,
    CheckCircle2,
    Compass,
    Layers,
} from 'lucide-react';
import type { ActiveTab } from '../../types/vyte.ts';

export interface TutorialStep {
    id: string;
    targetSelector: string;
    title: string;
    moduleBadge: string;
    description: string;
    actionTip: string;
    tab: ActiveTab;
    subTab?: 'restock' | 'orders';
    preferredPosition?: 'top' | 'bottom' | 'left' | 'right';
}

interface InteractiveTutorialProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    activeTab: ActiveTab;
    inventorySubTab: 'restock' | 'orders';
    onNavigate: (tab: ActiveTab, subTab?: 'restock' | 'orders') => void;
}

export const TUTORIAL_STORAGE_KEY = 'vyte_onboarding_tour_completed_v1';

export const getTutorialStorageKey = (userId?: string) =>
    userId ? `vyte_onboarding_tour_completed_${userId}_v1` : 'vyte_onboarding_tour_completed_guest_v1';

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'sidebar-nav',
        targetSelector: '[data-tour="sidebar-nav"]',
        title: 'Unified Workspace Navigation',
        moduleBadge: 'Workspace Hub',
        description:
            'Welcome to Vyte! Use this sidebar to switch between core operational modules, search SKUs globally, and monitor real-time pending task badges.',
        actionTip: 'Click any module tab to switch views, or collapse the sidebar for extra screen space.',
        tab: 'mod1',
        subTab: 'restock',
        preferredPosition: 'right',
    },
    {
        id: 'header-alerts',
        targetSelector: '[data-tour="header-controls"]',
        title: 'Live FX Rates & Action Center',
        moduleBadge: 'Global Header',
        description:
            'Sync live multi-currency exchange rates (MYR, SGD, USD, RMB) and open the Action Center bell to jump directly to urgent restocks, orders, or expiring batches.',
        actionTip: 'Click the currency pill to refresh live FX rates or the bell icon to inspect unread alerts.',
        tab: 'mod1',
        subTab: 'restock',
        preferredPosition: 'bottom',
    },
    {
        id: 'industry-filter',
        targetSelector: '[data-tour="industry-filter"]',
        title: 'Sub-Module & Industry Filtering',
        moduleBadge: 'Module 1 • Navigation',
        description:
            'Toggle between Inventory & Restock and Customer Orders on the left, or filter your catalog by F&B Perishables, Retail Variants, and B2B Packaging on the right.',
        actionTip: 'Select an industry pill to isolate specific SKU profiles immediately.',
        tab: 'mod1',
        subTab: 'restock',
        preferredPosition: 'bottom',
    },
    {
        id: 'restock-workspace',
        targetSelector: '[data-tour="restock-module"]',
        title: 'Autonomous Restock & Supplier RFQs',
        moduleBadge: 'Module 1 • Inventory & Restock',
        description:
            'Manage active stock levels, record daily counter usage, compare supplier RFQ bids with AI defect memory, and dispatch Purchase Orders via WhatsApp.',
        actionTip: 'Use "Add Product", "Import CSV", or "Approve & Contact" on low-stock items to trigger procurement.',
        tab: 'mod1',
        subTab: 'restock',
        preferredPosition: 'top',
    },
    {
        id: 'customer-orders',
        targetSelector: '[data-tour="orders-module"]',
        title: 'AI Customer Order Fulfillment',
        moduleBadge: 'Module 2 • Customer Orders',
        description:
            'Paste raw WhatsApp or email order messages, upload order photos, or import spreadsheets. Vyte AI extracts line items, checks live warehouse stock, and drafts multilingual replies.',
        actionTip: 'Verify extracted quantities and click Approve to deduct stock and generate a receivable invoice.',
        tab: 'mod1',
        subTab: 'orders',
        preferredPosition: 'top',
    },
    {
        id: 'sales-analytics',
        targetSelector: '[data-tour="sales-module"]',
        title: 'AI Sales Review & Demand Forecast',
        moduleBadge: 'Module 3 • Sales Analytics',
        description:
            'Analyze quarterly revenue, holding costs, and SKU depletion velocity. Push AI-recommended restock quantities directly into your procurement queue.',
        actionTip: 'Review high-velocity items and click Queue Restock to update target reorder quantities.',
        tab: 'mod2',
        preferredPosition: 'top',
    },
    {
        id: 'quality-expiry',
        targetSelector: '[data-tour="qc-module"]',
        title: 'Batch Quality & Expiry Guardian',
        moduleBadge: 'Module 4 • Quality Control',
        description:
            'Prevent perishable spoilage and batch defects. Scan shelf-life thresholds, review AI promo or quarantine suggestions, and dispatch tasks to warehouse staff.',
        actionTip: 'Assign urgent QC tasks to staff members and escalate overdue inspections when needed.',
        tab: 'mod4',
        preferredPosition: 'top',
    },
    {
        id: 'smart-invoices',
        targetSelector: '[data-tour="invoice-module"]',
        title: 'Smart Invoices & LHDN Readiness',
        moduleBadge: 'Module 5 • Smart Invoices',
        description:
            'Track Accounts Payable and Receivable in one ledger. Upload receipt photos or spreadsheets for automated AI accounting categorization and payment verification.',
        actionTip: 'Click Verify on AI-categorized invoices or toggle Paid/Unpaid settlement statuses.',
        tab: 'mod5',
        preferredPosition: 'top',
    },
    {
        id: 'compliance-renewal',
        targetSelector: '[data-tour="compliance-module"]',
        title: 'License, Rental & Warranty Compliance',
        moduleBadge: 'Module 6 • Compliance',
        description:
            'Monitor SSM, local council (PBT) licenses, commercial fleet road tax, tenancy contracts, and OEM warranties alongside your secure Document Vault.',
        actionTip: 'Track expiring permits and bundle multi-year renewals to unlock cost savings.',
        tab: 'mod6',
        preferredPosition: 'top',
    },
    {
        id: 'audit-logs',
        targetSelector: '[data-tour="logs-module"]',
        title: 'Immutable Activity & Audit Trail',
        moduleBadge: 'Governance • Audit Logs',
        description:
            'Every AI trigger, stock deduction, purchase order approval, and role action is timestamped here for complete operational accountability.',
        actionTip: 'Filter events by Owner, Manager, or Ops Staff to audit workspace activity.',
        tab: 'logs',
        preferredPosition: 'top',
    },
    {
        id: 'settings-replay',
        targetSelector: '[data-tour="sidebar-settings"]',
        title: 'Workspace Settings & Tutorial Replay',
        moduleBadge: 'Preferences & Help',
        description:
            'Configure operating currencies, AI turnover targets, RBAC rules, and debug datasets here. You can also relaunch this interactive tutorial anytime from Settings!',
        actionTip: 'Click "Settings" whenever you want to customize Vyte or replay this guided tour.',
        tab: 'mod1',
        subTab: 'restock',
        preferredPosition: 'right',
    },
];

interface SpotlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export const InteractiveTutorial: React.FC<InteractiveTutorialProps> = ({
                                                                            isOpen,
                                                                            onClose,
                                                                            onComplete,
                                                                            activeTab,
                                                                            inventorySubTab,
                                                                            onNavigate,
                                                                        }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [rect, setRect] = useState<SpotlightRect | null>(null);

    const step = TUTORIAL_STEPS[currentStepIndex] || TUTORIAL_STEPS[0];
    const totalSteps = TUTORIAL_STEPS.length;

    // Reset to first step whenever opened
    useEffect(() => {
        if (isOpen) {
            setCurrentStepIndex(0);
        }
    }, [isOpen]);

    // Automatically switch page/tab to match the current tutorial step
    useEffect(() => {
        if (!isOpen || !step) return;
        const needsTabSwitch = activeTab !== step.tab;
        const needsSubTabSwitch = step.subTab && inventorySubTab !== step.subTab;

        if (needsTabSwitch || needsSubTabSwitch) {
            onNavigate(step.tab, step.subTab);
        }
    }, [isOpen, step, activeTab, inventorySubTab, onNavigate]);

    // Measure target DOM element & keep spotlight aligned
    const updateSpotlightRect = useCallback(() => {
        if (!isOpen || !step) return;
        const el = document.querySelector(step.targetSelector) as HTMLElement | null;
        if (!el) {
            setRect(null);
            return;
        }

        const r = el.getBoundingClientRect();
        const padding = 8;
        // Clamp within viewport so wide/tall module containers remain cleanly framed
        const top = Math.max(8, r.top - padding);
        const left = Math.max(8, r.left - padding);
        const right = Math.min(window.innerWidth - 8, r.right + padding);
        const bottom = Math.min(window.innerHeight - 8, r.bottom + padding);

        setRect({
            top,
            left,
            width: Math.max(40, right - left),
            height: Math.max(36, bottom - top),
        });
    }, [isOpen, step]);

    useEffect(() => {
        if (!isOpen) return;

        // Scroll target into view smoothly after tab transition
        const timer = setTimeout(() => {
            const el = document.querySelector(step.targetSelector) as HTMLElement | null;
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
            updateSpotlightRect();
        }, 120);

        window.addEventListener('resize', updateSpotlightRect);
        window.addEventListener('scroll', updateSpotlightRect, true);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateSpotlightRect);
            window.removeEventListener('scroll', updateSpotlightRect, true);
        };
    }, [isOpen, currentStepIndex, step.targetSelector, updateSpotlightRect]);

    // Keyboard navigation support
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowRight') {
                if (currentStepIndex < totalSteps - 1) {
                    setCurrentStepIndex((prev) => prev + 1);
                } else {
                    onComplete();
                }
            } else if (e.key === 'ArrowLeft' && currentStepIndex > 0) {
                setCurrentStepIndex((prev) => prev - 1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentStepIndex, totalSteps, onClose, onComplete]);

    if (!isOpen) return null;

    // Calculate optimal tooltip card position & arrow direction
    const getPopoverLayout = () => {
        const cardWidth = 380;
        const cardHeight = 265;
        const gap = 22;

        if (!rect) {
            return {
                cardStyle: {
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                } as React.CSSProperties,
                arrowDirection: null as 'left' | 'right' | 'top' | 'bottom' | null,
                arrowPos: { x: 0, y: 0 },
            };
        }

        const spaceRight = window.innerWidth - (rect.left + rect.width);
        const spaceLeft = rect.left;
        const spaceBottom = window.innerHeight - (rect.top + rect.height);
        const spaceTop = rect.top;

        let placement = step.preferredPosition || 'bottom';

        // Auto-flip if preferred side lacks room
        if (placement === 'right' && spaceRight < cardWidth + gap) placement = 'bottom';
        if (placement === 'left' && spaceLeft < cardWidth + gap) placement = 'bottom';
        if (placement === 'bottom' && spaceBottom < cardHeight + gap) {
            placement = spaceTop >= cardHeight + gap ? 'top' : 'right';
        }
        if (placement === 'top' && spaceTop < cardHeight + gap) {
            placement = spaceBottom >= cardHeight + gap ? 'bottom' : 'right';
        }

        const clampX = (x: number) => Math.max(16, Math.min(window.innerWidth - cardWidth - 16, x));
        const clampY = (y: number) => Math.max(16, Math.min(window.innerHeight - cardHeight - 16, y));

        if (placement === 'right' && spaceRight >= cardWidth + gap) {
            const top = clampY(rect.top + rect.height / 2 - cardHeight / 2);
            const left = rect.left + rect.width + gap;
            return {
                cardStyle: { top: `${top}px`, left: `${left}px`, width: `${cardWidth}px` },
                arrowDirection: 'left' as const,
                arrowPos: {
                    x: rect.left + rect.width + 4,
                    y: Math.min(rect.top + rect.height - 16, Math.max(rect.top + 16, top + 48)),
                },
            };
        }

        if (placement === 'left' && spaceLeft >= cardWidth + gap) {
            const top = clampY(rect.top + rect.height / 2 - cardHeight / 2);
            const left = rect.left - cardWidth - gap;
            return {
                cardStyle: { top: `${top}px`, left: `${left}px`, width: `${cardWidth}px` },
                arrowDirection: 'right' as const,
                arrowPos: {
                    x: rect.left - 24,
                    y: Math.min(rect.top + rect.height - 16, Math.max(rect.top + 16, top + 48)),
                },
            };
        }

        if (placement === 'top' && spaceTop >= cardHeight + gap) {
            const left = clampX(rect.left + rect.width / 2 - cardWidth / 2);
            const top = rect.top - cardHeight - gap;
            return {
                cardStyle: { top: `${top}px`, left: `${left}px`, width: `${cardWidth}px` },
                arrowDirection: 'bottom' as const,
                arrowPos: {
                    x: Math.min(rect.left + rect.width - 24, Math.max(rect.left + 24, left + cardWidth / 2)),
                    y: rect.top - 22,
                },
            };
        }

        if (spaceBottom >= cardHeight + gap) {
            const left = clampX(rect.left + rect.width / 2 - cardWidth / 2);
            const top = rect.top + rect.height + gap;
            return {
                cardStyle: { top: `${top}px`, left: `${left}px`, width: `${cardWidth}px` },
                arrowDirection: 'top' as const,
                arrowPos: {
                    x: Math.min(rect.left + rect.width - 24, Math.max(rect.left + 24, left + cardWidth / 2)),
                    y: rect.top + rect.height + 4,
                },
            };
        }

        // Fallback for full-screen module containers: dock cleanly at bottom-right with a top pointer
        return {
            cardStyle: {
                bottom: '28px',
                right: '28px',
                width: `${cardWidth}px`,
            } as React.CSSProperties,
            arrowDirection: 'top' as const,
            arrowPos: {
                x: window.innerWidth - cardWidth / 2 - 28,
                y: window.innerHeight - cardHeight - 54,
            },
        };
    };

    const { cardStyle, arrowDirection, arrowPos } = getPopoverLayout();

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-auto select-none overflow-hidden">
            {/* Dark Backdrop when no target rect is found */}
            {!rect && <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" />}

            {/* Spotlight Highlight Cutout Box */}
            {rect && (
                <div
                    style={{
                        position: 'fixed',
                        top: `${rect.top}px`,
                        left: `${rect.left}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`,
                        boxShadow: '0 0 0 9999px rgba(11, 12, 14, 0.72)',
                        zIndex: 9999,
                    }}
                    className="rounded-2xl border-2 border-[#2BB656] ring-4 ring-[#2BB656]/30 transition-all duration-300 ease-out pointer-events-none"
                >
                    {/* Corner Pulse Beacon */}
                    <span className="absolute -top-2 -right-2 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2BB656] opacity-75" />
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-[#2BB656] border-2 border-white" />
                    </span>
                </div>
            )}

            {/* Animated Directional Pointer Arrow */}
            {rect && arrowDirection && (
                <div
                    style={{
                        position: 'fixed',
                        left: `${arrowPos.x}px`,
                        top: `${arrowPos.y}px`,
                        zIndex: 10000,
                    }}
                    className="pointer-events-none text-[#2BB656] drop-shadow-[0_4px_10px_rgba(43,182,86,0.5)] animate-bounce"
                >
                    {arrowDirection === 'left' && (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M21 12H4M4 12L10 6M4 12L10 18"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    )}
                    {arrowDirection === 'right' && (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M3 12H20M20 12L14 6M20 12L14 18"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    )}
                    {arrowDirection === 'top' && (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M12 21V4M12 4L6 10M12 4L18 10"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    )}
                    {arrowDirection === 'bottom' && (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M12 3V20M12 20L6 14M12 20L18 14"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    )}
                </div>
            )}

            {/* Tutorial Floating Card */}
            <div
                style={{
                    position: 'fixed',
                    ...cardStyle,
                    zIndex: 10001,
                }}
                className="bg-[#14181D] text-white border border-[#2BB656]/50 rounded-2xl shadow-2xl p-5 space-y-3.5 transition-all duration-300"
            >
                {/* Top Header */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#2BB656]/20 border border-[#2BB656]/40 text-emerald-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <Compass className="w-3 h-3 text-[#2BB656]" />
                            {step.moduleBadge}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 font-semibold">
                            Step {currentStepIndex + 1} of {totalSteps}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        title="Skip Tutorial (Esc)"
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Step Title & Explanation */}
                <div className="space-y-1.5">
                    <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#2BB656] shrink-0" />
                        <span>{step.title}</span>
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{step.description}</p>
                </div>

                {/* Actionable Pro-Tip Box */}
                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-[#2BB656]/30 text-[11px] text-emerald-200 flex items-start gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#2BB656] shrink-0 mt-0.5" />
                    <span>
                        <strong className="text-white">How to operate:</strong> {step.actionTip}
                    </span>
                </div>

                {/* Step Progress Dots */}
                <div className="flex items-center gap-1 pt-1">
                    {TUTORIAL_STEPS.map((s, idx) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setCurrentStepIndex(idx)}
                            title={s.title}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                idx === currentStepIndex
                                    ? 'w-6 bg-[#2BB656]'
                                    : idx < currentStepIndex
                                        ? 'w-2 bg-emerald-700'
                                        : 'w-2 bg-slate-700 hover:bg-slate-500'
                            }`}
                        />
                    ))}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white font-semibold transition cursor-pointer"
                    >
                        Skip Tutorial
                    </button>

                    <div className="flex items-center gap-2">
                        {currentStepIndex > 0 && (
                            <button
                                type="button"
                                onClick={() => setCurrentStepIndex((prev) => prev - 1)}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1 transition cursor-pointer"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                                Back
                            </button>
                        )}

                        {currentStepIndex < totalSteps - 1 ? (
                            <button
                                type="button"
                                onClick={() => setCurrentStepIndex((prev) => prev + 1)}
                                className="px-4 py-1.5 rounded-xl bg-[#2BB656] hover:bg-emerald-500 text-[#0B0C0E] font-bold flex items-center gap-1 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                            >
                                Next Step
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onComplete}
                                className="px-4 py-1.5 rounded-xl bg-[#2BB656] hover:bg-emerald-500 text-[#0B0C0E] font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Finish Tutorial
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};