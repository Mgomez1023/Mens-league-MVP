import { useState } from "react";
import { login, setToken } from "../api";

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
    <div style={{ maxWidth: 420, margin: "0 auto", fontFamily: "system-ui",}}>
      <h2>Admin Login</h2>
      <form onSubmit={submit}>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} />
        <button style={{ marginTop: 12, width: "100%" }}>Login</button>
        {err && <p style={{ color: "crimson" }}>{err}</p>}
      </form>
    </div>
  );
}
