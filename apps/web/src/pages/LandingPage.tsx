import { useState } from "react";
import { login, setToken } from "../api";

import "../styling/LandingPage.css";

export default function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("admin@league.local");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const { access_token } = await login(email, password);
      console.log(access_token);
      setToken(access_token);
      localStorage.setItem("token", access_token);
      onDone();
    } catch {
      setErr("Invalid admin credentials");
    }
  }

  return (
    <div className="main"> 

      <h2 className="admin-label">Admin Login</h2>
      <form className="login-form" onSubmit={submit}>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="text-box" />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="text-box" />
        <button className="login-button">Login</button>
        {err && <p className="error-text">{err}</p>}
      </form>

    </div>
  );
}