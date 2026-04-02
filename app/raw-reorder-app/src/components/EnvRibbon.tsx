// components/EnvRibbon.tsx
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import i18n from '../i18n/i18n';

type Env = 'dev' | 'preview' | 'prod';
type Corner = 'top-right' | 'top-left';

type Props = {
    position?: Corner;
    offsetWeb?: number;        // px från appens topp (web)
    offsetNative?: number;     // px under safe-area-top (native)
    box?: number;              // klippruta i hörnet (större = längre synlig diagonal)
    bandWidth?: number;        // bandets längd (före rotation)
    thickness?: number;        // bandets tjocklek
    angleDeg?: number;         // t.ex. 35 eller 45
    labelShiftWeb?: number;    // POSITIVT = åt höger (mot hörnet) i top-right
    labelShiftNative?: number; // POSITIVT = åt höger (mot hörnet) i top-right
    zIndex?: number;           // måste vara över ev. backdrop
};

function getEnv(): Env {
    const c: any = Constants as any;
    const extra = (c.expoConfig?.extra ?? c.manifest?.extra ?? {}) as any;
    const v = String(extra.ENV ?? 'dev').toLowerCase();
    return v === 'prod' ? 'prod' : (v === 'preview' ? 'preview' : 'dev');
}

// längden av synlig band-sträcka genom kvadraten för valfri vinkel (rad)
function visibleLengthInSquare(box: number, angleRad: number) {
    return box * (Math.abs(Math.cos(angleRad)) + Math.abs(Math.sin(angleRad)));
}

export default function EnvRibbon({
    position = 'top-right',
    offsetWeb = 8,
    offsetNative = 8,
    box = 200,
    bandWidth = 520,
    thickness = 28,
    angleDeg = 35,
    labelShiftWeb = 0,
    labelShiftNative = 0,
    zIndex = 100000,
}: Props) {
    const env = getEnv();
    if (env === 'prod') return null;

    const insets = useSafeAreaInsets();
    const isRight = position === 'top-right';
    const isWeb = Platform.OS === 'web';

    // placering från topp
    const top = (isWeb ? 0 : (insets?.top ?? 0)) + (isWeb ? offsetWeb : offsetNative);

    // färg
    const color = env === 'preview' ? '#f59e0b' : '#d32f2f';

    // label via i18n (fallback om nyckel saknas)
    const labelKey = env === 'preview' ? 'env.productionBanner' : 'env.developmentBanner';
    const t = i18n.t(labelKey) as unknown as string;
    const label =
        (typeof t === 'string' && t.trim()) ? t.trim() : (env === 'preview' ? 'PRODUKTION' : 'DEVELOPMENT');

    // beräkna säkert maxskift utifrån vinkel + box
    const rotRad = (angleDeg * Math.PI) / 180;
    const visibleLen = visibleLengthInSquare(box, rotRad);
    const maxShift = Math.max(0, Math.floor(visibleLen / 2 - 16)); // marginal så text inte klipps

    // POSITIVT = åt höger (mot hörnet) i top-right, NEGATIVT = åt vänster (mot mitten)
    const raw = isWeb ? (labelShiftWeb ?? 0) : (labelShiftNative ?? 0);
    const shift = Math.max(-maxShift, Math.min(maxShift, raw));

    return (
        <View
            style={{
                position: 'absolute',
                top,
                right: isRight ? 0 : undefined,
                left: !isRight ? 0 : undefined,
                width: box,
                height: box,
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex,
                ...(Platform.OS === 'android' ? { elevation: 9999 } : null),
            }}
        >
            <View
                style={{
                    position: 'absolute',
                    top: box / 2 - thickness / 2,
                    right: isRight ? -(bandWidth - box) / 2 : undefined,
                    left: !isRight ? -(bandWidth - box) / 2 : undefined,
                    width: bandWidth,
                    height: thickness,
                    backgroundColor: color,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    transform: [{ rotate: `${isRight ? angleDeg : -angleDeg}deg` }],
                    pointerEvents: 'none',
                    shadowOpacity: isWeb ? 0.15 : 0.25,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                }}
            >
                {/* POSITIV shift i top-right = åt höger (mot hörnet) */}
                <View
                    style={{
                        transform: [{ translateX: isRight ? shift : -shift }],
                        pointerEvents: 'none',
                        maxWidth: visibleLen - 24, // håll texten inom synliga diagonalen
                    }}
                >
                    <Text
                        numberOfLines={1}
                        ellipsizeMode="clip"
                        style={{
                            color: '#fff',
                            fontWeight: '700',
                            letterSpacing: 0.3,
                            textShadowColor: 'rgba(0,0,0,0.25)',
                            textShadowRadius: 2,
                            textShadowOffset: { width: 0, height: 1 },
                        }}
                    >
                        {label}
                    </Text>
                </View>
            </View>
        </View>
    );
}
