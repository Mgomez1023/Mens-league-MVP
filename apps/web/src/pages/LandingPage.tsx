import { useState } from "react";
import { login, setToken } from "../api";
import { Notice, PageHeader, SurfaceCard } from "../components/ui";

export default function LandingPage({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const { access_token } = await login(email.trim(), password);
      setToken(access_token);
      onDone();
    } catch {
      setErr("Invalid admin credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow=""
        title="Admin login"
        description=""
      />

      <SurfaceCard className="login-card">
        <div className="login-card-copy">
          <h2>League Login</h2>
          <p>

          </p>
        </div>

        <form className="form-grid login-form-grid" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="commissioner@example.com"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>

          <div className="form-actions">
            <button className="button button-primary" disabled={submitting} type="submit">
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        {err && <Notice variant="error">{err}</Notice>}
      </SurfaceCard>
    </section>
  );
}
