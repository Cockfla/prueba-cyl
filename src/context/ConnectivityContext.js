// src/context/ConnectivityContext.js
import React, { createContext, useState, useContext } from "react";

// Crear el contexto
const ConnectivityContext = createContext();

// Proveedor del contexto
export const ConnectivityProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);

  const toggleConnection = () => {
    setIsConnected((prev) => !prev);
  };

  return (
    <ConnectivityContext.Provider value={{ isConnected, toggleConnection }}>
      {children}
    </ConnectivityContext.Provider>
  );
};

// Hook personalizado para utilizar el contexto
export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error(
      "useConnectivity debe ser usado dentro de un ConnectivityProvider"
    );
  }
  return context;
};
