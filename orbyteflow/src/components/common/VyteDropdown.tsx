// src/components/common/VyteDropdown.tsx
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface VyteDropdownOption<T extends string | number = string> {
    label: string;
    value: T;
    badge?: string;
}

export interface VyteDropdownProps<T extends string | number = string> {
    value: T;
    options: VyteDropdownOption<T>[];
    onChange: (value: T) => void;
    prefix?: string;
    icon?: React.ReactNode;
    variant?: 'light' | 'soft' | 'dark' | 'purple';
    size?: 'sm' | 'md';
    className?: string;
    disabled?: boolean;
}

export function VyteDropdown<T extends string | number = string>({
                                                                     value,
                                                                     options,
                                                                     onChange,
                                                                     prefix,
                                                                     icon,
                                                                     variant = 'light',
                                                                     size = 'md',
                                                                     className = '',
                                                                     disabled = false,
                                                                 }: VyteDropdownProps<T>) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});
    const [openUpward, setOpenUpward] = useState(false);

    const selectedOption = options.find((opt) => opt.value === value) || options[0];

    // Compute dynamic coordinates so the menu overlays over tables and scroll containers
    const updatePosition = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const estimatedMenuHeight = 224; // max-h-56

        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldOpenUp = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;

        setOpenUpward(shouldOpenUp);
        setMenuPosition({
            position: 'fixed',
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            top: shouldOpenUp ? undefined : `${rect.bottom - 1}px`,
            bottom: shouldOpenUp ? `${window.innerHeight - rect.top - 1}px` : undefined,
            zIndex: 99999,
        });
    };

    useEffect(() => {
        if (!isOpen) return;

        updatePosition();

        const handleScrollOrResize = () => {
            updatePosition();
        };

        window.addEventListener('resize', handleScrollOrResize);
        window.addEventListener('scroll', handleScrollOrResize, true);

        return () => {
            window.removeEventListener('resize', handleScrollOrResize);
            window.removeEventListener('scroll', handleScrollOrResize, true);
        };
    }, [isOpen]);

    // Close on click outside (checking both trigger button and portaled menu)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const clickedInsideTrigger = containerRef.current?.contains(target);
            const clickedInsideMenu = menuRef.current?.contains(target);

            if (!clickedInsideTrigger && !clickedInsideMenu) {
                setIsOpen(false);
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const sizeStyles =
        size === 'sm'
            ? 'px-2.5 py-1.5 text-xs rounded-lg'
            : 'px-3.5 py-2 text-xs rounded-xl';

    const openTopRadius =
        size === 'sm' ? 'rounded-t-lg rounded-b-none' : 'rounded-t-xl rounded-b-none';
    const openBottomRadius =
        size === 'sm' ? 'rounded-b-lg rounded-t-none' : 'rounded-b-xl rounded-t-none';

    const getTriggerTheme = () => {
        if (variant === 'dark') {
            return isOpen
                ? 'bg-[#1E242B] border-[#2BB656] text-emerald-400 border-b-transparent shadow-lg'
                : 'bg-[#1E242B] border-slate-700/80 hover:border-[#2BB656]/60 text-emerald-400';
        }
        if (variant === 'purple') {
            return isOpen
                ? 'bg-white border-purple-400 text-purple-900 border-b-transparent shadow-md'
                : 'bg-purple-50/80 border-purple-200 hover:border-purple-300 text-purple-800';
        }
        if (variant === 'soft') {
            return isOpen
                ? 'bg-white border-[#2BB656] text-slate-900 border-b-transparent shadow-md'
                : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800';
        }
        return isOpen
            ? 'bg-white border-[#2BB656] text-slate-900 border-b-transparent shadow-md'
            : 'bg-white border-slate-300 hover:border-slate-400 text-slate-900';
    };

    const getMenuTheme = () => {
        if (variant === 'dark') {
            return 'bg-[#1E242B] border-[#2BB656] text-slate-200 divide-slate-800/80 shadow-2xl';
        }
        if (variant === 'purple') {
            return 'bg-white border-purple-400 text-slate-800 divide-purple-100 shadow-2xl';
        }
        return 'bg-white border-[#2BB656] text-slate-800 divide-slate-100 shadow-2xl';
    };

    const getOptionTheme = (isSelected: boolean) => {
        if (variant === 'dark') {
            return isSelected
                ? 'bg-[#2BB656]/20 text-emerald-400 font-bold'
                : 'text-slate-200 hover:bg-slate-800/90 hover:text-white font-medium';
        }
        if (variant === 'purple') {
            return isSelected
                ? 'bg-purple-50 text-purple-900 font-bold'
                : 'text-slate-700 hover:bg-purple-50/50 hover:text-purple-900 font-medium';
        }
        return isSelected
            ? 'bg-[#EBFDF2] text-emerald-900 font-bold'
            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium';
    };

    return (
        <div ref={containerRef} className={`relative select-none ${className}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (!isOpen) updatePosition();
                    setIsOpen((prev) => !prev);
                }}
                className={`w-full flex items-center justify-between gap-2 border font-semibold transition-colors cursor-pointer focus:outline-none ${sizeStyles} ${
                    isOpen ? (openUpward ? openBottomRadius : openTopRadius) : ''
                } ${getTriggerTheme()} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                    {icon && <span className="shrink-0">{icon}</span>}
                    {prefix && (
                        <span
                            className={`font-semibold shrink-0 ${
                                variant === 'dark' ? 'text-slate-400' : 'text-slate-500'
                            }`}
                        >
                            {prefix}
                        </span>
                    )}
                    <span className="truncate font-bold">{selectedOption?.label}</span>
                </span>
                <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                    } ${
                        variant === 'dark'
                            ? 'text-emerald-400'
                            : variant === 'purple'
                                ? 'text-purple-600'
                                : 'text-slate-400'
                    }`}
                />
            </button>

            {/* Render options menu in document.body to break free from table overflow boundaries */}
            {isOpen &&
                createPortal(
                    <div
                        ref={menuRef}
                        style={menuPosition}
                        className={`border overflow-hidden ${
                            openUpward
                                ? size === 'sm'
                                    ? 'rounded-t-lg border-b-0'
                                    : 'rounded-t-xl border-b-0'
                                : openBottomRadius
                        } ${getMenuTheme()}`}
                    >
                        <div
                            className={`border-t ${
                                variant === 'dark'
                                    ? 'border-slate-700/70'
                                    : variant === 'purple'
                                        ? 'border-purple-100'
                                        : 'border-slate-100'
                            }`}
                        />
                        <div className="max-h-56 overflow-y-auto py-1">
                            {options.map((opt) => {
                                const isSelected = opt.value === value;
                                return (
                                    <button
                                        key={String(opt.value)}
                                        type="button"
                                        onClick={() => {
                                            onChange(opt.value);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${getOptionTheme(
                                            isSelected
                                        )}`}
                                    >
                                        <span className="truncate">{opt.label}</span>
                                        {isSelected && (
                                            <Check
                                                className={`w-3.5 h-3.5 shrink-0 ${
                                                    variant === 'dark'
                                                        ? 'text-emerald-400'
                                                        : variant === 'purple'
                                                            ? 'text-purple-600'
                                                            : 'text-[#2BB656]'
                                                }`}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}