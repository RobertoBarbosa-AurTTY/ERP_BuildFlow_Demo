import React, { useRef, useState, useCallback } from 'react';
import {
  View, StyleSheet, StatusBar, ActivityIndicator, Text, TouchableOpacity,
  SafeAreaView, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import SERVER_URL from './src/config';

export default function App() {
  const webViewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  const onNavigationStateChange = useCallback((navState) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  const onError = useCallback(() => {
    setError(true);
    setLoading(false);
  }, []);

  const onLoadEnd = useCallback(() => {
    setLoading(false);
    setProgress(0);
  }, []);

  const retry = useCallback(() => {
    setError(false);
    setLoading(true);
    webViewRef.current?.reload();
  }, []);

  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Sem conexão</Text>
        <Text style={styles.errorText}>
          Não foi possível conectar ao servidor.{'\n'}
          Verifique sua rede e tente novamente.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retry}>
          <Text style={styles.retryText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1a73e8" />
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.max(5, progress * 100)}%` }]} />
          </View>
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: SERVER_URL }}
        style={styles.webview}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onLoadEnd={onLoadEnd}
        onError={onError}
        onNavigationStateChange={onNavigationStateChange}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        sharedCookiesEnabled
        userAgent={
          Platform.OS === 'android'
            ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36 ConstruTechERP/1.0'
            : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ConstruTechERP/1.0'
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', zIndex: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  progressBar: {
    width: 200, height: 3, backgroundColor: '#e0e0e0',
    borderRadius: 2, marginTop: 16, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: '#1a73e8', borderRadius: 2,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#5f6368' },
  errorContainer: {
    flex: 1, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#1f1f1f', marginBottom: 8 },
  errorText: { fontSize: 15, color: '#5f6368', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  retryBtn: {
    backgroundColor: '#1a73e8', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
