// src/components/LoadingScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import startAnimData from './start_anim.json';

export interface LoadingScreenProps {
    isOpen?: boolean;
    message?: string;
    onClose?: () => void;
}

interface StreamParticle {
    id: number;
    x: number;
    y: number;
    length: number;
    size: number;
    speed: number;
    color: string;
    opacity: number;
    type: 'streak' | 'dot' | 'ground';
}

const INITIAL_PARTICLES: StreamParticle[] = [
    { id: 1, x: 820, y: 135, length: 65, size: 4, speed: 9.5, color: '#2BB656', opacity: 0.45, type: 'streak' },
    { id: 2, x: 610, y: 175, length: 42, size: 3, speed: 7.2, color: '#0B0C0E', opacity: 0.18, type: 'streak' },
    { id: 3, x: 860, y: 215, length: 80, size: 5, speed: 11.4, color: '#2BB656', opacity: 0.55, type: 'streak' },
    { id: 4, x: 440, y: 145, length: 0, size: 6, speed: 6.5, color: '#2BB656', opacity: 0.4, type: 'dot' },
    { id: 5, x: 760, y: 285, length: 55, size: 3.5, speed: 10.2, color: '#0B0C0E', opacity: 0.22, type: 'streak' },
    { id: 6, x: 310, y: 240, length: 0, size: 5, speed: 8.4, color: '#0B0C0E', opacity: 0.25, type: 'dot' },
    { id: 7, x: 840, y: 340, length: 72, size: 4, speed: 12.0, color: '#2BB656', opacity: 0.6, type: 'streak' },
    { id: 8, x: 530, y: 315, length: 0, size: 7, speed: 9.8, color: '#2BB656', opacity: 0.5, type: 'dot' },
    { id: 9, x: 680, y: 115, length: 0, size: 4.5, speed: 5.8, color: '#0B0C0E', opacity: 0.2, type: 'dot' },
    { id: 10, x: 220, y: 195, length: 48, size: 3, speed: 8.9, color: '#2BB656', opacity: 0.35, type: 'streak' },
    { id: 11, x: 850, y: 390, length: 58, size: 4, speed: 12.8, color: '#0B0C0E', opacity: 0.28, type: 'streak' },
    { id: 12, x: 410, y: 375, length: 0, size: 5.5, speed: 10.6, color: '#2BB656', opacity: 0.65, type: 'dot' },
    // Ground tread dashes aligned symmetrically under V's feet & cart wheels (x = 115..860, center = 488.5)
    { id: 13, x: 140, y: 466, length: 36, size: 4, speed: 11.5, color: '#CBD5E1', opacity: 0.85, type: 'ground' },
    { id: 14, x: 280, y: 466, length: 48, size: 4, speed: 11.5, color: '#94A3B8', opacity: 0.75, type: 'ground' },
    { id: 15, x: 430, y: 466, length: 32, size: 4, speed: 11.5, color: '#2BB656', opacity: 0.65, type: 'ground' },
    { id: 16, x: 580, y: 466, length: 52, size: 4, speed: 11.5, color: '#CBD5E1', opacity: 0.85, type: 'ground' },
    { id: 17, x: 720, y: 466, length: 40, size: 4, speed: 11.5, color: '#94A3B8', opacity: 0.75, type: 'ground' },
    { id: 18, x: 830, y: 466, length: 38, size: 4, speed: 11.5, color: '#2BB656', opacity: 0.6, type: 'ground' },
];

/** @Composable */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({
                                                                isOpen = true,
                                                                message = 'Syncing Vyte Inventory Engine...',
                                                                onClose,
                                                            }) => {
    const [elapsedMs, setElapsedMs] = useState<number>(0);
    const rafRef = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);

    const { colors } = startAnimData.designTokens;
    const { glyphs } = startAnimData.logoGeometry;

    useEffect(() => {
        if (!isOpen) {
            setElapsedMs(0);
            startTimeRef.current = null;
            return;
        }

        const tick = (timestamp: number) => {
            if (startTimeRef.current === null) startTimeRef.current = timestamp;
            setElapsedMs(timestamp - startTimeRef.current);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    // 0 -> 1 growth factor over first 420ms as 'V' sprouts stick-figure legs & arms
    const sproutProgress = Math.min(1, elapsedMs / 420);
    const sproutEase = 1 - Math.pow(1 - sproutProgress, 3);

    // Continuous walking cycle phase
    const walkTime = Math.max(0, elapsedMs - 250) / 1000;
    const walkPhase = walkTime * 9.2;

    // Subtle vertical bobbing of V and cart suspension
    const vBobY = sproutEase * Math.abs(Math.sin(walkPhase)) * -6;
    const vLeanDeg = sproutEase * (4.5 + Math.sin(walkPhase * 2) * 1.2);
    const cartBounceY = sproutEase * Math.sin(walkPhase * 2 - 0.7) * 2.2;
    const wheelRotation = (walkTime * 340) % 360;

    // Hip attachment point at bottom vertex of 'V'
    const hipX = 238;
    const hipY = 342 + vBobY;

    const computeLegJoints = (phaseOffset: number) => {
        const phase = walkPhase + phaseOffset;
        const thighLen = 56 * sproutEase;
        const shinLen = 54 * sproutEase;
        const footLen = 20 * sproutEase;

        const thighAngle = Math.sin(phase) * 0.52 + 0.08;
        const kneeBend = Math.max(0, -Math.cos(phase + 0.35)) * 0.85;
        const shinAngle = thighAngle - kneeBend;

        const kneeX = hipX + Math.sin(thighAngle) * thighLen;
        const kneeY = hipY + Math.cos(thighAngle) * thighLen;

        const ankleX = kneeX + Math.sin(shinAngle) * shinLen;
        const ankleY = kneeY + Math.cos(shinAngle) * shinLen;

        const footAngle = shinAngle + 1.45;
        const toeX = ankleX + Math.sin(footAngle) * footLen;
        const toeY = ankleY + Math.cos(footAngle) * footLen;

        return { kneeX, kneeY, ankleX, ankleY, toeX, toeY };
    };

    const backLeg = computeLegJoints(Math.PI);
    const frontLeg = computeLegJoints(0);

    // Shoulder attachment on V's green right slash reaching to push the cart handlebar
    const shoulderX = 296;
    const shoulderY = 248 + vBobY;
    const handleGripX = 334;
    const handleGripY = 262 + cartBounceY;
    const elbowX = (shoulderX + handleGripX) / 2 - 6 * sproutEase;
    const elbowY = (shoulderY + handleGripY) / 2 + 18 * sproutEase;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100dvh',
                zIndex: 9998,
                display: 'grid',
                placeItems: 'center',
                backgroundColor: colors.surfaceOffWhite,
                fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
                userSelect: 'none',
                overflow: 'hidden',
            }}
        >
            {/* Ambient Radial Glow (15% smaller: 525px vs 620px) */}
            <div
                style={{
                    position: 'absolute',
                    width: 'min(70vw, 525px)',
                    height: 'min(70vw, 525px)',
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${colors.vyteGreenGlow} 0%, rgba(246,247,244,0) 70%)`,
                    pointerEvents: 'none',
                }}
            />

            {/* Centered Content Wrapper (Scaled down by 15% from original dimensions) */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    maxWidth: '646px', // 760px * 0.85 = 646px (15% smaller)
                    padding: '0 20px',
                    zIndex: 10,
                }}
            >
                {/* viewBox="88.5 73 800 440" places exact center at X=488.5 (midpoint of 135..842) and Y=293 (midpoint of 120..466) */}
                <svg
                    viewBox="88.5 73 800 440"
                    preserveAspectRatio="xMidYMid meet"
                    style={{
                        width: 'min(78vw, 646px)',
                        maxHeight: '62dvh',
                        height: 'auto',
                        display: 'block',
                        margin: '0 auto',
                        overflow: 'visible',
                    }}
                    aria-label="Vyte Loading Animation"
                >
                    <defs>
                        <filter id="vyte-cart-shadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#0B0C0E" floodOpacity="0.10" />
                        </filter>
                    </defs>

                    {/* 1. STREAMING PARTICLES & SPEED LINES (Centered across x=115..862, midpoint 488.5) */}
                    <g style={{ pointerEvents: 'none' }}>
                        <line
                            x1={115}
                            y1={466}
                            x2={862}
                            y2={466}
                            stroke="#E2E8F0"
                            strokeWidth={3}
                            strokeLinecap="round"
                        />

                        {INITIAL_PARTICLES.map((p) => {
                            const span = 740;
                            const rawX = ((p.x - (elapsedMs * p.speed) / 16) % span + span) % span + 115;

                            if (p.type === 'dot') {
                                return (
                                    <circle
                                        key={p.id}
                                        cx={rawX}
                                        cy={p.y + Math.sin(elapsedMs / 240 + p.id) * 4}
                                        r={p.size}
                                        fill={p.color}
                                        opacity={p.opacity * sproutEase}
                                    />
                                );
                            }

                            return (
                                <line
                                    key={p.id}
                                    x1={rawX}
                                    y1={p.y}
                                    x2={rawX + p.length}
                                    y2={p.y}
                                    stroke={p.color}
                                    strokeWidth={p.size}
                                    strokeLinecap="round"
                                    opacity={p.opacity * sproutEase}
                                />
                            );
                        })}
                    </g>

                    {/* 2. BACK STICK-FIGURE LEG & BACK ARM */}
                    {sproutEase > 0.02 && (
                        <g
                            stroke="#334155"
                            strokeWidth={10}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                        >
                            <path
                                d={`M ${hipX - 6} ${hipY} L ${backLeg.kneeX} ${backLeg.kneeY} L ${backLeg.ankleX} ${backLeg.ankleY} L ${backLeg.toeX} ${backLeg.toeY}`}
                            />
                            <path
                                d={`M ${shoulderX - 8} ${shoulderY - 10} L ${elbowX - 4} ${elbowY - 10} L ${handleGripX} ${handleGripY - 12}`}
                                strokeWidth={8}
                            />
                        </g>
                    )}

                    {/* 3. ROLLING CART CARRYING "yte" */}
                    <g
                        filter="url(#vyte-cart-shadow)"
                        style={{
                            transform: `translate(22px, ${cartBounceY}px)`,
                        }}
                    >
                        <path
                            d="M 342 418 L 342 252 Q 342 238 326 238 L 312 238"
                            fill="none"
                            stroke={colors.inkBlack}
                            strokeWidth={11}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={sproutEase}
                        />
                        <circle
                            cx={312}
                            cy={238}
                            r={8}
                            fill={colors.vyteGreen}
                            opacity={sproutEase}
                        />

                        <g opacity={sproutEase}>
                            <rect
                                x={330}
                                y={414}
                                width={490}
                                height={20}
                                rx={10}
                                fill={colors.inkBlack}
                            />
                            <rect
                                x={344}
                                y={420}
                                width={462}
                                height={6}
                                rx={3}
                                fill={colors.vyteGreen}
                            />
                            <rect
                                x={804}
                                y={392}
                                width={12}
                                height={30}
                                rx={5}
                                fill={colors.inkBlack}
                            />
                        </g>

                        {/* "yte" Glyphs Sitting on the Cart */}
                        <g style={{ transform: 'translate(14px, -6px)' }}>
                            <path d={glyphs.y_leftFork.d} fill={glyphs.y_leftFork.fill} />
                            <path d={glyphs.y_descender.d} fill={glyphs.y_descender.fill} />
                            <circle
                                cx={glyphs.y_topGreenDot.cx}
                                cy={glyphs.y_topGreenDot.cy}
                                r={glyphs.y_topGreenDot.r}
                                fill={glyphs.y_topGreenDot.fill}
                            />
                            <circle
                                cx={glyphs.y_bottomGreenDot.cx}
                                cy={glyphs.y_bottomGreenDot.cy}
                                r={glyphs.y_bottomGreenDot.r}
                                fill={glyphs.y_bottomGreenDot.fill}
                            />
                            <path d={glyphs.t_body.d} fill={glyphs.t_body.fill} />
                            <path
                                d={glyphs.e_body.d}
                                fill={glyphs.e_body.fill}
                                fillRule="evenodd"
                            />
                        </g>

                        {[425, 735].map((wheelCx) => (
                            <g
                                key={wheelCx}
                                transform={`translate(${wheelCx}, 444) rotate(${wheelRotation})`}
                                opacity={sproutEase}
                            >
                                <circle cx={0} cy={0} r={20} fill={colors.inkBlack} />
                                <circle cx={0} cy={0} r={13} fill="#F8FAF7" />
                                <line x1={-12} y1={0} x2={12} y2={0} stroke={colors.inkBlack} strokeWidth={3.5} />
                                <line x1={0} y1={-12} x2={0} y2={12} stroke={colors.inkBlack} strokeWidth={3.5} />
                                <circle cx={0} cy={0} r={5.5} fill={colors.vyteGreen} />
                            </g>
                        ))}
                    </g>

                    {/* 4. THE "V" CHARACTER + FRONT STICK-FIGURE LEG & ARM */}
                    <g>
                        {sproutEase > 0.02 && (
                            <g
                                stroke={colors.inkBlack}
                                strokeWidth={11}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            >
                                <path
                                    d={`M ${hipX} ${hipY} L ${frontLeg.kneeX} ${frontLeg.kneeY} L ${frontLeg.ankleX} ${frontLeg.ankleY} L ${frontLeg.toeX} ${frontLeg.toeY}`}
                                />
                                <circle
                                    cx={frontLeg.kneeX}
                                    cy={frontLeg.kneeY}
                                    r={5}
                                    fill={colors.vyteGreen}
                                    stroke="none"
                                />
                            </g>
                        )}

                        <g
                            style={{
                                transformOrigin: '238px 340px',
                                transform: `translate(0px, ${vBobY}px) rotate(${vLeanDeg}deg)`,
                            }}
                        >
                            <path d={glyphs.V_leftLeg.d} fill={glyphs.V_leftLeg.fill} />
                            <path d={glyphs.V_rightGreenSlash.d} fill={glyphs.V_rightGreenSlash.fill} />
                        </g>

                        {sproutEase > 0.02 && (
                            <g
                                stroke={colors.inkBlack}
                                strokeWidth={9.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            >
                                <path
                                    d={`M ${shoulderX} ${shoulderY} L ${elbowX} ${elbowY} L ${handleGripX} ${handleGripY}`}
                                />
                                <circle
                                    cx={handleGripX}
                                    cy={handleGripY}
                                    r={6}
                                    fill={colors.vyteGreen}
                                    stroke="none"
                                />
                            </g>
                        )}
                    </g>
                </svg>

                {/* Compact Status Pill (Scaled down 15%) */}
                <div className="mt-1.5 flex flex-col items-center gap-2">
                    {message && (
                        <div className="px-3.5 py-1 rounded-full bg-white/90 border border-slate-200 shadow-xs flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2BB656] animate-ping" />
                            <span className="text-[11px] font-bold text-slate-700 tracking-wide">
                                {message}
                            </span>
                        </div>
                    )}

                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-emerald-600 text-white text-[10px] font-bold transition cursor-pointer shadow-xs"
                        >
                            Dismiss
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen;