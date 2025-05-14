import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = "http://192.168.1.91:3000/api"; // Mantiene /api
const LOCAL_STORAGE_KEY = "productos";

// Obtener productos locales
const getLocalProductos = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(LOCAL_STORAGE_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (error) {
    console.error("Error al obtener productos locales:", error);
    return [];
  }
};

// Guardar productos locales
const saveLocalProductos = async (productos) => {
  try {
    await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(productos));
  } catch (error) {
    console.error("Error al guardar productos locales:", error);
  }
};

// Obtener todos los productos (locales o remotos)
const getProductos = async (isConnected) => {
  try {
    if (isConnected) {
      const response = await fetch(`${API_BASE_URL}/productos`);
      if (!response.ok)
        throw new Error("Error al obtener productos del servidor");

      const data = await response.json();
      // Asumimos que el servidor devuelve un array directo o data.productos
      const productosRemotos = Array.isArray(data)
        ? data
        : data.productos || [];
      await saveLocalProductos(productosRemotos);
      return productosRemotos;
    }

    return await getLocalProductos();
  } catch (error) {
    console.error("Error al obtener productos:", error);
    return await getLocalProductos(); // Fallback a locales
  }
};

// Crear nuevo producto
const createProducto = async (nombre, camara, isConnected) => {
  const nuevoProducto = {
    id: Date.now().toString(), // ID temporal
    nombre,
    camara,
    needsSync: !isConnected,
  };

  const productos = await getLocalProductos();
  productos.push(nuevoProducto);
  await saveLocalProductos(productos);

  if (isConnected) {
    try {
      const response = await fetch(`${API_BASE_URL}/productos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, camara }),
      });

      if (!response.ok) throw new Error("Error en la respuesta del servidor");

      const data = await response.json();
      // Asumimos que el servidor devuelve el producto creado directamente
      const productoRemoto = data.id
        ? data
        : { id: data.insertId, nombre, camara };

      // Reemplazar el temporal con el del servidor
      const productosActualizados = productos.map((p) =>
        p.id === nuevoProducto.id ? { ...productoRemoto, needsSync: false } : p
      );
      await saveLocalProductos(productosActualizados);
      return productoRemoto;
    } catch (error) {
      console.error("Error al crear en servidor:", error);
    }
  }

  return nuevoProducto;
};

// Actualizar cámara de producto
const updateCamara = async (id, nuevaCamara, isConnected) => {
  const productos = await getLocalProductos();
  const productoIndex = productos.findIndex((p) => p.id == id); // == en lugar de === para comparar string con número

  if (productoIndex === -1) {
    throw new Error("Producto no encontrado");
  }

  productos[productoIndex].camara = nuevaCamara;
  productos[productoIndex].needsSync = !isConnected;

  await saveLocalProductos(productos);

  if (isConnected) {
    try {
      const response = await fetch(`${API_BASE_URL}/productos/${id}/camara`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camara: nuevaCamara }),
      });

      if (!response.ok) throw new Error("Error al actualizar cámara");

      productos[productoIndex].needsSync = false;
      await saveLocalProductos(productos);
    } catch (error) {
      console.error("Error al actualizar cámara en servidor:", error);
    }
  }

  return productos[productoIndex];
};

// Eliminar producto
const deleteProducto = async (id, isConnected) => {
  const productos = await getLocalProductos();
  const productoIndex = productos.findIndex((p) => p.id == id); // == para compatibilidad de tipos

  if (productoIndex === -1) {
    throw new Error("Producto no encontrado");
  }

  if (isConnected) {
    try {
      const response = await fetch(`${API_BASE_URL}/productos/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Error al eliminar en servidor");

      // Eliminar localmente solo si se eliminó en el servidor
      const productosActualizados = productos.filter((p) => p.id != id);
      await saveLocalProductos(productosActualizados);
      return;
    } catch (error) {
      console.error("Error al eliminar en servidor:", error);
    }
  }

  // Si no hay conexión o falló, marcar para eliminación posterior
  productos[productoIndex].needsSync = true;
  productos[productoIndex].pendingDelete = true;
  await saveLocalProductos(productos);
};

// Sincronizar cambios pendientes
const syncData = async () => {
  try {
    const productos = await getLocalProductos();
    const cambiosPendientes = productos.filter((p) => p.needsSync);

    if (cambiosPendientes.length === 0) {
      Alert.alert("Sincronización", "No hay cambios pendientes");
      return;
    }

    // Procesar cada cambio
    for (const producto of cambiosPendientes) {
      try {
        if (producto.pendingDelete) {
          // Eliminar en servidor
          await fetch(`${API_BASE_URL}/productos/${producto.id}`, {
            method: "DELETE",
          });
        } else if (producto.id.toString().length > 10) {
          // Es un ID temporal (creado offline)
          const response = await fetch(`${API_BASE_URL}/productos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: producto.nombre,
              camara: producto.camara,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            // Reemplazar el temporal con el del servidor
            const index = productos.findIndex((p) => p.id === producto.id);
            productos[index] = {
              ...(data.id ? data : { id: data.insertId, ...producto }),
              needsSync: false,
            };
          }
        } else {
          // Actualizar cámara en servidor
          await fetch(`${API_BASE_URL}/productos/${producto.id}/camara`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ camara: producto.camara }),
          });
        }
      } catch (error) {
        console.error(`Error sincronizando producto ${producto.id}:`, error);
        continue; // Continuar con los siguientes aunque falle uno
      }
    }

    // Eliminar los marcados para borrado y limpiar flags
    const productosActualizados = productos
      .filter((p) => !p.pendingDelete)
      .map((p) => ({ ...p, needsSync: false, pendingDelete: false }));

    await saveLocalProductos(productosActualizados);
    Alert.alert("Sincronización", "Datos sincronizados correctamente");
  } catch (error) {
    console.error("Error en sincronización:", error);
    Alert.alert("Error", "No se pudo completar la sincronización");
  }
};

export default {
  getProductos,
  createProducto,
  updateCamara,
  deleteProducto,
  syncData,
};
