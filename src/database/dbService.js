import SQLite from "react-native-sqlite-storage";
import { Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";

// URL base para la API (configúrala según tu entorno)
const API_BASE_URL = "http://localhost:3000"; // Cambia esto por tu URL de producción

// Configurar SQLite para trabajar con promesas
SQLite.enablePromise(true);
const DATABASE_NAME = "productos.db";

// Inicializar la tabla de productos
const getDbConnection = async () => {
  const db = await SQLite.openDatabase({
    name: DATABASE_NAME,
    location: "default",
  });
  return db;
};

const createTables = async (db) => {
  try {
    // Crear la tabla productos con los campos necesarios para manejar sincronización
    const query = `
      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        nombre TEXT, 
        camara TEXT, 
        synced INTEGER DEFAULT 0, 
        operation TEXT,
        updatedField TEXT
      )`;
    await db.executeSql(query);
    console.log("Tabla de productos creada correctamente");
  } catch (error) {
    console.error("Error al crear la tabla de productos:", error);
    throw error;
  }
};

// Verificar la conexión a Internet
const checkConnection = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected;
};

// Sincronizar con el servidor
const syncWithServer = async () => {
  const isConnected = await checkConnection();

  if (!isConnected) {
    Alert.alert("Sin conexión", "No hay conexión a Internet para sincronizar");
    return { success: false, message: "Sin conexión a Internet" };
  }

  try {
    // Primero obtenemos la conexión a la base de datos
    const db = await getDbConnection();

    // 1. Obtener registros pendientes de sincronización
    const [results] = await db.executeSql(
      "SELECT * FROM productos WHERE synced = 0"
    );
    const pendingItems = [];

    // Convertir resultados a array
    for (let i = 0; i < results.rows.length; i++) {
      pendingItems.push(results.rows.item(i));
    }

    if (pendingItems.length === 0) {
      return { success: true, message: "No hay cambios para sincronizar" };
    }

    // 2. Procesar cada item pendiente
    for (const item of pendingItems) {
      let endpoint, method, data;

      switch (item.operation) {
        case "UPDATE":
          if (item.updatedField === "camara") {
            endpoint = `${API_BASE_URL}/productos/${item.id}/camara`;
            method = "PATCH";
            data = { camara: item.camara };
          } else {
            endpoint = `${API_BASE_URL}/productos/${item.id}`;
            method = "PUT";
            data = { nombre: item.nombre, camara: item.camara };
          }
          break;
        case "INSERT":
          endpoint = `${API_BASE_URL}/productos`;
          method = "POST";
          data = { nombre: item.nombre, camara: item.camara };
          break;
        case "DELETE":
          endpoint = `${API_BASE_URL}/productos/${item.id}`;
          method = "DELETE";
          break;
        default:
          console.warn(`Operación desconocida: ${item.operation}`);
          continue;
      }

      try {
        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method !== "DELETE" ? JSON.stringify(data) : undefined,
        });

        if (response.ok) {
          // Marcar como sincronizado o eliminar localmente
          if (item.operation === "DELETE") {
            await db.executeSql("DELETE FROM productos WHERE id = ?", [
              item.id,
            ]);
          } else {
            await db.executeSql(
              "UPDATE productos SET synced = 1 WHERE id = ?",
              [item.id]
            );
          }
        } else {
          throw new Error(`Error HTTP: ${response.status}`);
        }
      } catch (error) {
        console.error(`Error al sincronizar item ${item.id}:`, error);
        throw error; // Propaga el error para manejarlo fuera
      }
    }

    // 3. Obtener datos actualizados del servidor
    const response = await fetch(`${API_BASE_URL}/productos`);
    if (!response.ok) {
      throw new Error("Error al obtener datos del servidor");
    }

    const serverProducts = await response.json();

    // 4. Actualizar base de datos local
    // Primero borramos todos los productos sincronizados
    await db.executeSql("DELETE FROM productos WHERE synced = 1");

    // Luego insertamos los productos del servidor
    for (const product of serverProducts) {
      await db.executeSql(
        "INSERT OR REPLACE INTO productos (id, nombre, camara, synced, operation, updatedField) VALUES (?, ?, ?, 1, NULL, NULL)",
        [product.id, product.nombre, product.camara]
      );
    }

    return { success: true, message: "Sincronización completa" };
  } catch (error) {
    console.error("Error durante la sincronización:", error);
    return { success: false, message: `Error: ${error.message}` };
  }
};

// Obtener todos los productos
const getProductos = async () => {
  const isConnected = await checkConnection();

  if (isConnected) {
    try {
      const response = await fetch(`${API_BASE_URL}/productos`);
      if (response.ok) {
        const data = await response.json();

        // Actualizar la base de datos local
        const db = await getDbConnection();

        // Eliminar productos sincronizados
        await db.executeSql("DELETE FROM productos WHERE synced = 1");

        // Insertar productos del servidor
        for (const product of data) {
          await db.executeSql(
            "INSERT OR REPLACE INTO productos (id, nombre, camara, synced, operation, updatedField) VALUES (?, ?, ?, 1, NULL, NULL)",
            [product.id, product.nombre, product.camara]
          );
        }

        return data;
      }
    } catch (error) {
      console.log(
        "Error al obtener datos del servidor, usando datos locales:",
        error
      );
      // Si hay error, caemos en la opción de sin conexión
    }
  }

  // Obtener datos locales
  try {
    const db = await getDbConnection();
    const [results] = await db.executeSql("SELECT * FROM productos");

    const productos = [];
    for (let i = 0; i < results.rows.length; i++) {
      productos.push(results.rows.item(i));
    }

    return productos;
  } catch (error) {
    console.error("Error al obtener productos locales:", error);
    throw error;
  }
};

// Crear un nuevo producto
const createProducto = async (nombre, camara) => {
  const isConnected = await checkConnection();
  const db = await getDbConnection();

  try {
    // Insertar en la base de datos local
    const [result] = await db.executeSql(
      "INSERT INTO productos (nombre, camara, synced, operation) VALUES (?, ?, ?, ?)",
      [nombre, camara, isConnected ? 0 : 0, "INSERT"]
    );

    const insertId = result.insertId;

    if (isConnected) {
      try {
        const response = await fetch(`${API_BASE_URL}/productos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre, camara }),
        });

        if (response.ok) {
          const data = await response.json();
          // Actualizar el ID local con el ID del servidor
          await db.executeSql(
            "UPDATE productos SET id = ?, synced = 1 WHERE id = ?",
            [data.id, insertId]
          );
          return data;
        } else {
          throw new Error("Error al crear en el servidor");
        }
      } catch (error) {
        console.error("Error al crear en servidor:", error);
        return { id: insertId, nombre, camara }; // Retornar datos locales
      }
    } else {
      return { id: insertId, nombre, camara }; // Retornar datos locales
    }
  } catch (error) {
    console.error("Error al crear producto:", error);
    throw error;
  }
};

// Actualizar un producto
const updateProducto = async (id, nombre, camara, updatedField = null) => {
  const isConnected = await checkConnection();
  const db = await getDbConnection();

  try {
    // Actualizar en base de datos local
    await db.executeSql(
      "UPDATE productos SET nombre = ?, camara = ?, synced = ?, operation = ?, updatedField = ? WHERE id = ?",
      [nombre, camara, isConnected ? 0 : 0, "UPDATE", updatedField, id]
    );

    if (isConnected) {
      try {
        let endpoint, method, data;

        if (updatedField === "camara") {
          endpoint = `${API_BASE_URL}/productos/${id}/camara`;
          method = "PATCH";
          data = { camara };
        } else {
          endpoint = `${API_BASE_URL}/productos/${id}`;
          method = "PUT";
          data = { nombre, camara };
        }

        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          await db.executeSql("UPDATE productos SET synced = 1 WHERE id = ?", [
            id,
          ]);
        } else {
          throw new Error("Error al actualizar en el servidor");
        }
      } catch (error) {
        console.error("Error al actualizar en servidor:", error);
        // El producto ya está marcado como no sincronizado
      }
    }

    return { id, nombre, camara };
  } catch (error) {
    console.error("Error al actualizar producto:", error);
    throw error;
  }
};

// Actualizar solo la cámara de un producto
const updateCamara = async (id, camara) => {
  return updateProducto(id, null, camara, "camara");
};

// Eliminar un producto
const deleteProducto = async (id) => {
  const isConnected = await checkConnection();
  const db = await getDbConnection();

  try {
    if (isConnected) {
      try {
        // Intentar eliminar del servidor primero
        const response = await fetch(`${API_BASE_URL}/productos/${id}`, {
          method: "DELETE",
        });

        if (response.ok) {
          // Si se eliminó correctamente del servidor, eliminar también de la BD local
          await db.executeSql("DELETE FROM productos WHERE id = ?", [id]);
          return true;
        } else {
          throw new Error("Error al eliminar en el servidor");
        }
      } catch (error) {
        console.error("Error al eliminar del servidor:", error);
        // Marcar para eliminación posterior
        await db.executeSql(
          'UPDATE productos SET operation = "DELETE", synced = 0 WHERE id = ?',
          [id]
        );
        return true;
      }
    } else {
      // Si no hay conexión, marcar para eliminar cuando se sincronice
      await db.executeSql(
        'UPDATE productos SET operation = "DELETE", synced = 0 WHERE id = ?',
        [id]
      );
      return true;
    }
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    throw error;
  }
};

// Inicializar la base de datos
const initDatabase = async () => {
  try {
    const db = await getDbConnection();
    await createTables(db);
    return true;
  } catch (error) {
    console.error("Error al inicializar la base de datos:", error);
    return false;
  }
};

export {
  getDbConnection,
  createTables,
  getProductos,
  createProducto,
  updateProducto,
  updateCamara,
  deleteProducto,
  syncWithServer,
  checkConnection,
  initDatabase,
};
