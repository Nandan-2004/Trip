import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "@/api";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadMe = async () => {
    const token = localStorage.getItem("access_token");
    if (token) {
      try {
        const data = await api("/auth/me");
        setUser(data);
      } catch {
        setUser(null);
        localStorage.removeItem("access_token");
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMe();
  }, []);

  const login = async (email, password) => {
    const data = await api("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    localStorage.setItem("access_token", data.access_token);
    await loadMe();
    navigate("/dashboard");
  };

  const register = async (name, email, password) => {
    const data = await api("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    localStorage.setItem("access_token", data.access_token);
    await loadMe();
    navigate("/dashboard");
  };

  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("access_token");
    setUser(null);
    navigate("/");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
