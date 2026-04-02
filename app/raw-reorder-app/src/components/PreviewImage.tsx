// components/PreviewImage.tsx
import React, { useMemo } from 'react';
import { Image, ImageProps, Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
import { usePreview } from './PreviewProvider';

type Props = Omit<ImageProps, 'source'> & {
    /** Länk till lilla bilden (thumb). Om du istället skickar `source`, används den som liten bild. */
    smallUri?: string;
    /** Länk till stora bilden för zoom. Om inte angiven används small/source. */
    largeUri?: string;
    /** Valfritt: slå av/på preview-beteende (default: true) */
    enablePreview?: boolean;
    /** Valfritt: extra wrapper-stil (t.ex. för att styra mått via container) */
    containerStyle?: StyleProp<ViewStyle>;
    /** Valfritt: alt som text (ingen OS-effekt, men bra att kunna skicka vidare) */
    alt?: string;
    /** Du kan fortfarande skicka `source` om du vill, ex: source={{uri: '...'}} */
    source?: { uri: string } | number;
};

export const PreviewImage: React.FC<Props> = ({
    smallUri,
    largeUri,
    enablePreview = true,
    containerStyle,
    source,
    style,
    ...rest
}) => {
    const { showWebPreview, moveWebPreview, hideWebPreview, openNativePreview } = usePreview();

    // Bästa gissning av liten/stor bild från props
    const { thumb, big } = useMemo(() => {
        const srcUri = typeof source === 'object' && source && 'uri' in source ? source.uri : undefined;
        const thumbUri = smallUri || srcUri;
        const large = largeUri || thumbUri;
        return { thumb: thumbUri, big: large };
    }, [smallUri, largeUri, source]);

    // Om vi inte har någon bildkälla → returnera vanlig Image (ingen preview)
    if (!thumb) {
        return <Image source={source as any} style={style} {...rest} />;
    }

    const onMouseEnter = (e: any) => {
        if (!enablePreview || Platform.OS !== 'web') return;
        const { clientX = 0, clientY = 0 } = e?.nativeEvent ?? {};
        // Placering görs i skärmkomponenten (provider fixar overlay)
        // Vi räknar ut "smart" position i skärmen här:
        const place = (x: number, y: number) => {
            const BOX_W = 320, BOX_H = 320, GAP = 12, PAD = 8;
            const vw = window.innerWidth, vh = window.innerHeight;
            const nx = Math.min(x + GAP, vw - BOX_W - PAD);
            const ny = Math.min(y + GAP, vh - BOX_H - PAD);
            return { x: nx, y: ny };
        };
        const p = place(clientX, clientY);
        showWebPreview(big || thumb, p.x, p.y);
    };

    const onMouseMove = (e: any) => {
        if (!enablePreview || Platform.OS !== 'web') return;
        const { clientX = 0, clientY = 0 } = e?.nativeEvent ?? {};
        const BOX_W = 320, BOX_H = 320, GAP = 12, PAD = 8;
        const vw = window.innerWidth, vh = window.innerHeight;
        const nx = Math.min(clientX + GAP, vw - BOX_W - PAD);
        const ny = Math.min(clientY + GAP, vh - BOX_H - PAD);
        moveWebPreview(nx, ny);
    };

    const onMouseLeave = () => {
        if (!enablePreview || Platform.OS !== 'web') return;
        hideWebPreview();
    };

    const onPress = () => {
        if (!enablePreview) return;
        if (Platform.OS === 'web') {
            // Även på web kan klick öppna fullscreen om du vill (optional).
            // Låt hover vara primary – vi skippar fullscreen här för att inte krocka
            return;
        }
        openNativePreview(big || thumb);
    };

    // Pressable med capture för att inte bubbla till förälder med onPress (lista etc)
    return (
        <Pressable
            onPress={onPress}
            onStartShouldSetResponderCapture={() => true}
            style={containerStyle}
            // web hover
            // @ts-ignore
            onMouseEnter={onMouseEnter}
            // @ts-ignore
            onMouseMove={onMouseMove}
            // @ts-ignore
            onMouseLeave={onMouseLeave}
        >
            <Image source={{ uri: thumb }} style={style} {...rest} />
        </Pressable>
    );
};
