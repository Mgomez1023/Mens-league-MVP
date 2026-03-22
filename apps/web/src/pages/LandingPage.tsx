import { useState } from "react";
import { useTranslation } from "react-i18next";
import { login, setToken } from "../api";
import { Notice, PageHeader, SurfaceCard } from "../components/ui";

export default function LandingPage({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
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
      setErr(t("auth.invalidCredentials"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-stack">
      <PageHeader eyebrow="" title={t("landing.title")} description="" />

      <SurfaceCard className="login-card">
        <div className="login-card-copy">
          <h2>{t("landing.heading")}</h2>
          <p />
        </div>

        <form className="form-grid login-form-grid" onSubmit={submit}>
          <label className="field">
            <span>{t("common.email")}</span>
            <input
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("landing.emailPlaceholder")}
            />
          </label>

          <label className="field">
            <span>{t("common.password")}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("landing.passwordPlaceholder")}
            />
          </label>

          <div className="form-actions">
            <button className="button button-primary" disabled={submitting} type="submit">
              {submitting ? t("landing.signingIn") : t("buttons.login")}
            </button>
          </div>
        </form>

        {err && <Notice variant="error">{err}</Notice>}
      </SurfaceCard>
    </section>
  );
}
