// components/PreviewProvider.tsx
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { View, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import ReactDOM from 'react-dom';

type WebPreview = { uri: string; x: number; y: number } | null;
type NativePreview = { uri: string } | null;

type Ctx = {
    showWebPreview: (uri: string, x: number, y: number) => void;
    moveWebPreview: (x: number, y: number) => void;
    hideWebPreview: () => void;
    openNativePreview: (uri: string) => void;
    closeNativePreview: () => void;
    hidePreview: () => void;
};

const PreviewContext = createContext<Ctx | null>(null);

export const usePreview = () => {
    const ctx = useContext(PreviewContext);
    if (!ctx) throw new Error('usePreview must be used within <PreviewProvider/>');
    return ctx;
};

const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (Platform.OS !== 'web' || !ReactDOM?.createPortal) return <>{children}</>;
    return ReactDOM.createPortal(children as any, document.body);
};

export const PreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [web, setWeb] = useState<WebPreview>(null);
    const [native, setNative] = useState<NativePreview>(null);

    const showWebPreview = useCallback((uri: string, x: number, y: number) => {
        if (Platform.OS !== 'web') return;
        setWeb({ uri, x, y });
    }, []);
    const moveWebPreview = useCallback((x: number, y: number) => {
        if (Platform.OS !== 'web') return;
        setWeb(prev => (prev ? { ...prev, x, y } : prev));
    }, []);
    const hideWebPreview = useCallback(() => setWeb(null), []);
    const openNativePreview = useCallback((uri: string) => {
        if (Platform.OS === 'web') return;
        setNative({ uri });
    }, []);
    const closeNativePreview = useCallback(() => setNative(null), []);
    const hidePreview = useCallback(() => {
        setWeb(null);
        setNative(null);
    }, []);

    React.useEffect(() => {
        if (Platform.OS !== 'web') return;
        const clear = () => setWeb(null);
        window.addEventListener('scroll', clear, true);
        window.addEventListener('resize', clear);
        return () => {
            window.removeEventListener('scroll', clear, true);
            window.removeEventListener('resize', clear);
        };
    }, []);

    const value = useMemo(
        () => ({ showWebPreview, moveWebPreview, hideWebPreview, openNativePreview, closeNativePreview, hidePreview }),
        [showWebPreview, moveWebPreview, hideWebPreview, openNativePreview, closeNativePreview, hidePreview]
    );

    return (
        <PreviewContext.Provider value={value}>
            {children}

            {/* Web hover-zoom overlay */}
            {Platform.OS === 'web' && web && (
                <Portal>
                    <View style={[styles.previewBox, { top: web.y, left: web.x }]} pointerEvents="none">
                        <Image source={{ uri: web.uri }} style={styles.previewImage} />
                    </View>
                </Portal>
            )}

            {/* Native fullscreen zoom (tap to close, pinch to zoom) */}
            {Platform.OS !== 'web' && (
                <Modal visible={!!native} transparent animationType="fade" onRequestClose={closeNativePreview}>
                    <Pressable style={styles.backdrop} onPress={closeNativePreview}>
                        <ScrollView
                            contentContainerStyle={styles.modalCenter}
                            maximumZoomScale={5}
                            minimumZoomScale={1}
                            // Dessa props gör pinch-to-zoom bra på iOS/Android
                            centerContent
                        >
                            {native?.uri ? (
                                <Image
                                    source={{ uri: native.uri }}
                                    style={styles.modalImage}
                                    resizeMode="contain"
                                />
                            ) : null}
                        </ScrollView>

                        <Pressable style={styles.closeBtn} onPress={closeNativePreview}>
                            <Text style={styles.closeText}>✕</Text>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}
        </PreviewContext.Provider>
    );
};

const styles = StyleSheet.create({
    // Web
    previewBox: {
        position: 'fixed',
        zIndex: 2147483647,
        width: 320,
        height: 320,
        padding: 6,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        // @ts-ignore RN-web style
        boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
    },
    previewImage: { width: '100%', height: '100%', resizeMode: 'contain' },

    // Native
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' },
    modalCenter: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
    modalImage: { width: '100%', height: '100%' },
    closeBtn: {
        position: 'absolute', top: 24, right: 24,
        backgroundColor: 'rgba(255,255,255,0.85)',
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center'
    },
    closeText: { fontSize: 18, fontWeight: '700', color: '#333' },
});
