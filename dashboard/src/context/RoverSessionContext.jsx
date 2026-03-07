import { createContext, useCallback, useContext, useState } from "react";

const RoverSessionContext = createContext(null);

export function RoverSessionProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionCreds, setSessionCreds] = useState(null);

  const login = useCallback((creds) => {
    setSessionCreds(creds);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    setSessionCreds(null);
    setIsAuthenticated(false);
  }, []);

  const value = { isAuthenticated, sessionCreds, login, logout };

  return (
    <RoverSessionContext.Provider value={value}>
      {children}
    </RoverSessionContext.Provider>
  );
}

export function useRoverSession() {
  const ctx = useContext(RoverSessionContext);
  if (!ctx) throw new Error("useRoverSession must be used within RoverSessionProvider");
  return ctx;
}
