"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "../lib/firebase";

const ADMIN_EMAIL = "narinha@admin.com";

type Registration = {
  id: string;
  purchaserName: string;
  partnerName?: string;
  ticketType: "single" | "couple";
  amount: 50 | 70;
  guestCount: 1 | 2;
  paymentStatus: "pending" | "confirmed" | "rejected";
  createdAt?: { seconds?: number };
};

function authErrorMessage(code?: string) {
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "E-mail ou senha incorretos.";
  }
  if (code === "auth/too-many-requests") return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (code === "auth/unauthorized-domain") return "Este endereço ainda precisa ser autorizado no Firebase Authentication.";
  return "Não foi possível entrar agora. Tente novamente.";
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(Boolean(auth));
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filter, setFilter] = useState<"pending" | "confirmed" | "rejected">("pending");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;

    const firebaseAuth = auth;
    return onAuthStateChanged(firebaseAuth, async (user) => {
      const isAllowedAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
      if (user && !isAllowedAdmin) await signOut(firebaseAuth);
      if (!isAllowedAdmin) setRegistrations([]);
      setAuthenticated(isAllowedAdmin);
      setCheckingSession(false);
    });
  }, []);

  useEffect(() => {
    if (!authenticated || !db) return;

    return onSnapshot(
      collection(db, "registrations"),
      (snapshot) => {
        const rows = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<Registration, "id">),
        }));
        rows.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setRegistrations(rows);
        setError("");
      },
      () => setError("Não foi possível consultar as confirmações. Verifique se as regras do Firestore foram publicadas."),
    );
  }, [authenticated]);

  const visibleRegistrations = registrations.filter((item) => item.paymentStatus === filter);
  const stats = useMemo(() => ({
    pending: registrations.filter((item) => item.paymentStatus === "pending").length,
    confirmedGuests: registrations.filter((item) => item.paymentStatus === "confirmed").reduce((total, item) => total + item.guestCount, 0),
    confirmedRevenue: registrations.filter((item) => item.paymentStatus === "confirmed").reduce((total, item) => total + item.amount, 0),
  }), [registrations]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!auth || !firebaseConfigured) {
      setError("A conexão com o Firebase não está disponível.");
      return;
    }
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setError("Este usuário não possui acesso administrativo.");
      return;
    }

    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
      if (credential.user.email?.toLowerCase() !== ADMIN_EMAIL) {
        await signOut(auth);
        throw new Error("not-admin");
      }
      setPassword("");
      setAuthenticated(true);
    } catch (loginError) {
      const code = typeof loginError === "object" && loginError && "code" in loginError
        ? String((loginError as { code?: string }).code)
        : undefined;
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (auth) await signOut(auth);
    setRegistrations([]);
    setAuthenticated(false);
  };

  const setStatus = async (id: string, status: "confirmed" | "rejected") => {
    if (!db || !auth?.currentUser || auth.currentUser.email?.toLowerCase() !== ADMIN_EMAIL) {
      setError("Sua sessão administrativa expirou. Entre novamente.");
      return;
    }

    setUpdating(id);
    setError("");
    try {
      await updateDoc(doc(db, "registrations", id), {
        paymentStatus: status,
        reviewedAt: serverTimestamp(),
        confirmedAt: status === "confirmed" ? serverTimestamp() : null,
      });
    } catch {
      setError("Não foi possível atualizar esta solicitação. Verifique as regras do Firestore.");
    } finally {
      setUpdating(null);
    }
  };

  if (checkingSession) {
    return <main className="admin-page"><div className="admin-loading">Verificando acesso…</div></main>;
  }

  if (!authenticated) {
    return (
      <main className="admin-page admin-login-page">
        <Link className="back-link" href="/">← Voltar ao convite</Link>
        <section className="login-card">
          <span className="admin-mark">BR</span>
          <span className="eyebrow blue">Acesso restrito</span>
          <h1>Área do organizador</h1>
          <p>Entre com o usuário administrador do Firebase para conferir pagamentos e liberar as presenças.</p>
          <form onSubmit={login}>
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            </label>
            <label className="field">
              <span>Senha</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            {error && <p className="form-message" role="alert">{error}</p>}
            <button className="button button-green submit-button" type="submit" disabled={loading || !firebaseConfigured}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><span className="admin-mark small">BR</span><div><small>Painel do evento</small><strong>Convite Narinha</strong></div></div>
        <button className="logout-button" onClick={logout}>Sair</button>
      </header>
      <section className="admin-content">
        <div className="admin-title">
          <div><span className="eyebrow blue">Gestão de presenças</span><h1>Confirmações</h1></div>
          <div className="admin-title-actions"><Link className="view-invite" href="/">Ver convite ↗</Link></div>
        </div>
        <div className="stats-grid">
          <article><span>Pendentes</span><strong>{stats.pending}</strong><small>Aguardando conferência</small></article>
          <article><span>Pessoas confirmadas</span><strong>{stats.confirmedGuests}</strong><small>Individual + casais</small></article>
          <article><span>Total recebido</span><strong>R$ {stats.confirmedRevenue}</strong><small>Somente pagamentos aprovados</small></article>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-panel">
          <div className="filter-tabs" role="tablist" aria-label="Filtrar solicitações">
            <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Pendentes <span>{stats.pending}</span></button>
            <button className={filter === "confirmed" ? "active" : ""} onClick={() => setFilter("confirmed")}>Confirmados</button>
            <button className={filter === "rejected" ? "active" : ""} onClick={() => setFilter("rejected")}>Recusados</button>
          </div>
          <div className="request-list">
            {visibleRegistrations.length === 0 ? <p className="empty-state">Nenhuma solicitação nesta categoria.</p> : visibleRegistrations.map((item) => (
              <article className="request-card" key={item.id}>
                <div className="request-person"><span className="person-avatar">{item.purchaserName.charAt(0).toUpperCase()}</span><div><strong>{item.ticketType === "couple" ? `${item.purchaserName} e ${item.partnerName}` : item.purchaserName}</strong><small>{item.ticketType === "couple" ? "Ingresso casal · 2 pessoas" : "Ingresso individual · 1 pessoa"}</small></div></div>
                <div className="request-value"><small>Valor informado</small><strong>R$ {item.amount}</strong></div>
                {item.paymentStatus === "pending" ? (
                  <div className="request-actions">
                    <button className="reject-button" disabled={updating === item.id} onClick={() => setStatus(item.id, "rejected")}>Não recebido</button>
                    <button className="confirm-button" disabled={updating === item.id} onClick={() => setStatus(item.id, "confirmed")}>{updating === item.id ? "Salvando…" : "Confirmar Pix"}</button>
                  </div>
                ) : (
                  <span className={item.paymentStatus === "confirmed" ? "status confirmed-status" : "status rejected-status"}>{item.paymentStatus === "confirmed" ? "✓ Confirmado" : "Recusado"}</span>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
