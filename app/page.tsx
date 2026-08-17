"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db, firebaseConfigured } from "./lib/firebase";

type TicketType = "single" | "couple";

type ConfirmedRegistration = {
  id: string;
  purchaserName: string;
  partnerName?: string;
  ticketType: TicketType;
  guestCount: number;
  confirmedAt?: { seconds?: number };
};

const PIX_KEY = process.env.NEXT_PUBLIC_PIX_KEY?.trim() || "83991922428";
const PIX_RECEIVER = process.env.NEXT_PUBLIC_PIX_RECEIVER ?? "Nome do recebedor";
const MUSIC_URL = process.env.NEXT_PUBLIC_MUSIC_URL?.trim() || "/audio/convite-narinha.mp3";

export default function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [invitationOpened, setInvitationOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ticketType, setTicketType] = useState<TicketType>("single");
  const [purchaserName, setPurchaserName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState<ConfirmedRegistration[]>([]);

  const amount = ticketType === "single" ? 50 : 70;
  const guestCount = ticketType === "single" ? 1 : 2;
  const totalConfirmed = useMemo(
    () => confirmed.reduce((total, item) => total + item.guestCount, 0),
    [confirmed],
  );

  useEffect(() => {
    document.body.classList.toggle("invite-locked", !invitationOpened);
    return () => document.body.classList.remove("invite-locked");
  }, [invitationOpened]);

  const openInvitation = () => {
    if (opening) return;
    setOpening(true);

    const audio = audioRef.current;
    if (audio) {
      audio.volume = 0.72;
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }

    window.setTimeout(() => {
      setInvitationOpened(true);
      setOpening(false);
    }, 420);
  };

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => undefined);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  useEffect(() => {
    if (!db) return;
    const confirmedQuery = query(
      collection(db, "registrations"),
      where("paymentStatus", "==", "confirmed"),
    );
    return onSnapshot(confirmedQuery, (snapshot) => {
      const rows = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...(entry.data() as Omit<ConfirmedRegistration, "id">),
      }));
      rows.sort((a, b) => (b.confirmedAt?.seconds ?? 0) - (a.confirmedAt?.seconds ?? 0));
      setConfirmed(rows);
    });
  }, []);

  const copyPix = async () => {
    let copySucceeded = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(PIX_KEY);
        copySucceeded = true;
      }
    } catch {
      copySucceeded = false;
    }

    if (!copySucceeded) {
      const temporaryInput = document.createElement("textarea");
      temporaryInput.value = PIX_KEY;
      temporaryInput.setAttribute("readonly", "");
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      copySucceeded = document.execCommand("copy");
      document.body.removeChild(temporaryInput);
    }

    if (copySucceeded) {
      setCopied(true);
      setMessage("");
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      setMessage("Não foi possível copiar automaticamente. Selecione o código e copie manualmente.");
    }
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (!purchaserName.trim() || (ticketType === "couple" && !partnerName.trim())) {
      setMessage("Preencha o nome de todos os participantes.");
      return;
    }
    if (!paid) {
      setMessage("Confirme que o Pix já foi realizado antes de solicitar a verificação.");
      return;
    }
    if (!db) {
      setMessage("As confirmações serão liberadas assim que o Firebase for conectado.");
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "registrations"), {
        purchaserName: purchaserName.trim(),
        partnerName: ticketType === "couple" ? partnerName.trim() : "",
        ticketType,
        amount,
        guestCount,
        paymentStatus: "pending",
        paymentDeclaredAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      setSent(true);
      setPurchaserName("");
      setPartnerName("");
      setPaid(false);
    } catch {
      setMessage("Não foi possível enviar agora. Confira sua conexão e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <audio
        ref={audioRef}
        src={MUSIC_URL}
        loop
        playsInline
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {!invitationOpened && (
        <section className={opening ? "invitation-gate is-opening" : "invitation-gate"} aria-label="Abertura do Convite Narinha">
          <div className="invitation-gate-content">
            <span className="invitation-gate-kicker">Narinha te chama</span>
            <h1>convite<br />pra vc</h1>
            <button className="open-invitation-button" type="button" onClick={openInvitation} disabled={opening}>
              <span className="open-play" aria-hidden="true">▶</span>
              <span>{opening ? "Abrindo…" : "Abrir convite"}</span>
            </button>
            <small>Toque para abrir e ligar o som</small>
          </div>
        </section>
      )}

      {invitationOpened && (
        <button className="music-control" onClick={toggleMusic} type="button" aria-label={playing ? "Pausar música" : "Tocar música"}>
          <span aria-hidden="true">{playing ? "♪" : "▶"}</span>
          {playing ? "Música ligada" : "Tocar música"}
        </button>
      )}

      <section className="hero" id="inicio">
        <div className="hero-radiance" aria-hidden="true" />
        <nav className="nav-shell" aria-label="Navegação principal">
          <a className="brand" href="#inicio" aria-label="Início do Convite Narinha">
            <span className="brand-mark">10</span>
            <span>Convite Narinha</span>
          </a>
          <a className="nav-cta" href="#confirmar">Garantir presença</a>
        </nav>

        <div className="hero-content">
          <div className="hero-copy">
            <span className="eyebrow">Uma resenha bem brasileira</span>
            <h1>Brasil no peito, festa no coração!</h1>
            <p className="hero-lead">
              Uma tarde inteira de feijoada, música, alegria e aquela energia que só o brasileiro tem.
            </p>
            <div className="time-card">
              <span className="time-icon" aria-hidden="true">29</span>
              <div className="event-date">
                <small>Data da nossa resenha</small>
                <strong>29 de agosto</strong>
              </div>
              <span className="event-divider" aria-hidden="true" />
              <div className="event-place">
                <small>Local • a partir das 13h</small>
                <strong>Chácara Pôr do Sol</strong>
              </div>
            </div>
            <div className="hero-actions">
              <a className="button button-yellow" href="#confirmar">Quero participar</a>
              <a className="text-link" href="#experiencia">Ver o que vai ter <span>↓</span></a>
            </div>
          </div>

          <div className="collage-stage" aria-label="Colagem brasileira do Convite Narinha">
            <span className="collage-sun" aria-hidden="true" />
            <span className="collage-diamond" aria-hidden="true" />
            <Image className="collage-title" src="/collage/narinha-cutout-v2.png" alt="Narinha em letras de lambe-lambe verde e amarelo" width={1536} height={768} priority />
            <Image className="collage-shirt" src="/collage/camisa-cutout-v2.png" alt="Camisa amarela do Brasil com Narinha e o número 10" width={1024} height={1536} priority />
            <Image className="collage-dog" src="/collage/cachorro-cutout-v2.png" alt="Cachorrinho caramelo com bandana verde e amarela" width={1024} height={1536} priority />
            <span className="paper-note note-one">Feijoada<br /><strong>à vontade</strong></span>
            <span className="paper-note note-two">Música<br /><strong>ao vivo</strong></span>
            <span className="tape tape-one" aria-hidden="true" />
            <span className="tape tape-two" aria-hidden="true" />
          </div>
        </div>

        <div className="dress-banner">
          <span className="dress-icon" aria-hidden="true">★</span>
          <p><strong>Uniforme da resenha:</strong> venha com a camisa da Seleção ou usando as cores do Brasil.</p>
        </div>

        <div className="drink-banner" role="note" aria-label="Aviso importante sobre bebidas">
          <span className="drink-banner-icon" aria-hidden="true">🍻</span>
          <div>
            <strong>Atenção, galera!</strong>
            <p>Cada pessoa deve levar sua própria bebida.</p>
          </div>
        </div>
      </section>

      <section className="experience section" id="experiencia">
        <div className="section-heading">
          <span className="eyebrow blue">Tudo incluso</span>
          <h2>Uma tarde para curtir de verdade</h2>
          <p>Chegue com disposição. A gente cuida do resto.</p>
        </div>
        <div className="experience-grid">
          {[
            ["🌴", "Área de lazer", "Espaço para relaxar e aproveitar a tarde."],
            ["🥘", "Feijoada à vontade", "Comida boa e liberada para todo mundo."],
            ["♫", "Música ao vivo", "Som ao vivo para colocar todo mundo no clima."],
            ["🍹", "Alguns drinks", "Drinks selecionados para brindar o encontro."],
            ["⚽", "Brincadeiras", "Momentos leves para reunir toda a turma."],
            ["☀", "Muita diversão", "Do começo ao fim, sem deixar a animação cair."],
          ].map(([icon, title, description]) => (
            <article className="experience-card" key={title}>
              <span className="experience-icon" aria-hidden="true">{icon}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <div className="party-collage" aria-label="Clima de boteco da festa">
          <Image className="party-crates" src="/collage/caixas.jpg" alt="Caixas coloridas com garrafas no clima de boteco" width={1024} height={1536} />
          <div className="party-copy">
            <span className="scribble">29 AGO • 13H</span>
            <strong>Chega junto,<br />que a mesa é grande.</strong>
            <p>Comida boa, copo gelado e diversão do começo ao fim.</p>
          </div>
          <Image className="party-beer" src="/collage/cerveja.jpg" alt="Copo de cerveja gelada" width={1024} height={1536} />
          <span className="party-star star-one" aria-hidden="true">★</span>
          <span className="party-star star-two" aria-hidden="true">★</span>
        </div>
      </section>

      <section className="tickets section" id="confirmar">
        <div className="ticket-layout">
          <div className="ticket-intro">
            <span className="eyebrow yellow">Confirmação mediante pagamento</span>
            <h2>Escolha seu ingresso</h2>
            <p>
              Dia 29 de agosto, a partir das 13h, na Chácara Pôr do Sol. Selecione a opção, faça o Pix e envie sua solicitação.
            </p>
            <div className="steps-list">
              <div><span>1</span><p><strong>Escolha</strong> individual ou casal</p></div>
              <div><span>2</span><p><strong>Faça o Pix</strong> usando o código</p></div>
              <div><span>3</span><p><strong>Aguarde</strong> a confirmação do organizador</p></div>
            </div>
          </div>

          <form className="payment-card" onSubmit={submitRegistration}>
            <fieldset>
              <legend>1. Como você vem?</legend>
              <div className="ticket-options">
                <label className={ticketType === "single" ? "ticket-option active" : "ticket-option"}>
                  <input type="radio" name="ticket" value="single" checked={ticketType === "single"} onChange={() => setTicketType("single")} />
                  <span>
                    <small>Individual</small>
                    <strong>R$ 50</strong>
                    <em>1 pessoa</em>
                  </span>
                </label>
                <label className={ticketType === "couple" ? "ticket-option active" : "ticket-option"}>
                  <input type="radio" name="ticket" value="couple" checked={ticketType === "couple"} onChange={() => setTicketType("couple")} />
                  <span>
                    <small>Casal</small>
                    <strong>R$ 70</strong>
                    <em>2 pessoas</em>
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>2. Quem vai participar?</legend>
              <label className="field">
                <span>{ticketType === "couple" ? "Nome da primeira pessoa" : "Seu nome completo"}</span>
                <input value={purchaserName} onChange={(event) => setPurchaserName(event.target.value)} placeholder="Digite o nome completo" maxLength={80} required />
              </label>
              {ticketType === "couple" && (
                <label className="field">
                  <span>Nome da segunda pessoa</span>
                  <input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} placeholder="Digite o nome completo" maxLength={80} required />
                </label>
              )}
            </fieldset>

            <fieldset>
              <legend>3. Faça o Pix de R$ {amount}</legend>
              <div className="pix-box">
                <div className="pix-head">
                  <div><span className="pix-symbol">◆</span><strong>Chave Pix</strong></div>
                  <small>Recebedor: {PIX_RECEIVER}</small>
                </div>
                <code>{PIX_KEY}</code>
                <button className="copy-button" type="button" onClick={copyPix}>{copied ? "Chave copiada!" : "Copiar chave Pix"}</button>
              </div>
              <label className="paid-check">
                <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />
                <span>Já fiz o Pix de <strong>R$ {amount}</strong> e quero solicitar a confirmação.</span>
              </label>
            </fieldset>

            {message && <p className="form-message" role="alert">{message}</p>}
            {sent ? (
              <div className="success-box" role="status">
                <span>✓</span>
                <div><strong>Solicitação enviada!</strong><p>Agora é só aguardar a conferência do pagamento.</p></div>
              </div>
            ) : (
              <button className="button button-green submit-button" type="submit" disabled={submitting || !firebaseConfigured}>
                {submitting ? "Enviando…" : "Solicitar confirmação"}
              </button>
            )}
            {!firebaseConfigured && <small className="config-note">A confirmação será habilitada após a conexão do Firebase.</small>}
          </form>
        </div>
      </section>

      <section className="confirmed section" id="confirmados">
        <div className="confirmed-shell">
          <div className="confirmed-top">
            <div>
              <span className="eyebrow yellow">Presenças verificadas</span>
              <h2>Quem já está confirmado</h2>
            </div>
            <div className="confirmed-count">
              <strong>{totalConfirmed}</strong>
              <span>{totalConfirmed === 1 ? "pessoa confirmada" : "pessoas confirmadas"}</span>
            </div>
          </div>
          <div className="confirmed-list">
            {confirmed.length === 0 ? (
              <p className="empty-state">As primeiras confirmações aparecerão aqui.</p>
            ) : confirmed.map((item) => (
              <article className="confirmed-person" key={item.id}>
                <span className="person-avatar">{item.purchaserName.charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{item.ticketType === "couple" ? `${item.purchaserName} e ${item.partnerName}` : item.purchaserName}</strong>
                  <small>{item.guestCount} {item.guestCount === 1 ? "convidado" : "convidados"}</small>
                </div>
                <span className="verified-badge">✓ Confirmado</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-flag" aria-hidden="true"><span /><span /><span /></div>
        <p>Feito para celebrar o melhor do Brasil.</p>
        <a href="/adm">Área do organizador</a>
      </footer>
    </main>
  );
}
3