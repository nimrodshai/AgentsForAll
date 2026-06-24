const FALLBACK_PORTAL_URL = "./portal/";

const elements = {
  senderAvatar: document.querySelector("#senderAvatar"),
  senderName: document.querySelector("#senderName"),
  contactMeta: document.querySelector("#contactMeta"),
  statusPill: document.querySelector("#statusPill"),
  messageThread: document.querySelector("#messageThread"),
  replyInput: document.querySelector("#replyInput"),
  sendButton: document.querySelector("#sendButton"),
  editButton: document.querySelector("#editButton"),
  notice: document.querySelector("#notice"),
};

const params = new URLSearchParams(window.location.search);

function getParam(name, fallback = "") {
  const value = params.get(name);
  return value === null || value === "" ? fallback : value;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function humanizeTimestamp(value) {
  if (!value) {
    return "just now";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function makeInitials(name) {
  const parts = normalizeText(name)
    .split(/\s+/)
    .filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "A").toUpperCase();
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeDirection(value) {
  const direction = normalizeText(value).toLowerCase();
  if (!direction) {
    return "context";
  }

  if (["inbound", "incoming", "customer", "client", "user", "received"].includes(direction)) {
    return "incoming";
  }

  if (["outbound", "outgoing", "owner", "you", "me", "assistant", "bot", "sent"].includes(direction)) {
    return "outgoing";
  }

  if (["context", "note", "saved", "history"].includes(direction)) {
    return "context";
  }

  return "context";
}

function normalizeHistoryLine(line, senderName) {
  const text = normalizeText(line);
  if (!text) {
    return null;
  }

  const match = text.match(/^([^:]{1,48}):\s*(.+)$/);
  if (!match) {
    return {
      direction: "context",
      text,
    };
  }

  const speaker = normalizeText(match[1]);
  const message = normalizeText(match[2]);
  if (!message) {
    return null;
  }

  const speakerKey = speaker.toLowerCase();
  if (["you", "me", "owner", "assistant", "bot"].includes(speakerKey)) {
    return {
      direction: "outgoing",
      text: message,
    };
  }

  if (senderName && speakerKey === normalizeText(senderName).toLowerCase()) {
    return {
      direction: "incoming",
      text: message,
    };
  }

  return {
    direction: "incoming",
    text: message,
  };
}

function normalizeHistoryItem(item, senderName) {
  if (typeof item === "string") {
    return normalizeHistoryLine(item, senderName);
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const text = normalizeText(item.text ?? item.message ?? item.content ?? item.body ?? "");
  if (!text) {
    return null;
  }

  const direction = normalizeDirection(item.direction ?? item.role ?? item.type ?? item.kind ?? "");
  const sender = normalizeText(item.senderName ?? item.sender_name ?? item.name ?? "");

  if (direction === "context") {
    return {
      direction: "context",
      text,
    };
  }

  if (direction === "outgoing") {
    return {
      direction: "outgoing",
      text,
    };
  }

  if (sender && sender.toLowerCase() === normalizeText(senderName).toLowerCase()) {
    return {
      direction: "incoming",
      text,
    };
  }

  return {
    direction: "incoming",
    text,
  };
}

function parseHistory(rawValue, senderName) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return [];
  }

  const parsed = parseJson(raw);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizeHistoryItem(item, senderName)).filter(Boolean);
  }

  if (parsed && typeof parsed === "object" && Array.isArray(parsed.messages)) {
    return parsed.messages.map((item) => normalizeHistoryItem(item, senderName)).filter(Boolean);
  }

  let nextPlainDirection = "incoming";
  return raw
    .split(/\r?\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .map((line) => {
      const item = normalizeHistoryLine(line, senderName);
      if (item && item.direction !== "context") {
        return item;
      }

      const resolved = {
        direction: nextPlainDirection,
        text: item?.text || line,
      };
      nextPlainDirection = nextPlainDirection === "incoming" ? "outgoing" : "incoming";
      return resolved;
    })
    .filter(Boolean);
}

function buildState() {
  const approvalId = getParam("approvalId", `local-${Math.random().toString(16).slice(2, 8)}`);
  const clientName = getParam("clientName", "Lalo");
  const senderName = getParam("senderName", "Jim Hopper");
  const senderWaId = getParam("senderWaId", "15551230000");
  const latestMessage = getParam("latestMessage", "Hey, are you available today?");
  const suggestedReply = getParam("suggestedReply", "One sec, checking my calendar right now.");
  const storedReply = getParam("replyDraft", suggestedReply) || suggestedReply;
  const returnUrl = getParam("returnUrl", FALLBACK_PORTAL_URL);
  const historySource = getParam("messages", getParam("context", getParam("threadContext", "")));

  return {
    approvalId,
    clientName,
    latestMessage,
    history: parseHistory(historySource, senderName),
    returnUrl,
    senderName,
    senderWaId,
    sent: false,
    sentAt: "",
    suggestedReply,
    replyDraft: storedReply,
    notice: "",
  };
}

const state = buildState();

function setNotice(message) {
  state.notice = message;
  elements.notice.textContent = message;
  elements.notice.hidden = !message;
}

function renderMessage(item) {
  const row = document.createElement("div");
  row.className = `message ${item.direction}`;

  const bubble = document.createElement("div");
  bubble.className = `bubble ${item.direction}`;
  bubble.textContent = item.text;
  row.append(bubble);

  return row;
}

function renderThread() {
  const fragment = document.createDocumentFragment();

  if (state.history.length > 0) {
    for (const item of state.history) {
      fragment.append(renderMessage(item));
    }
  }

  fragment.append(
    renderMessage({
      direction: "incoming",
      text: state.latestMessage,
    }),
  );

  if (state.sent) {
    fragment.append(
      renderMessage({
        direction: "outgoing",
        text: normalizeText(state.replyDraft || state.suggestedReply),
      }),
    );
  }

  elements.messageThread.replaceChildren(fragment);
}

function render() {
  const isSent = state.sent;
  const replyText = normalizeText(state.replyDraft || state.suggestedReply);

  document.title = `${state.senderName} · Approval chat`;
  elements.senderAvatar.textContent = makeInitials(state.senderName);
  elements.senderName.textContent = state.senderName;
  elements.contactMeta.textContent = "";
  elements.contactMeta.hidden = true;
  elements.statusPill.textContent = isSent ? "Sent locally" : "Pending";
  elements.statusPill.className = `pill ${isSent ? "sent" : "pending"}`;
  elements.replyInput.value = replyText;
  elements.replyInput.disabled = isSent;
  elements.sendButton.textContent = isSent ? "Sent" : "Send";
  elements.sendButton.disabled = isSent || !replyText;
  elements.editButton.classList.toggle("is-hidden", !isSent);

  renderThread();

  if (!state.notice) {
    if (isSent) {
      setNotice(`Sent locally at ${humanizeTimestamp(state.sentAt)}.`);
    } else {
      elements.notice.textContent = "";
      elements.notice.hidden = true;
    }
  } else {
    elements.notice.textContent = state.notice;
    elements.notice.hidden = !state.notice;
  }
}

function handleInput() {
  const wasSent = state.sent;
  state.replyDraft = elements.replyInput.value;
  state.sent = false;
  state.sentAt = "";
  state.notice = "";
  elements.sendButton.disabled = !normalizeText(state.replyDraft);
  elements.sendButton.textContent = "Send";
  elements.editButton.classList.add("is-hidden");
  elements.replyInput.disabled = false;
  elements.notice.textContent = "";
  elements.notice.hidden = true;

  if (wasSent) {
    renderThread();
  }
}

function sendReply() {
  const text = normalizeText(elements.replyInput.value);
  if (!text) {
    setNotice("Reply text cannot be empty.");
    return;
  }

  state.replyDraft = text;
  state.sent = true;
  state.sentAt = nowIso();
  state.notice = "";
  render();
}

function reopenDraft() {
  state.sent = false;
  state.sentAt = "";
  state.notice = "";
  render();

  window.requestAnimationFrame(() => {
    elements.replyInput.focus();
    if (typeof elements.replyInput.select === "function") {
      elements.replyInput.select();
    }
  });
}

function bindEvents() {
  elements.replyInput.addEventListener("input", handleInput);
  elements.sendButton.addEventListener("click", sendReply);
  elements.editButton.addEventListener("click", reopenDraft);
  elements.replyInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendReply();
    }
  });
}

bindEvents();
render();
