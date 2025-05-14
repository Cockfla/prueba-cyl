import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar as NativeStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import ProductosScreen from "./src/screens/ProductosScreen";
import { ConnectivityProvider } from "./src/context/ConnectivityContext";

export default function App() {
  return (
    <ConnectivityProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.statusBarBackground} />
        <ProductosScreen />
      </SafeAreaView>
    </ConnectivityProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  statusBarBackground: {
    height: NativeStatusBar.currentHeight,
    backgroundColor: "#3498db",
  },
});
