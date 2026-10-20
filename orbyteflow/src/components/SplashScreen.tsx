// orbyteflow/src/components/SplashScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import startAnimData from './start_anim.json';

export interface SplashScreenProps {
    /** Callback fired when the splash animation finishes and exits */
    onComplete?: () => void;
    /** Optional override for the JSON animation config */
    animationData?: typeof startAnimData;
    /** Show interactive timeline scrubber at the bottom for debugging */
    showDebugControls?: boolean;
    /** Automatically fade out when complete (default: true) */
    autoDismiss?: boolean;
}

interface InventoryBlock {
    id: string;
    shelf: number;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
                                                              onComplete,
                                                              animationData = startAnimData,
                                                              showDebugControls = false,
                                                              autoDismiss = true,
                                                          }) => {
    const [elapsedMs, setElapsedMs] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isExiting, setIsExiting] = useState<boolean>(false);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);

    const totalDuration = 2400;
    const { colors } = animationData.designTokens;
    const { glyphs, subtitle } = animationData.logoGeometry;

    // Solid Drop Box Palette
    const boxColors = {
        exteriorDark: '#B87B42',
        exteriorLight: '#D49658',
        sealTape: colors.vyteGreen,
        labelPlate: '#FFFFFF',
        statusDot: colors.vyteGreen,
    };

    // --- Key Choreography Milestones (ms) ---
    const T_MORPH_START = 450;
    const T_DROP_START = 850;
    const T_CONTACT = 1150;      // Moment of impact: Box appears & springs!
    const T_TAPE = 1380;
    const T_SHIP_START = 1500;
    const T_LOGO_START = 1680;   // Logo starts sweeping from LEFT

    // 1. Database -> Drawer Morph Progress (0 -> 1)
    const morphProgress = Math.min(1, Math.max(0, (elapsedMs - T_MORPH_START) / 380));

    // 2. Drawer Gravity Drop Progress (0 -> 1)
    const dropLinear = Math.min(1, Math.max(0, (elapsedMs - T_DROP_START) / (T_CONTACT - T_DROP_START)));
    // Gravitational acceleration curve
    const drawerFallY = Math.pow(dropLinear, 2) * 148;

    // 3. Impact & Spring Physics (Active from T_CONTACT onwards)
    const isContacted = elapsedMs >= T_CONTACT;
    const springProgress = Math.min(1, Math.max(0, (elapsedMs - T_CONTACT) / 340));

    // Damped harmonic oscillator math for realistic squash-and-rebound:
    const springDecay = Math.exp(-6 * springProgress);
    const springOsc = Math.sin(3.5 * Math.PI * springProgress);
    const boxSpringY = isContacted ? 16 * springDecay * springOsc : 0;
    const boxScaleY = isContacted ? 1 - 0.16 * springDecay * springOsc : 1;
    const boxScaleX = isContacted ? 1 + 0.09 * springDecay * springOsc : 1;

    // 4. Sealing Tape Pop
    const tapeProgress = Math.min(1, Math.max(0, (elapsedMs - T_TAPE) / 100));

    // 5. Box Rocket Launch to the RIGHT
    const shipProgress = Math.min(1, Math.max(0, (elapsedMs - T_SHIP_START) / 340));
    const boxShipX = Math.pow(shipProgress, 2.6) * 1150;

    // 6. Smooth Logo Glide from the LEFT (Critically Damped Harmonic Arrival)
    const logoProgress = Math.min(1, Math.max(0, (elapsedMs - T_LOGO_START) / 680));
    // Analytical spring formula starting with velocity 0 and settling with a subtle 4% organic cushion
    const logoSpringFactor =
        logoProgress > 0
            ? 1 - Math.exp(-5.2 * logoProgress) * (Math.cos(5.4 * logoProgress) + 0.9 * Math.sin(5.4 * logoProgress))
            : 0;
    const logoArrivalX = -640 * (1 - logoSpringFactor);
    const logoOpacity = Math.min(1, logoProgress * 3.5);

    useEffect(() => {
        if (!isPlaying) {
            lastTimeRef.current = null;
            return;
        }

        const tick = (timestamp: number) => {
            if (lastTimeRef.current === null) {
                lastTimeRef.current = timestamp;
            }
            const delta = timestamp - lastTimeRef.current;
            lastTimeRef.current = timestamp;

            setElapsedMs((prev) => {
                const next = prev + delta;
                if (next >= totalDuration) {
                    setIsPlaying(false);
                    if (autoDismiss && !showDebugControls) {
                        setTimeout(() => setIsExiting(true), 250);
                        setTimeout(() => onComplete?.(), 700);
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
    }, [isPlaying, totalDuration, autoDismiss, showDebugControls, onComplete]);

    const handleReplay = () => {
        setIsExiting(false);
        setElapsedMs(0);
        lastTimeRef.current = null;
        setIsPlaying(true);
    };

    // Fixed, non-shaking inventory SKU blocks
    const inventoryBlocks: InventoryBlock[] = [
        { id: 'b0', shelf: 0, x: 318, y: 132, w: 46, h: 22, color: colors.vyteGreen },
        { id: 'b1', shelf: 0, x: 372, y: 132, w: 48, h: 22, color: colors.inkBlack },
        { id: 'b2', shelf: 0, x: 428, y: 132, w: 54, h: 22, color: colors.vyteGreen },
        { id: 'b3', shelf: 1, x: 318, y: 196, w: 56, h: 22, color: colors.inkBlack },
        { id: 'b4', shelf: 1, x: 382, y: 196, w: 44, h: 22, color: colors.vyteGreen },
        { id: 'b5', shelf: 1, x: 434, y: 196, w: 48, h: 22, color: colors.inkBlack },
    ];

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceOffWhite,
                opacity: isExiting ? 0 : 1,
                pointerEvents: isExiting ? 'none' : 'auto',
                transition: 'opacity 450ms cubic-bezier(0.4, 0, 0.2, 1)',
                fontFamily:
                    '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                userSelect: 'none',
                overflow: 'hidden',
            }}
        >
            {/* Background Ambient Glow */}
            <div
                style={{
                    position: 'absolute',
                    width: '560px',
                    height: '560px',
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${colors.vyteGreenGlow} 0%, rgba(246,247,244,0) 70%)`,
                    transform: `scale(${isContacted ? 1.25 : 0.85})`,
                    opacity: elapsedMs >= T_LOGO_START ? 0.95 : 0.4,
                    transition: 'transform 500ms ease, opacity 500ms ease',
                    pointerEvents: 'none',
                }}
            />

            {/* Main SVG Vector Canvas */}
            <svg
                viewBox={animationData.logoGeometry.viewBox}
                style={{
                    width: 'min(90vw, 760px)',
                    height: 'auto',
                    overflow: 'visible',
                }}
            >
                <defs>
                    <filter id="soft-depth-shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="12" stdDeviation="15" floodColor="#0B0C0E" floodOpacity="0.08" />
                    </filter>
                </defs>

                {/* ============================================================
            GROUP 1: DRAWER & DROP BOX (Ships away to the RIGHT)
           ============================================================ */}
                {elapsedMs < T_LOGO_START + 250 && (
                    <g
                        style={{
                            transform: `translate(${boxShipX}px, 0px)`,
                            opacity: shipProgress > 0.85 ? 1 - (shipProgress - 0.85) * 6.6 : 1,
                        }}
                    >
                        {/* DRAWER UNIT */}
                        <g
                            filter="url(#soft-depth-shadow)"
                            style={{
                                transformOrigin: '400px 180px',
                                transform: `translate(0px, ${drawerFallY + boxSpringY}px) scaleY(${boxScaleY}) scaleX(${boxScaleX})`,
                            }}
                        >
                            {/* Outer Cabinet Frame */}
                            <g style={{ opacity: morphProgress }}>
                                <rect x={286} y={108} width={228} height={158} rx={22} fill={colors.inkBlack} />
                                <rect x={294} y={116} width={212} height={142} rx={16} fill="#FFFFFF" />
                            </g>

                            {/* 2 Database / Drawer Shelves */}
                            {[0, 1].map((idx) => {
                                const tierY = 126 + idx * 64;
                                const dbEnterProgress = Math.min(1, Math.max(0, (elapsedMs - idx * 80) / 280));

                                return (
                                    <g
                                        key={`tier-${idx}`}
                                        style={{
                                            transform: `translateY(${(1 - dbEnterProgress) * -22}px)`,
                                            opacity: dbEnterProgress,
                                        }}
                                    >
                                        {/* Shelf tray base */}
                                        <rect
                                            x={304}
                                            y={tierY}
                                            width={192}
                                            height={48}
                                            rx={morphProgress > 0.5 ? 10 : 24}
                                            fill={morphProgress > 0.5 ? colors.drawerTrack : colors.inkBlack}
                                        />

                                        {/* Top elliptical platter (fades out as drawer appears) */}
                                        <ellipse
                                            cx={400}
                                            cy={tierY + 12}
                                            rx={80}
                                            ry={10}
                                            fill="#1E222A"
                                            style={{ opacity: 1 - morphProgress }}
                                        />

                                        {/* Clean, Non-Shaking Inventory SKU Blocks */}
                                        {inventoryBlocks
                                            .filter((b) => b.shelf === idx)
                                            .map((blk) => (
                                                <rect
                                                    key={blk.id}
                                                    x={blk.x}
                                                    y={blk.y}
                                                    width={blk.w}
                                                    height={blk.h}
                                                    rx={5}
                                                    fill={blk.color}
                                                    style={{ opacity: morphProgress }}
                                                />
                                            ))}

                                        {/* Front tray cover */}
                                        <rect
                                            x={304}
                                            y={tierY + 30}
                                            width={192}
                                            height={18}
                                            rx={7}
                                            fill="#CCD1C6"
                                            style={{ opacity: morphProgress }}
                                        />

                                        {/* Pill indicator / Drawer handle */}
                                        <rect
                                            x={morphProgress > 0.5 ? 382 : 332}
                                            y={morphProgress > 0.5 ? tierY + 36 : tierY + 22}
                                            width={morphProgress > 0.5 ? 36 : 14}
                                            height={morphProgress > 0.5 ? 6 : 14}
                                            rx={morphProgress > 0.5 ? 3 : 7}
                                            fill={idx === 1 || morphProgress < 0.5 ? colors.vyteGreen : colors.inkBlack}
                                        />
                                    </g>
                                );
                            })}
                        </g>

                        {/* DROP BOX: COMPLETELY INVISIBLE UNTIL IMPACT AT T_CONTACT */}
                        {isContacted && (
                            <g
                                filter="url(#soft-depth-shadow)"
                                style={{
                                    transformOrigin: '400px 330px',
                                    transform: `translateY(${boxSpringY}px) scaleY(${boxScaleY}) scaleX(${boxScaleX})`,
                                }}
                            >
                                {/* Solid Kraft Face */}
                                <rect x={276} y={262} width={248} height={148} rx={18} fill={boxColors.exteriorLight} />

                                {/* Right-Side Depth Shading */}
                                <path
                                    d="M 504 262 L 524 262 C 524 262 524 392 524 392 C 524 402 516 410 504 410 L 504 410 Z"
                                    fill={boxColors.exteriorDark}
                                />

                                {/* Drop Slot Inset */}
                                <rect x={298} y={276} width={204} height={10} rx={5} fill={boxColors.exteriorDark} />

                                {/* Shipment Label */}
                                <g transform="translate(304, 308)">
                                    <rect x={0} y={0} width={76} height={50} rx={6} fill={boxColors.labelPlate} />
                                    <rect x={8} y={10} width={22} height={8} rx={2} fill={boxColors.statusDot} />
                                    <rect x={8} y={24} width={60} height={4} rx={2} fill="#A6ACB5" />
                                    <rect x={8} y={34} width={40} height={4} rx={2} fill="#CCD1D9" />
                                </g>

                                {/* Green Sealing Tape */}
                                <rect
                                    x={386}
                                    y={246}
                                    width={28}
                                    height={156}
                                    rx={4}
                                    fill={boxColors.sealTape}
                                    style={{
                                        transformOrigin: '400px 246px',
                                        transform: `scaleY(${tapeProgress})`,
                                        opacity: tapeProgress > 0 ? 1 : 0,
                                    }}
                                />

                                {/* Speed Lines during dispatch */}
                                {shipProgress > 0 && (
                                    <g style={{ opacity: Math.sin(shipProgress * Math.PI) }}>
                                        <rect x={226} y={290} width={36} height={6} rx={3} fill={colors.vyteGreen} />
                                        <rect x={196} y={325} width={66} height={6} rx={3} fill={colors.vyteGreen} />
                                        <rect x={238} y={360} width={24} height={6} rx={3} fill={colors.vyteGreen} />
                                    </g>
                                )}
                            </g>
                        )}
                    </g>
                )}

                {/* ============================================================
            GROUP 2: VYTE LOGO ARRIVES FROM THE OPPOSITE SIDE (LEFT -> CENTER)
           ============================================================ */}
                {elapsedMs >= T_LOGO_START && (
                    <g
                        style={{
                            transform: `translate(${logoArrivalX}px, 0px)`,
                            opacity: logoOpacity,
                            pointerEvents: 'none',
                        }}
                    >
                        {/* V - Left Stem */}
                        <path d={glyphs.V_leftLeg.d} fill={glyphs.V_leftLeg.fill} />

                        {/* V - Right Green Slash */}
                        <path d={glyphs.V_rightGreenSlash.d} fill={glyphs.V_rightGreenSlash.fill} />

                        {/* y - Left Fork */}
                        <path d={glyphs.y_leftFork.d} fill={glyphs.y_leftFork.fill} />

                        {/* y - Right Descender Hook */}
                        <path d={glyphs.y_descender.d} fill={glyphs.y_descender.fill} />

                        {/* y - Top Green Node */}
                        <circle
                            cx={glyphs.y_topGreenDot.cx}
                            cy={glyphs.y_topGreenDot.cy}
                            r={glyphs.y_topGreenDot.r}
                            fill={glyphs.y_topGreenDot.fill}
                        />

                        {/* y - Bottom Green Node */}
                        <circle
                            cx={glyphs.y_bottomGreenDot.cx}
                            cy={glyphs.y_bottomGreenDot.cy}
                            r={glyphs.y_bottomGreenDot.r}
                            fill={glyphs.y_bottomGreenDot.fill}
                        />

                        {/* t - Body */}
                        <path d={glyphs.t_body.d} fill={glyphs.t_body.fill} />

                        {/* e - Body */}
                        <path d={glyphs.e_body.d} fill={glyphs.e_body.fill} fillRule="evenodd" />

                        {/* Subtitle: INVENTORY MANAGEMENT */}
                        <text
                            x={subtitle.x}
                            y={subtitle.y}
                            textAnchor="middle"
                            fill={subtitle.fill}
                            style={{
                                fontSize: `${subtitle.fontSize}px`,
                                fontWeight: subtitle.fontWeight,
                                letterSpacing: subtitle.letterSpacing,
                            }}
                        >
                            {subtitle.text}
                        </text>
                    </g>
                )}
            </svg>

            {/* Optional Timeline Debug Scrubber Bar */}
            {showDebugControls && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 28,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '10px 18px',
                        borderRadius: 999,
                        backgroundColor: '#FFFFFF',
                        boxShadow: '0 10px 30px rgba(11, 12, 14, 0.12)',
                        fontSize: 13,
                        color: colors.inkBlack,
                    }}
                >
                    <button
                        onClick={() => setIsPlaying((p) => !p)}
                        style={{
                            border: 'none',
                            background: colors.inkBlack,
                            color: '#FFF',
                            borderRadius: 999,
                            padding: '6px 14px',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        {isPlaying ? 'Pause' : 'Play'}
                    </button>

                    <button
                        onClick={handleReplay}
                        style={{
                            border: 'none',
                            background: colors.drawerTrack,
                            color: colors.inkBlack,
                            borderRadius: 999,
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Replay
                    </button>

                    <input
                        type="range"
                        min={0}
                        max={totalDuration}
                        value={elapsedMs}
                        onChange={(e) => {
                            setIsPlaying(false);
                            setElapsedMs(Number(e.target.value));
                        }}
                        style={{ width: 220, accentColor: colors.vyteGreen, cursor: 'pointer' }}
                    />

                    <span
                        style={{
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 600,
                            minWidth: 155,
                            color: colors.vyteGreen,
                        }}
                    >
            {elapsedMs < T_MORPH_START
                ? 'DATABASE'
                : elapsedMs < T_CONTACT
                    ? 'DRAWER DROP'
                    : elapsedMs < T_SHIP_START
                        ? 'BOX SPRING'
                        : elapsedMs < T_LOGO_START
                            ? 'SHIP'
                            : 'LOGO ARRIVAL'}{' '}
                        ({(elapsedMs / 1000).toFixed(2)}s)
          </span>
                </div>
            )}
        </div>
    );
};

export default SplashScreen;