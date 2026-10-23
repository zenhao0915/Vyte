// src/components/SplashScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import startAnimData from './start_anim.json';

export interface SplashScreenProps {
    onComplete?: () => void;
    animationData?: typeof startAnimData;
    autoDismiss?: boolean;
}

function springPhysics(t: number, damping = 5.5, frequency = 11.5): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const decay = Math.exp(-damping * t);
    return 1 - decay * (Math.cos(frequency * t) + (damping / frequency) * Math.sin(frequency * t));
}

function progressBetween(elapsed: number, startMs: number, durationMs: number): number {
    return Math.min(1, Math.max(0, (elapsed - startMs) / durationMs));
}

interface MiniParcel {
    id: string;
    shelf: number;
    x: number;
    y: number;
    w: number;
    h: number;
    tone: 'kraft' | 'dark' | 'green';
    delayMs: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
                                                              onComplete,
                                                              animationData = startAnimData,
                                                              autoDismiss = true,
                                                          }) => {
    const [elapsedMs, setElapsedMs] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isExiting, setIsExiting] = useState<boolean>(false);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);

    const totalDuration = 3400;
    const { colors } = animationData.designTokens;
    const { glyphs, subtitle } = animationData.logoGeometry;

    const tMorph = springPhysics(progressBetween(elapsedMs, 500, 600), 6.2, 10.5);
    const tPackCompress = springPhysics(progressBetween(elapsedMs, 1350, 500), 5.8, 11.0);
    const tCartonRise = springPhysics(progressBetween(elapsedMs, 1400, 540), 5.2, 12.0);
    const tFlapsClose = springPhysics(progressBetween(elapsedMs, 1650, 400), 5.0, 13.0);
    const tTapeSeal = springPhysics(progressBetween(elapsedMs, 1850, 300), 6.5, 11.0);

    const shipRaw = progressBetween(elapsedMs, 2100, 520);
    const shipAnticipation = shipRaw > 0 && shipRaw < 0.22 ? -Math.sin((shipRaw / 0.22) * Math.PI) * 28 : 0;
    const shipLaunch = shipRaw >= 0.18 ? Math.pow((shipRaw - 0.18) / 0.82, 2.3) * 1180 : 0;
    const shipTranslateX = shipAnticipation + shipLaunch;
    const shipScaleX = shipRaw > 0.2 ? 1 + Math.min(0.18, (shipRaw - 0.2) * 0.35) : 1 - Math.max(0, shipRaw * 0.25);
    const shipScaleY = shipRaw > 0.2 ? 1 - Math.min(0.12, (shipRaw - 0.2) * 0.22) : 1 + Math.max(0, shipRaw * 0.2);

    const miniParcels: MiniParcel[] = [
        { id: 'p0', shelf: 0, x: 314, y: 120, w: 50, h: 32, tone: 'kraft', delayMs: 650 },
        { id: 'p1', shelf: 0, x: 372, y: 116, w: 56, h: 36, tone: 'green', delayMs: 710 },
        { id: 'p2', shelf: 0, x: 436, y: 122, w: 48, h: 30, tone: 'dark', delayMs: 770 },
        { id: 'p3', shelf: 1, x: 316, y: 192, w: 58, h: 34, tone: 'dark', delayMs: 730 },
        { id: 'p4', shelf: 1, x: 382, y: 190, w: 48, h: 36, tone: 'kraft', delayMs: 790 },
        { id: 'p5', shelf: 1, x: 438, y: 194, w: 46, h: 32, tone: 'green', delayMs: 850 },
        { id: 'p6', shelf: 2, x: 314, y: 264, w: 52, h: 34, tone: 'green', delayMs: 810 },
        { id: 'p7', shelf: 2, x: 374, y: 262, w: 60, h: 36, tone: 'kraft', delayMs: 870 },
        { id: 'p8', shelf: 2, x: 442, y: 266, w: 44, h: 32, tone: 'dark', delayMs: 930 },
    ];

    useEffect(() => {
        if (!isPlaying) {
            lastTimeRef.current = null;
            return;
        }

        const tick = (timestamp: number) => {
            if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
            const delta = Math.min(32, timestamp - lastTimeRef.current);
            lastTimeRef.current = timestamp;

            setElapsedMs((prev) => {
                const next = prev + delta;
                if (next >= totalDuration) {
                    setIsPlaying(false);
                    if (autoDismiss) {
                        setTimeout(() => setIsExiting(true), 150);
                        setTimeout(() => onComplete?.(), 580);
                    }
                    return totalDuration;
                }
                return next;
            });

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying, totalDuration, autoDismiss, onComplete]);

    const getGlyphSpring = (delayOffsetMs: number) => {
        const raw = progressBetween(elapsedMs, 2240 + delayOffsetMs, 760);
        const s = springPhysics(raw, 5.2, 11.5);
        return {
            translateX: -420 * (1 - s),
            translateY: 24 * (1 - s),
            scale: 0.82 + 0.18 * s,
            opacity: Math.min(1, raw * 3.8),
        };
    };

    const vSpring = getGlyphSpring(0);
    const ySpring = getGlyphSpring(70);
    const tSpring = getGlyphSpring(140);
    const eSpring = getGlyphSpring(210);
    const subSpring = getGlyphSpring(310);

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100dvh',
                zIndex: 9999,
                display: 'grid',
                placeItems: 'center',
                backgroundColor: colors.surfaceOffWhite,
                opacity: isExiting ? 0 : 1,
                pointerEvents: isExiting ? 'none' : 'auto',
                transition: 'opacity 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
                userSelect: 'none',
                overflow: 'hidden',
            }}
        >
            {/* Ambient Radial Glow (Centered dynamically in viewport) */}
            <div
                style={{
                    position: 'absolute',
                    width: 'min(80vw, 640px)',
                    height: 'min(80vw, 640px)',
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${colors.vyteGreenGlow} 0%, rgba(246,247,244,0) 70%)`,
                    transform: `scale(${0.85 + 0.35 * tCartonRise})`,
                    opacity: elapsedMs > 2200 ? 0.95 : 0.55,
                    transition: 'opacity 400ms ease',
                    pointerEvents: 'none',
                }}
            />

            <svg
                viewBox={animationData.logoGeometry.viewBox}
                preserveAspectRatio="xMidYMid meet"
                style={{
                    width: 'min(88vw, 740px)',
                    maxHeight: '82dvh',
                    height: 'auto',
                    display: 'block',
                    margin: '0 auto',
                    overflow: 'visible',
                }}
            >
                <defs>
                    <filter id="vyte-elevated-shadow" x="-25%" y="-25%" width="150%" height="150%">
                        <feDropShadow dx="0" dy="16" stdDeviation="16" floodColor="#0B0C0E" floodOpacity="0.11" />
                    </filter>
                    <linearGradient id="kraft-box-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#DFA366" />
                        <stop offset="100%" stopColor="#C48345" />
                    </linearGradient>
                    <linearGradient id="kraft-flap-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ECCFA9" />
                        <stop offset="100%" stopColor="#D49658" />
                    </linearGradient>
                </defs>

                {/* ACT 1 - 3: DATABASE -> LOGISTICS DRAWER -> BOXED UP & SHIPPED */}
                {shipRaw < 0.98 && (
                    <g
                        style={{
                            transformOrigin: '400px 235px',
                            transform: `translate(${shipTranslateX}px, 0px) scale(${shipScaleX}, ${shipScaleY})`,
                            opacity: shipRaw > 0.82 ? Math.max(0, 1 - (shipRaw - 0.82) * 5.5) : 1,
                        }}
                    >
                        {/* 1. DATABASE / LOGISTICS DRAWER UNIT */}
                        <g
                            filter="url(#vyte-elevated-shadow)"
                            style={{
                                transformOrigin: '400px 250px',
                                transform: `translateY(${tPackCompress * 34}px) scale(${1 - tPackCompress * 0.22})`,
                                opacity: 1 - Math.max(0, (tFlapsClose - 0.45) * 1.9),
                            }}
                        >
                            <g
                                style={{
                                    transformOrigin: '400px 215px',
                                    transform: `scale(${0.84 + 0.16 * tMorph})`,
                                    opacity: Math.min(1, tMorph * 1.4),
                                }}
                            >
                                <rect x={274} y={84} width={252} height={260} rx={24} fill={colors.inkBlack} />
                                <rect x={284} y={94} width={232} height={240} rx={18} fill="#F8FAF7" />
                                <rect x={294} y={104} width={6} height={220} rx={3} fill="#E2E5DF" />
                                <rect x={500} y={104} width={6} height={220} rx={3} fill="#E2E5DF" />
                            </g>

                            {[0, 1, 2].map((tierIdx) => {
                                const tierY = 104 + tierIdx * 72;
                                const dbEnter = springPhysics(progressBetween(elapsedMs, tierIdx * 90, 500), 4.8, 12.0);
                                const dbScale = 0.7 + 0.3 * dbEnter;
                                const dbTranslateY = (1 - dbEnter) * -45;

                                return (
                                    <g
                                        key={`db-tier-${tierIdx}`}
                                        style={{
                                            transformOrigin: `400px ${tierY + 28}px`,
                                            transform: `translateY(${dbTranslateY}px) scale(${dbScale})`,
                                            opacity: Math.min(1, dbEnter * 2.5),
                                        }}
                                    >
                                        <rect
                                            x={300 - (1 - tMorph) * 10}
                                            y={tierY}
                                            width={200 + (1 - tMorph) * 20}
                                            height={56}
                                            rx={tMorph > 0.5 ? 12 : 26}
                                            fill={tMorph > 0.5 ? '#E7ECE4' : colors.inkBlack}
                                        />

                                        <ellipse
                                            cx={400}
                                            cy={tierY + 13}
                                            rx={106}
                                            ry={12}
                                            fill="#1F242D"
                                            style={{ opacity: Math.max(0, 1 - tMorph * 1.35) }}
                                        />

                                        <g style={{ opacity: Math.max(0, 1 - tMorph * 1.5) }}>
                                            <circle cx={324} cy={tierY + 34} r={6} fill={colors.vyteGreen} />
                                            <rect x={340} y={tierY + 31} width={75} height={6} rx={3} fill="#2E3540" />
                                            <rect x={425} y={tierY + 31} width={42} height={6} rx={3} fill={colors.vyteGreen} opacity={0.65} />
                                        </g>

                                        {miniParcels
                                            .filter((p) => p.shelf === tierIdx)
                                            .map((parcel) => {
                                                const pRaw = progressBetween(elapsedMs, parcel.delayMs, 450);
                                                const pSpring = springPhysics(pRaw, 4.4, 13.5);
                                                const fillMap = {
                                                    kraft: '#D49658',
                                                    dark: colors.inkBlack,
                                                    green: colors.vyteGreen,
                                                };
                                                return (
                                                    <g
                                                        key={parcel.id}
                                                        style={{
                                                            transformOrigin: `${parcel.x + parcel.w / 2}px ${parcel.y + parcel.h}px`,
                                                            transform: `translateY(${(1 - pSpring) * -26}px) scale(${0.3 + 0.7 * pSpring})`,
                                                            opacity: Math.min(1, pRaw * 4),
                                                        }}
                                                    >
                                                        <rect
                                                            x={parcel.x}
                                                            y={parcel.y}
                                                            width={parcel.w}
                                                            height={parcel.h}
                                                            rx={6}
                                                            fill={fillMap[parcel.tone]}
                                                        />
                                                        <rect
                                                            x={parcel.x + parcel.w / 2 - 4}
                                                            y={parcel.y}
                                                            width={8}
                                                            height={parcel.h * 0.45}
                                                            rx={1.5}
                                                            fill={parcel.tone === 'green' ? '#FFFFFF' : colors.vyteGreen}
                                                            opacity={0.9}
                                                        />
                                                        <rect
                                                            x={parcel.x + 6}
                                                            y={parcel.y + parcel.h - 11}
                                                            width={16}
                                                            height={6}
                                                            rx={1.5}
                                                            fill="#FFFFFF"
                                                            opacity={0.85}
                                                        />
                                                    </g>
                                                );
                                            })}

                                        <g style={{ opacity: Math.min(1, tMorph * 1.5) }}>
                                            <rect x={300} y={tierY + 38} width={200} height={20} rx={8} fill="#CFD6C9" />
                                            <rect
                                                x={380}
                                                y={tierY + 45}
                                                width={40}
                                                height={6}
                                                rx={3}
                                                fill={tierIdx === 1 ? colors.vyteGreen : colors.inkBlack}
                                            />
                                        </g>
                                    </g>
                                );
                            })}
                        </g>

                        {/* 2. MASTER CORRUGATED LOGISTICS CARTON */}
                        {elapsedMs >= 1350 && (
                            <g
                                filter="url(#vyte-elevated-shadow)"
                                style={{
                                    transformOrigin: '400px 270px',
                                    transform: `translateY(${(1 - tCartonRise) * 140}px) scale(${0.86 + 0.14 * tCartonRise})`,
                                    opacity: Math.min(1, progressBetween(elapsedMs, 1350, 200) * 2),
                                }}
                            >
                                <g
                                    style={{
                                        transformOrigin: '400px 168px',
                                        transform: `scaleY(${1 - tFlapsClose * 0.88})`,
                                        opacity: 1 - tFlapsClose * 0.6,
                                    }}
                                >
                                    <polygon points="264,168 310,124 398,124 398,168" fill="url(#kraft-flap-grad)" />
                                    <polygon points="536,168 490,124 402,124 402,168" fill="url(#kraft-flap-grad)" />
                                </g>

                                <rect x={264} y={166} width={272} height={186} rx={20} fill="url(#kraft-box-grad)" />

                                <path
                                    d="M 512 166 L 536 166 L 536 332 C 536 343 527 352 516 352 L 512 352 Z"
                                    fill="#A96B31"
                                />

                                <line
                                    x1={276}
                                    y1={174}
                                    x2={524}
                                    y2={174}
                                    stroke="#9D622B"
                                    strokeWidth={3}
                                    strokeLinecap="round"
                                    opacity={tFlapsClose}
                                />

                                <rect
                                    x={384}
                                    y={160}
                                    width={32}
                                    height={196}
                                    rx={6}
                                    fill={colors.vyteGreen}
                                    style={{
                                        transformOrigin: '400px 160px',
                                        transform: `scaleY(${tTapeSeal})`,
                                        opacity: tTapeSeal > 0.02 ? 1 : 0,
                                    }}
                                />

                                <g
                                    transform="translate(290, 250)"
                                    style={{
                                        transformOrigin: '44px 30px',
                                        transform: `scale(${0.6 + 0.4 * tTapeSeal})`,
                                        opacity: Math.min(1, tTapeSeal * 1.8),
                                    }}
                                >
                                    <rect x={0} y={0} width={84} height={58} rx={8} fill="#FFFFFF" />
                                    <circle cx={16} cy={16} r={5} fill={colors.vyteGreen} />
                                    <rect x={26} y={12} width={44} height={8} rx={3} fill={colors.inkBlack} />
                                    <rect x={11} y={28} width={62} height={5} rx={2.5} fill="#94A3B8" />
                                    <rect x={11} y={38} width={46} height={5} rx={2.5} fill="#CBD5E1" />
                                    <rect x={11} y={47} width={56} height={4} rx={2} fill={colors.vyteGreen} />
                                </g>

                                {shipRaw > 0.18 && (
                                    <g style={{ opacity: Math.sin(((shipRaw - 0.18) / 0.82) * Math.PI) }}>
                                        <rect x={175} y={195} width={68} height={7} rx={3.5} fill={colors.vyteGreen} />
                                        <rect x={135} y={248} width={108} height={8} rx={4} fill={colors.inkBlack} />
                                        <rect x={190} y={302} width={52} height={7} rx={3.5} fill={colors.vyteGreen} />
                                    </g>
                                )}
                            </g>
                        )}
                    </g>
                )}

                {/* ACT 4: VYTE LOGO STAGGERED SPRING REVEAL (Shifted -65.5px X & -20px Y so midpoint 465.5 aligns with viewBox center 400) */}
                {elapsedMs >= 2220 && (
                    <g transform="translate(-65.5, -20)" style={{ pointerEvents: 'none' }}>
                        <g
                            style={{
                                transformOrigin: '245px 235px',
                                transform: `translate(${vSpring.translateX}px, ${vSpring.translateY}px) scale(${vSpring.scale})`,
                                opacity: vSpring.opacity,
                            }}
                        >
                            <path d={glyphs.V_leftLeg.d} fill={glyphs.V_leftLeg.fill} />
                            <path d={glyphs.V_rightGreenSlash.d} fill={glyphs.V_rightGreenSlash.fill} />
                        </g>

                        <g
                            style={{
                                transformOrigin: '410px 295px',
                                transform: `translate(${ySpring.translateX}px, ${ySpring.translateY}px) scale(${ySpring.scale})`,
                                opacity: ySpring.opacity,
                            }}
                        >
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
                        </g>

                        <g
                            style={{
                                transformOrigin: '560px 245px',
                                transform: `translate(${tSpring.translateX}px, ${tSpring.translateY}px) scale(${tSpring.scale})`,
                                opacity: tSpring.opacity,
                            }}
                        >
                            <path d={glyphs.t_body.d} fill={glyphs.t_body.fill} />
                        </g>

                        <g
                            style={{
                                transformOrigin: '715px 270px',
                                transform: `translate(${eSpring.translateX}px, ${eSpring.translateY}px) scale(${eSpring.scale})`,
                                opacity: eSpring.opacity,
                            }}
                        >
                            <path d={glyphs.e_body.d} fill={glyphs.e_body.fill} fillRule="evenodd" />
                        </g>

                        <text
                            x={subtitle.x}
                            y={subtitle.y}
                            textAnchor="middle"
                            fill={subtitle.fill}
                            style={{
                                fontSize: `${subtitle.fontSize}px`,
                                fontWeight: subtitle.fontWeight,
                                letterSpacing: subtitle.letterSpacing,
                                opacity: subSpring.opacity,
                                transform: `translateY(${(1 - subSpring.opacity) * 14}px)`,
                            }}
                        >
                            {subtitle.text}
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
};

export default SplashScreen;