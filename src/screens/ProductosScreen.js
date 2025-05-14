import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Alert,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useConnectivity } from "../context/ConnectivityContext";
import productService from "../services/productService";

export default function ProductosScreen() {
  const { isConnected, toggleConnection } = useConnectivity();
  const [productos, setProductos] = useState([]);
  const [nombre, setNombre] = useState("");
  const [camara, setCamara] = useState("");
  const [syncing, setSyncing] = useState(false);
  const wasConnected = useRef(isConnected);

  const loadProductos = async () => {
    try {
      const data = await productService.getProductos(isConnected);
      setProductos(data);
    } catch (error) {
      console.error("Error loading products:", error);
      Alert.alert("Error", "No se pudieron cargar los productos");
    }
  };

  useEffect(() => {
    (async () => {
      if (!wasConnected.current && isConnected) {
        // Pasaste de offline a online
        await handleSync();
      } else {
        await loadProductos();
      }
      wasConnected.current = isConnected;
    })();
  }, [isConnected]);

  const handleAdd = async () => {
    if (!nombre || !camara) {
      Alert.alert("Error", "Debe ingresar nombre y cámara");
      return;
    }
    try {
      const nuevoProducto = await productService.createProducto(
        nombre,
        camara,
        isConnected
      );
      setProductos((prev) => [...prev, nuevoProducto]);
      setNombre("");
      setCamara("");
      Alert.alert("Éxito", "Producto creado correctamente");
    } catch (error) {
      console.error("Error creating product:", error);
      Alert.alert("Error", "No se pudo crear el producto");
    }
  };

  const handleUpdateCamara = async (id) => {
    Alert.prompt(
      "Actualizar Cámara",
      "Ingrese la nueva cámara:",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Actualizar",
          onPress: async (nuevaCamara) => {
            if (nuevaCamara) {
              try {
                const actualizado = await productService.updateCamara(
                  id,
                  nuevaCamara,
                  isConnected
                );
                setProductos((prev) =>
                  prev.map((p) => (p.id == id ? actualizado : p))
                );
                Alert.alert("Éxito", "Cámara actualizada correctamente");
              } catch (error) {
                console.error("Error updating camera:", error);
                Alert.alert("Error", "No se pudo actualizar la cámara");
              }
            }
          },
        },
      ],
      "plain-text",
      ""
    );
  };

  const handleDelete = async (id) => {
    Alert.alert("Confirmar", "¿Está seguro de eliminar este producto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        onPress: async () => {
          try {
            await productService.deleteProducto(id, isConnected);
            setProductos((prev) => prev.filter((p) => p.id != id));
            Alert.alert("Éxito", "Producto eliminado correctamente");
          } catch (error) {
            console.error("Error deleting product:", error);
            Alert.alert("Error", "No se pudo eliminar el producto");
          }
        },
      },
    ]);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await productService.syncData();
      await loadProductos();
      Alert.alert("Éxito", "Datos sincronizados correctamente");
    } catch (error) {
      console.error("Error syncing data:", error);
      Alert.alert("Error", "No se pudo completar la sincronización");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Switch de conexión */}
      <View style={styles.connectionContainer}>
        <Text style={styles.connectionText}>Modo Offline</Text>
        <Switch
          value={isConnected}
          onValueChange={toggleConnection}
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={isConnected ? "#f5dd4b" : "#f4f3f4"}
        />
        <Text style={styles.connectionText}>Modo Online</Text>
      </View>

      {/* Formulario para agregar productos */}
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="Nombre del producto"
          value={nombre}
          onChangeText={setNombre}
        />
        <TextInput
          style={styles.input}
          placeholder="Número de cámara"
          value={camara}
          onChangeText={setCamara}
          keyboardType="numeric"
        />
        <Button title="Agregar Producto" onPress={handleAdd} color="#2ecc71" />
      </View>

      {/* Botón de sincronización */}
      <View style={styles.syncButtonContainer}>
        <Button
          title={syncing ? "Sincronizando..." : "Sincronizar Cambios"}
          onPress={handleSync}
          disabled={!isConnected || syncing}
          color="#3498db"
        />
      </View>

      {/* Lista de productos */}
      <FlatList
        data={productos}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <View style={styles.productItem}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{item.nombre}</Text>
              <Text style={styles.productCamera}>Cámara: {item.camara}</Text>
              {item.needsSync && (
                <Text style={styles.syncPending}>
                  ⚠️ Pendiente de sincronización
                </Text>
              )}
            </View>
            <View style={styles.productActions}>
              <Button
                title="Editar"
                onPress={() => handleUpdateCamara(item.id)}
                color="#f39c12"
              />
              <Button
                title="Eliminar"
                onPress={() => handleDelete(item.id)}
                color="#e74c3c"
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyList}>No hay productos registrados</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa", padding: 16 },
  connectionContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  connectionText: { marginHorizontal: 10, fontSize: 16, fontWeight: "500" },
  formContainer: {
    marginBottom: 20,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    height: 50,
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  syncButtonContainer: { marginBottom: 20 },
  listContainer: { paddingBottom: 20 },
  productItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productInfo: { flex: 1 },
  productName: { fontSize: 18, fontWeight: "bold", marginBottom: 5 },
  productCamera: { fontSize: 16, color: "#555" },
  syncPending: { fontSize: 14, color: "#e67e22", marginTop: 5 },
  productActions: { flexDirection: "row", marginLeft: 10 },
  emptyList: {
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
    color: "#777",
  },
});
