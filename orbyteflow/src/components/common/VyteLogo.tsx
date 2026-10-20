// src/components/common/VyteLogo.tsx
import React from 'react';
import startAnimData from '../start_anim.json';

interface VyteLogoProps {
    variant?: 'dark-text' | 'light-text';
    showSubtitle?: boolean;
    iconOnly?: boolean;
    className?: string;
}

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
            <svg viewBox="120 105 250 260" className={className} aria-label="Vyte">
                <path d={glyphs.V_leftLeg.d} fill={primaryInk} />
                <path d={glyphs.V_rightGreenSlash.d} fill={vyteGreen} />
            </svg>
        );
    }

    return (
        <svg
            viewBox={showSubtitle ? '120 105 690 390' : '120 105 690 325'}
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

            {/* Subtitle: INVENTORY MANAGEMENT */}
            {showSubtitle && (
                <text
                    x={subtitle.x}
                    y={subtitle.y}
                    textAnchor="middle"
                    fill={variant === 'light-text' ? '#CBD5E1' : primaryInk}
                    style={{
                        fontSize: `${subtitle.fontSize}px`,
                        fontWeight: 700,
                        letterSpacing: subtitle.letterSpacing,
                        fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
                    }}
                >
                    {subtitle.text}
                </text>
            )}
        </svg>
    );
};