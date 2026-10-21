// src/components/common/VyteLogo.tsx
import React from 'react';
import startAnimData from '../start_anim.json';

interface VyteLogoProps {
    variant?: 'dark-text' | 'light-text';
    showSubtitle?: boolean;
    iconOnly?: boolean;
    className?: string;
}

/** @Composable */
export const VyteLogo: React.FC<VyteLogoProps> = ({
                                                      variant = 'dark-text',
                                                      showSubtitle = true,
                                                      iconOnly = false,
                                                      className = 'h-10 w-auto',
                                                  }) => {
    const { glyphs, subtitle } = startAnimData.logoGeometry;
    const primaryInk = variant === 'light-text' ? '#FFFFFF' : '#0B0C0E';
    const vyteGreen = '#2BB656';

    if (iconOnly) {
        return (
            <svg viewBox="115 100 260 270" className={className} aria-label="Vyte">
                <path d={glyphs.V_leftLeg.d} fill={primaryInk} />
                <path d={glyphs.V_rightGreenSlash.d} fill={vyteGreen} />
            </svg>
        );
    }

    return (
        <svg
            viewBox={showSubtitle ? '85 75 760 440' : '85 95 760 345'}
            preserveAspectRatio="xMidYMid meet"
            className={className}
            aria-label="Vyte Inventory Management"
        >
            {/* V */}
            <path d={glyphs.V_leftLeg.d} fill={primaryInk} />
            <path d={glyphs.V_rightGreenSlash.d} fill={vyteGreen} />

            {/* y */}
            <path d={glyphs.y_leftFork.d} fill={primaryInk} />
            <path d={glyphs.y_descender.d} fill={primaryInk} />
            <circle
                cx={glyphs.y_topGreenDot.cx}
                cy={glyphs.y_topGreenDot.cy}
                r={glyphs.y_topGreenDot.r}
                fill={vyteGreen}
            />
            <circle
                cx={glyphs.y_bottomGreenDot.cx}
                cy={glyphs.y_bottomGreenDot.cy}
                r={glyphs.y_bottomGreenDot.r}
                fill={vyteGreen}
            />

            {/* t */}
            <path d={glyphs.t_body.d} fill={primaryInk} />

            {/* e */}
            <path d={glyphs.e_body.d} fill={primaryInk} fillRule="evenodd" />

            {/* Subtitle: INVENTORY MANAGEMENT (Locked to Image 2 proportions) */}
            {showSubtitle && (
                <text
                    x={466}
                    y={472}
                    textAnchor="middle"
                    textLength={546}
                    lengthAdjust="spacing"
                    fill={variant === 'light-text' ? '#CBD5E1' : primaryInk}
                    fontSize={31}
                    fontWeight={700}
                    fontFamily='"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
                >
                    {subtitle.text}
                </text>
            )}
        </svg>
    );
};