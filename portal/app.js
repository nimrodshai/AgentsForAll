const STORAGE_PREFIX = "agents-for-all";
const AUTH_SESSION_KEY = `${STORAGE_PREFIX}.portal.auth-session`;
const AUTH_CHALLENGE_KEY = `${STORAGE_PREFIX}.portal.auth-challenge`;
const CLIENT_STATE_PREFIX = `${STORAGE_PREFIX}.client-state`;
const LAST_PRIMARY_TAB_KEY = `${STORAGE_PREFIX}.portal.last-primary-tab`;
// Keep the demo code hint limited to local/dev previews.
const DEMO_MODE =
  window.location.protocol === "file:" ||
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const OTP_TTL_MS = 10 * 60 * 1000;
const SETTINGS_PANEL_ANIMATION_MS = 320;
const VALID_TABS = new Set(["features", "preview", "simulator", "settings"]);
const TAB_ALIASES = new Map([["guidance", "features"]]);
const VALID_SETTINGS_MODES = new Set(["account", "preferences"]);

const DEFAULT_PROMPT = {
  toneGuidance: "Warm, direct, and practical. Keep replies human, short, and grounded.",
  replyRules:
    "Acknowledge the request first. Ask one clarifying question only when needed. Never guess prices or availability.",
  businessNotes:
    "Service area, hours, pricing hints, and any details the agent should know before replying.",
  escalationGuidance:
    "Hand off when the customer is upset, the answer needs a human decision, or the request is urgent.",
  approvalGuidance:
    "When a WhatsApp message arrives, format the bot message with who sent it, the latest message, and one suggested reply. Keep send manual and make Edit open the hosted approval page with the draft prefilled.",
  exampleReplies:
    "Good: \"Yes, I can help. What is the address?\"\nBad: \"Sure, anything is possible.\"",
  responseStyle: "balanced",
  scenario: "approval",
};

const DEFAULT_SETTINGS = {
  displayName: "",
  workspaceName: "Agent guidance studio",
  timezone: defaultTimeZone(),
};

const DEFAULT_FEATURES = [
  {
    id: "whatsapp-business-reply-suggestion-assistant",
    name: "WhatsApp Reply Approval Bot",
    description:
      "Drafts suggested replies, posts them to an internal approval bot, and opens a hosted edit page for revised approval.",
    channel: "WhatsApp",
    mode: "Approval bot",
    status: "Active",
    approvalUrl: "https://approval.example.com/review",
    prompt: { ...DEFAULT_PROMPT },
  },
];

const DEFAULT_SIMULATOR = {
  composer: {
    scenario: "approval",
    senderName: "Jim Hopper",
    senderWaId: "15551230000",
    latestMessage: "Hey, are you available today?",
    threadContext:
      "Customer asked about availability last week.\nOwner said afternoons are easier.",
    approvalUrl: "https://approval.example.com/review",
  },
  approvals: [],
  selectedApprovalId: "",
};

function normalizeTab(tab) {
  return TAB_ALIASES.get(String(tab || "").trim()) || String(tab || "").trim();
}

const SCENARIOS = {
  approval: {
    label: "WhatsApp approval bot example",
    sender: "Jim Hopper",
    user: "Hey, are you available today?",
    ask: "One sec, checking my calendar right now.",
    exactReply: true,
  },
  availability: {
    label: "New lead asking about availability",
    sender: "Maya Cohen",
    user: "Hi, are you available tomorrow afternoon?",
    ask: "Let me check what works best. What address should I look at?",
  },
  pricing: {
    label: "Customer asking about price",
    sender: "Oren Levy",
    user: "How much would it cost to replace the lock?",
    ask: "I can give you a proper price once I know the door type and lock model.",
  },
  reschedule: {
    label: "Existing client wants to reschedule",
    sender: "Dana Klein",
    user: "Can we move the appointment by one day?",
    ask: "Yes, I can check that. What time window would work for you?",
  },
  urgent: {
    label: "Urgent request that should escalate",
    sender: "Customer",
    user: "The door is stuck and I need help right now.",
    ask: "I am flagging this for immediate human follow-up so someone can help you as fast as possible.",
  },
};

const SIMULATOR_PRESETS = {
  approval: {
    senderName: SCENARIOS.approval.sender,
    senderWaId: "15551230000",
    latestMessage: SCENARIOS.approval.user,
    threadContext:
      "Customer asked about availability last week.\nOwner said afternoons are easier.",
    approvalUrl: DEFAULT_FEATURES[0].approvalUrl,
  },
  availability: {
    senderName: SCENARIOS.availability.sender,
    senderWaId: "15551230001",
    latestMessage: SCENARIOS.availability.user,
    threadContext:
      "Lead came in from the website yesterday.\nCustomer wants a window for tomorrow afternoon.",
    approvalUrl: DEFAULT_FEATURES[0].approvalUrl,
  },
  pricing: {
    senderName: SCENARIOS.pricing.sender,
    senderWaId: "15551230002",
    latestMessage: SCENARIOS.pricing.user,
    threadContext:
      "Customer shared a photo of the lock.\nNeeds a proper quote after the door type is confirmed.",
    approvalUrl: DEFAULT_FEATURES[0].approvalUrl,
  },
  reschedule: {
    senderName: SCENARIOS.reschedule.sender,
    senderWaId: "15551230003",
    latestMessage: SCENARIOS.reschedule.user,
    threadContext:
      "Appointment was booked for Wednesday morning.\nCustomer needs a new time window.",
    approvalUrl: DEFAULT_FEATURES[0].approvalUrl,
  },
  urgent: {
    senderName: SCENARIOS.urgent.sender,
    senderWaId: "15551230004",
    latestMessage: SCENARIOS.urgent.user,
    threadContext:
      "The door has been stuck since early morning.\nThis should escalate to a person immediately.",
    approvalUrl: DEFAULT_FEATURES[0].approvalUrl,
  },
};

const state = {
  activeTab: "features",
  settingsMode: "account",
  settingsOpen: false,
  menuOpen: false,
  selectedFeatureId: null,
  selectedSimulatorId: null,
  lastPrimaryTab: normalizeTab(loadJson(LAST_PRIMARY_TAB_KEY, "features")) || "features",
};

let settingsPanelOpenFrame = null;
let settingsPanelCloseTimer = null;

const elements = {
  authView: document.querySelector("#authView"),
  authCard: document.querySelector("#authCard"),
  appView: document.querySelector("#appView"),
  emailInput: document.querySelector("#emailInput"),
  sendCodeButton: document.querySelector("#sendCodeButton"),
  otpPanel: document.querySelector("#otpPanel"),
  otpDigits: Array.from(document.querySelectorAll(".otp-digit")),
  changeEmailButton: document.querySelector("#changeEmailButton"),
  authMessage: document.querySelector("#authMessage"),
  demoCodeText: document.querySelector("#demoCodeText"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  workspaceSubtitle: document.querySelector("#workspaceSubtitle"),
  saveState: document.querySelector("#saveState"),
  featureList: document.querySelector("#featureList"),
  featureStudioPanel: document.querySelector("#featureStudioPanel"),
  backToFeaturesButton: document.querySelector("#backToFeaturesButton"),
  featureStudioStatus: document.querySelector("#featureStudioStatus"),
  featureStudioTitle: document.querySelector("#featureStudioTitle"),
  featureStudioDescription: document.querySelector("#featureStudioDescription"),
  featureStudioChannel: document.querySelector("#featureStudioChannel"),
  featureStudioMode: document.querySelector("#featureStudioMode"),
  accountMenuButton: document.querySelector("#accountMenuButton"),
  accountMenu: document.querySelector("#accountMenu"),
  accountAvatar: document.querySelector("#accountAvatar"),
  accountLabel: document.querySelector("#accountLabel"),
  tabButtons: Array.from(document.querySelectorAll(".tab-button")),
  featuresPanel: document.querySelector("#featuresPanel"),
  previewPanel: document.querySelector("#previewPanel"),
  simulatorPanel: document.querySelector("#simulatorPanel"),
  settingsPanel: document.querySelector("#settingsPanel"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  toneGuidance: document.querySelector("#toneGuidance"),
  responseStyle: document.querySelector("#responseStyle"),
  replyRules: document.querySelector("#replyRules"),
  businessNotes: document.querySelector("#businessNotes"),
  escalationGuidance: document.querySelector("#escalationGuidance"),
  exampleReplies: document.querySelector("#exampleReplies"),
  approvalGuidance: document.querySelector("#approvalGuidance"),
  approvalUrlInput: document.querySelector("#approvalUrlInput"),
  scenarioSelect: document.querySelector("#scenarioSelect"),
  scenarioMessage: document.querySelector("#scenarioMessage"),
  responseMessage: document.querySelector("#responseMessage"),
  approvalSender: document.querySelector("#approvalSender"),
  approvalUrlNote: document.querySelector("#approvalUrlNote"),
  compiledPrompt: document.querySelector("#compiledPrompt"),
  copyButton: document.querySelector("#copyButton"),
  simulatorPresetSelect: document.querySelector("#simulatorPresetSelect"),
  simulatorSenderNameInput: document.querySelector("#simulatorSenderNameInput"),
  simulatorSenderWaIdInput: document.querySelector("#simulatorSenderWaIdInput"),
  simulatorMessageInput: document.querySelector("#simulatorMessageInput"),
  simulatorContextInput: document.querySelector("#simulatorContextInput"),
  simulatorApprovalUrlInput: document.querySelector("#simulatorApprovalUrlInput"),
  simulatorQueueList: document.querySelector("#simulatorQueueList"),
  simulatorQueueCount: document.querySelector("#simulatorQueueCount"),
  simulatorDetailTitle: document.querySelector("#simulatorDetailTitle"),
  simulatorDetailStatus: document.querySelector("#simulatorDetailStatus"),
  simulatorDetailSender: document.querySelector("#simulatorDetailSender"),
  simulatorDetailMessage: document.querySelector("#simulatorDetailMessage"),
  simulatorDetailReply: document.querySelector("#simulatorDetailReply"),
  simulatorReplyInput: document.querySelector("#simulatorReplyInput"),
  simulatorContextList: document.querySelector("#simulatorContextList"),
  simulatorApprovalNote: document.querySelector("#simulatorApprovalNote"),
  simulatorQueueButton: document.querySelector("#simulatorQueueButton"),
  simulatorLoadSampleButton: document.querySelector("#simulatorLoadSampleButton"),
  simulatorEditButton: document.querySelector("#simulatorEditButton"),
  simulatorSendButton: document.querySelector("#simulatorSendButton"),
  simulatorResetButton: document.querySelector("#simulatorResetButton"),
  settingsButtons: Array.from(document.querySelectorAll(".subtab-button")),
  accountSettingsPane: document.querySelector("#accountSettingsPane"),
  preferencesSettingsPane: document.querySelector("#preferencesSettingsPane"),
  signedInEmail: document.querySelector("#signedInEmail"),
  signOutButton: document.querySelector("#signOutButton"),
  displayNameInput: document.querySelector("#displayNameInput"),
  workspaceNameInput: document.querySelector("#workspaceNameInput"),
  timezoneSelect: document.querySelector("#timezoneSelect"),
};

let authSession = loadJson(AUTH_SESSION_KEY, null);
let authChallenge = loadJson(AUTH_CHALLENGE_KEY, null);
let activeEmail = normalizeEmail(authSession?.email || "");
let clientState = loadClientState(activeEmail);
state.selectedSimulatorId = clientState.simulator.selectedApprovalId || null;

if (authSession?.signedIn) {
  authChallenge = null;
  persistJson(AUTH_CHALLENGE_KEY, null);
}

function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function loadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function persistJson(key, value) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the app usable when local storage is restricted.
  }
}

function getClientKey(email) {
  const safeEmail = normalizeEmail(email) || "guest";
  return `${CLIENT_STATE_PREFIX}:${safeEmail}`;
}

function loadClientState(email) {
  const saved = loadJson(getClientKey(email), null) || {};
  const savedPrompt = saved.guidance || {};
  const savedSimulator = saved.simulator || {};
  const featuresSource = Array.isArray(saved.features) && saved.features.length
    ? saved.features
    : DEFAULT_FEATURES;
  const features = featuresSource.map((feature, index) => {
    const fallbackPrompt = index === 0 ? { ...DEFAULT_PROMPT, ...savedPrompt } : DEFAULT_PROMPT;
    const isLegacyDefaultFeature = index === 0
      && String(feature?.id || "") === DEFAULT_FEATURES[0].id
      && String(feature?.name || "") === "WhatsApp Business Reply Suggestion Assistant"
      && String(feature?.mode || "") === "suggestion_only";

    return {
      id: String(feature?.id || `feature-${index + 1}`),
      name: isLegacyDefaultFeature
        ? DEFAULT_FEATURES[0].name
        : String(feature?.name || `Feature ${index + 1}`),
      description: isLegacyDefaultFeature
        ? DEFAULT_FEATURES[0].description
        : String(feature?.description || ""),
      channel: isLegacyDefaultFeature
        ? DEFAULT_FEATURES[0].channel
        : String(feature?.channel || "Web"),
      mode: isLegacyDefaultFeature
        ? DEFAULT_FEATURES[0].mode
        : String(feature?.mode || "Default"),
      status: String(feature?.status || "Active"),
      approvalUrl: String(feature?.approvalUrl || DEFAULT_FEATURES[0].approvalUrl || ""),
      prompt: normalizePrompt(feature?.prompt || {}, fallbackPrompt),
    };
  });
  const settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
  const workspaceName = String(settings.workspaceName || "").trim().toLowerCase();
  const simulator = normalizeSimulatorState(savedSimulator);

  if (!settings.workspaceName || workspaceName === "guidance studio") {
    settings.workspaceName = DEFAULT_SETTINGS.workspaceName;
  }

  return {
    settings,
    features,
    simulator,
  };
}

function normalizePrompt(prompt = {}, fallback = DEFAULT_PROMPT) {
  const base = { ...DEFAULT_PROMPT, ...(fallback || {}), ...(prompt || {}) };
  const responseStyle = String(base.responseStyle || DEFAULT_PROMPT.responseStyle).toLowerCase();
  const scenario = SCENARIOS[base.scenario] ? base.scenario : DEFAULT_PROMPT.scenario;

  return {
    toneGuidance: String(base.toneGuidance || DEFAULT_PROMPT.toneGuidance),
    replyRules: String(base.replyRules || DEFAULT_PROMPT.replyRules),
    businessNotes: String(base.businessNotes || DEFAULT_PROMPT.businessNotes),
    escalationGuidance: String(base.escalationGuidance || DEFAULT_PROMPT.escalationGuidance),
    approvalGuidance: String(base.approvalGuidance || DEFAULT_PROMPT.approvalGuidance),
    exampleReplies: String(base.exampleReplies || DEFAULT_PROMPT.exampleReplies),
    responseStyle: ["short", "balanced", "detailed"].includes(responseStyle)
      ? responseStyle
      : DEFAULT_PROMPT.responseStyle,
    scenario,
  };
}

function getFeatureById(featureId) {
  return clientState.features.find((feature) => feature.id === featureId) || null;
}

function getSelectedFeature() {
  return getFeatureById(state.selectedFeatureId) || clientState.features[0] || DEFAULT_FEATURES[0];
}

function getSelectedPrompt() {
  return getSelectedFeature()?.prompt || { ...DEFAULT_PROMPT };
}

function persistClientState() {
  persistJson(getClientKey(activeEmail), clientState);
}

function capitalizeWords(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveDisplayName(email) {
  const localPart = normalizeEmail(email).split("@")[0] || "";
  const readable = localPart.replace(/[._-]+/g, " ").trim();
  return readable ? capitalizeWords(readable) : "Client";
}

function getDisplayName() {
  return clientState.settings.displayName.trim() || deriveDisplayName(activeEmail);
}

function getWorkspaceName() {
  const workspaceName = clientState.settings.workspaceName.trim();
  if (!workspaceName) {
    return DEFAULT_SETTINGS.workspaceName;
  }

  if (workspaceName.toLowerCase() === "guidance studio") {
    return DEFAULT_SETTINGS.workspaceName;
  }

  return workspaceName;
}

function getAvatarLabel() {
  const source = getDisplayName() || activeEmail;
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("");
  return (initials || "G").toUpperCase();
}

function setView(view) {
  document.body.dataset.view = view;
  if (view !== "app") {
    delete document.body.dataset.modal;
  }
  elements.authView.classList.toggle("is-hidden", view !== "auth");
  elements.appView.classList.toggle("is-hidden", view !== "app");
}

function setStatus(message) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  elements.saveState.textContent = `${message} · ${time}`;
}

function setHashForTab(tab, itemId = null) {
  const normalizedTab = normalizeTab(tab);
  const url = new URL(window.location.href);
  url.hash = itemId && (normalizedTab === "features" || normalizedTab === "simulator")
    ? `${normalizedTab}/${encodeURIComponent(itemId)}`
    : normalizedTab;
  window.history.replaceState({}, "", url);
}

function clearHash() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState({}, "", url);
}

function resolveRouteFromHash() {
  const hash = window.location.hash.replace(/^#/, "").trim();

  if (!hash) {
    return { tab: null, featureId: null };
  }

  const [rawTab, ...rest] = hash.split("/");
  const normalized = normalizeTab(rawTab);

  if ((normalized === "features" || normalized === "simulator") && rest.length) {
    return {
      tab: normalized,
      featureId: decodeURIComponent(rest.join("/")),
    };
  }

  if (VALID_TABS.has(normalized)) {
    return { tab: normalized, featureId: null };
  }

  return { tab: null, featureId: null };
}

function persistLastPrimaryTab() {
  persistJson(LAST_PRIMARY_TAB_KEY, state.lastPrimaryTab);
}

function openSettings(mode = state.settingsMode) {
  if (VALID_SETTINGS_MODES.has(mode)) {
    state.settingsMode = mode;
  }

  state.selectedFeatureId = null;

  if (state.activeTab !== "settings" && VALID_TABS.has(state.activeTab)) {
    state.lastPrimaryTab = state.activeTab;
    persistLastPrimaryTab();
  }

  state.settingsOpen = true;
  closeMenu();
  setHashForTab("settings");
  renderApp();
}

function closeSettings() {
  state.settingsOpen = false;
  state.activeTab = VALID_TABS.has(state.lastPrimaryTab) && state.lastPrimaryTab !== "settings"
    ? state.lastPrimaryTab
    : "features";
  state.selectedFeatureId = null;
  state.lastPrimaryTab = state.activeTab;
  persistLastPrimaryTab();
  closeMenu();
  setHashForTab(state.activeTab);
  renderApp();
}

function setActiveTab(tab, options = {}) {
  const nextTab = normalizeTab(tab);

  if (nextTab === "settings") {
    openSettings(options.settingsMode || state.settingsMode);
    return;
  }

  if (!VALID_TABS.has(nextTab)) {
    return;
  }

  state.activeTab = nextTab;
  state.lastPrimaryTab = nextTab;
  persistLastPrimaryTab();
  state.settingsOpen = false;
  state.selectedFeatureId = null;
  state.selectedSimulatorId = null;
  if (options.settingsMode && VALID_SETTINGS_MODES.has(options.settingsMode)) {
    state.settingsMode = options.settingsMode;
  }

  if (options.syncHash !== false) {
    setHashForTab(nextTab);
  }

  closeMenu();
  renderApp();
}

function setSettingsMode(mode, options = {}) {
  if (!VALID_SETTINGS_MODES.has(mode)) {
    return;
  }

  state.settingsMode = mode;
  if (options.openSettings !== false) {
    openSettings(mode);
    return;
  }

  closeMenu();
  renderApp();
}

function toggleMenu(force) {
  state.menuOpen = typeof force === "boolean" ? force : !state.menuOpen;
  elements.accountMenu.classList.toggle("is-hidden", !state.menuOpen);
  elements.accountMenuButton.setAttribute("aria-expanded", String(state.menuOpen));
}

function closeMenu() {
  toggleMenu(false);
}

function splitLines(value) {
  return String(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function textHasAny(text, needles) {
  const haystack = String(text || "").toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function bulletList(lines) {
  return (lines.length ? lines : [""]).map((line) => `- ${line}`);
}

function buildOpening(toneText) {
  const tone = toneText.toLowerCase();

  if (tone.includes("warm") || tone.includes("friendly")) {
    return "Of course";
  }

  if (tone.includes("direct") || tone.includes("concise") || tone.includes("short")) {
    return "Yes";
  }

  if (tone.includes("calm") || tone.includes("steady")) {
    return "Absolutely";
  }

  return "Sure";
}

function buildResponseText(prompt = getSelectedPrompt()) {
  const scenario = SCENARIOS[prompt.scenario] ?? SCENARIOS.availability;

  if (scenario.exactReply) {
    return scenario.ask;
  }

  const opening = buildOpening(prompt.toneGuidance);
  const style = prompt.responseStyle;

  if (style === "detailed") {
    return `${opening}. ${scenario.ask} Happy to help.`;
  }

  return `${opening}. ${scenario.ask}`;
}

function buildCompiledPrompt(feature = getSelectedFeature()) {
  const prompt = feature?.prompt || getSelectedPrompt();
  const lines = [
    "Client feature draft",
    "",
    `Feature: ${feature?.name || "Unassigned feature"}`,
    `Channel: ${feature?.channel || "Web"}`,
    `Mode: ${feature?.mode || "Default"}`,
    "",
    "Reply style",
    `- ${prompt.responseStyle}`,
    "",
    "Tone",
    ...bulletList(splitLines(prompt.toneGuidance)),
    "",
    "Reply rules",
    ...bulletList(splitLines(prompt.replyRules)),
    "",
    "Business notes",
    ...bulletList(splitLines(prompt.businessNotes)),
    "",
    "Escalation rules",
    ...bulletList(splitLines(prompt.escalationGuidance)),
    "",
    "Approval handoff",
    ...bulletList(splitLines(prompt.approvalGuidance)),
    `- Edit opens ${feature?.approvalUrl?.trim() || "the configured approval page"}`,
    "",
    "Example replies",
    ...bulletList(splitLines(prompt.exampleReplies)),
  ];

  return lines.join("\n").trim();
}

function normalizeSimulatorContext(value) {
  const items = Array.isArray(value) ? value : splitLines(value);
  return items.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeSimulatorApproval(record = {}, index = 0) {
  const approvalId = String(record.approvalId || record.id || `local-approval-${index + 1}`);
  const threadContext = normalizeSimulatorContext(record.threadContext || record.context || []);
  const suggestedReply = String(record.suggestedReply || record.replyDraft || "");
  const replyDraft = String(record.replyDraft || suggestedReply || "");
  const status = String(record.status || "pending").toLowerCase() === "sent" ? "sent" : "pending";
  const createdAt = String(record.createdAt || record.created_at || nowIso());
  const updatedAt = String(record.updatedAt || record.updated_at || createdAt);

  return {
    approvalId,
    senderName: String(record.senderName || record.sender_name || "Customer"),
    senderWaId: String(record.senderWaId || record.sender_wa_id || ""),
    latestMessage: String(record.latestMessage || record.latest_message || ""),
    threadContext,
    suggestedReply,
    replyDraft,
    approvalUrl: String(record.approvalUrl || record.approval_url || DEFAULT_SIMULATOR.composer.approvalUrl),
    status,
    createdAt,
    updatedAt,
    sentAt: String(record.sentAt || record.sent_at || ""),
    messageType: String(record.messageType || record.message_type || "text"),
  };
}

function buildLocalSuggestion(messageText, prompt = getSelectedPrompt(), contextLines = []) {
  const latestText = normalizeText(messageText);
  const lowered = latestText.toLowerCase();
  const tone = normalizeText(prompt.toneGuidance).toLowerCase();
  const replyStyle = normalizeText(prompt.responseStyle || "balanced").toLowerCase();

  let reply;

  if (textHasAny(lowered, ["available today", "available tomorrow", "available", "free today", "calendar", "schedule"])) {
    reply = "One sec, checking my calendar right now.";
  } else if (textHasAny(lowered, ["price", "cost", "quote", "how much", "charge", "estimate"])) {
    reply = "I can help with that. I just need a couple of details first so I can give you the right price.";
  } else if (textHasAny(lowered, ["urgent", "asap", "right now", "emergency", "stuck", "critical"])) {
    reply = "I’m flagging this for immediate human follow-up so someone can help as fast as possible.";
  } else if (textHasAny(lowered, ["resched", "move the appointment", "change the time", "another day"])) {
    reply = "Yes, I can check that for you. What time window works best?";
  } else if (textHasAny(lowered, ["thanks", "thank you", "ok", "okay"])) {
    reply = "Of course. I’m checking that now.";
  } else {
    reply = "Thanks for reaching out. Let me check and I’ll get back to you shortly.";
  }

  if ((tone.includes("friendly") || tone.includes("warm")) && reply.startsWith("Thanks for reaching out")) {
    reply = `${reply} Happy to help.`;
  }

  if (replyStyle === "detailed") {
    if (textHasAny(lowered, ["urgent", "emergency"])) {
      reply = `${reply} I’ll make sure a person follows up as soon as possible.`;
    } else if (!reply.endsWith("right away.")) {
      reply = `${reply} Once I confirm, I’ll send the next step right away.`;
    }
  }

  if (contextLines.length > 2 && reply.toLowerCase().includes("check") && !reply.toLowerCase().includes("again")) {
    reply = `${reply} I’ll keep the thread updated.`;
  }

  return reply;
}

function createSimulatorApproval(composer, options = {}) {
  const now = nowIso();
  const approvalId = String(options.approvalId || `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const threadContext = normalizeSimulatorContext(composer.threadContext);
  const suggestedReply = buildLocalSuggestion(composer.latestMessage, getSelectedPrompt(), threadContext);
  const approval = normalizeSimulatorApproval(
    {
      approvalId,
      senderName: composer.senderName,
      senderWaId: composer.senderWaId,
      latestMessage: composer.latestMessage,
      threadContext,
      suggestedReply,
      replyDraft: options.replyDraft || suggestedReply,
      approvalUrl: composer.approvalUrl,
      status: "pending",
      createdAt: options.createdAt || now,
      updatedAt: options.updatedAt || now,
      sentAt: "",
      messageType: "text",
      ...options,
    },
    0,
  );

  approval.suggestedReply = suggestedReply;
  if (!approval.replyDraft) {
    approval.replyDraft = suggestedReply;
  }

  return approval;
}

function buildSimulatorEditUrl(approval) {
  const approvalUrl = String(approval?.approvalUrl || "").trim();

  if (!approvalUrl) {
    return null;
  }

  if (approvalUrl.includes("approval.example.com")) {
    return null;
  }

  try {
    const url = new URL(approvalUrl, window.location.href);
    url.searchParams.set("senderName", approval.senderName || "");
    url.searchParams.set("senderWaId", approval.senderWaId || "");
    url.searchParams.set("latestMessage", approval.latestMessage || "");
    url.searchParams.set("suggestedReply", approval.suggestedReply || "");
    url.searchParams.set("replyDraft", approval.replyDraft || "");
    url.searchParams.set("approvalId", approval.approvalId || "");
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeSimulatorState(savedSimulator = {}) {
  const savedComposer = savedSimulator.composer || {};
  const exampleKey = SIMULATOR_PRESETS[savedComposer.scenario] ? savedComposer.scenario : DEFAULT_SIMULATOR.composer.scenario;
  const preset = SIMULATOR_PRESETS[exampleKey] || SIMULATOR_PRESETS.approval;
  const composer = {
    scenario: exampleKey,
    senderName: String(savedComposer.senderName || preset.senderName || DEFAULT_SIMULATOR.composer.senderName),
    senderWaId: String(savedComposer.senderWaId || preset.senderWaId || DEFAULT_SIMULATOR.composer.senderWaId),
    latestMessage: String(savedComposer.latestMessage || preset.latestMessage || DEFAULT_SIMULATOR.composer.latestMessage),
    threadContext: String(savedComposer.threadContext || preset.threadContext || DEFAULT_SIMULATOR.composer.threadContext),
    approvalUrl: String(savedComposer.approvalUrl || preset.approvalUrl || DEFAULT_SIMULATOR.composer.approvalUrl),
  };

  const approvalsSource = Array.isArray(savedSimulator.approvals) ? savedSimulator.approvals : [];
  const approvals = approvalsSource.length
    ? approvalsSource.map((approval, index) => normalizeSimulatorApproval(approval, index)).filter(Boolean)
    : [createSimulatorApproval(composer, { approvalId: "sample-local-approval" })];

  let selectedApprovalId = String(savedSimulator.selectedApprovalId || approvals[0]?.approvalId || "");
  if (!approvals.some((approval) => approval.approvalId === selectedApprovalId)) {
    selectedApprovalId = approvals[0]?.approvalId || "";
  }

  return {
    composer,
    approvals,
    selectedApprovalId,
  };
}

function getSimulatorState() {
  if (!clientState.simulator) {
    clientState.simulator = normalizeSimulatorState();
  }

  return clientState.simulator;
}

function getSimulatorApprovals() {
  return getSimulatorState().approvals || [];
}

function getSelectedSimulatorApproval() {
  const simulator = getSimulatorState();
  const approvals = simulator.approvals || [];
  if (!approvals.length) {
    return null;
  }

  const selectedId = state.selectedSimulatorId || simulator.selectedApprovalId || approvals[0].approvalId;
  return approvals.find((approval) => approval.approvalId === selectedId) || approvals[0];
}

function ensureSimulatorSelection() {
  const simulator = getSimulatorState();
  const approvals = simulator.approvals || [];
  if (!approvals.length) {
    state.selectedSimulatorId = null;
    simulator.selectedApprovalId = "";
    return null;
  }

  let selectedApproval = approvals.find((approval) => approval.approvalId === state.selectedSimulatorId)
    || approvals.find((approval) => approval.approvalId === simulator.selectedApprovalId)
    || approvals[0];

  if (selectedApproval && selectedApproval.approvalId !== state.selectedSimulatorId) {
    state.selectedSimulatorId = selectedApproval.approvalId;
    simulator.selectedApprovalId = selectedApproval.approvalId;
    persistClientState();
  }

  return selectedApproval || null;
}

function selectSimulatorApproval(approvalId) {
  const simulator = getSimulatorState();
  const approvals = simulator.approvals || [];
  if (!approvals.some((approval) => approval.approvalId === approvalId)) {
    return;
  }

  state.selectedSimulatorId = approvalId;
  simulator.selectedApprovalId = approvalId;
  persistClientState();
  setHashForTab("simulator", approvalId);
  renderApp();
}

function applySimulatorPreset(presetKey) {
  const preset = SIMULATOR_PRESETS[presetKey] || SIMULATOR_PRESETS.approval;
  const simulator = getSimulatorState();
  simulator.composer = {
    scenario: SIMULATOR_PRESETS[presetKey] ? presetKey : "approval",
    senderName: preset.senderName,
    senderWaId: preset.senderWaId,
    latestMessage: preset.latestMessage,
    threadContext: preset.threadContext,
    approvalUrl: preset.approvalUrl,
  };
  persistClientState();
  updateSimulatorComposerFields();
  updateStatusFromSimulator("Loaded sample message");
}

function queueSimulatorApproval() {
  const simulator = getSimulatorState();
  const composer = simulator.composer || { ...DEFAULT_SIMULATOR.composer };
  const approval = createSimulatorApproval(composer);
  simulator.approvals = [approval, ...(simulator.approvals || [])];
  simulator.selectedApprovalId = approval.approvalId;
  state.selectedSimulatorId = approval.approvalId;
  persistClientState();
  setHashForTab("simulator", approval.approvalId);
  renderApp();
  updateStatusFromSimulator("Queued mock approval");
}

function markSimulatorApprovalSent() {
  const simulator = getSimulatorState();
  const approval = getSelectedSimulatorApproval();
  if (!approval || approval.status === "sent") {
    return;
  }

  approval.replyDraft = normalizeText(approval.replyDraft || approval.suggestedReply);
  approval.status = "sent";
  approval.sentAt = nowIso();
  approval.updatedAt = approval.sentAt;
  persistClientState();
  renderApp();
  updateStatusFromSimulator("Marked as sent locally");
}

function updateStatusFromSimulator(message) {
  setStatus(message || "Autosaved locally");
}

function syncSimulatorComposerField(key) {
  return (event) => {
    const simulator = getSimulatorState();
    if (!simulator.composer) {
      simulator.composer = { ...DEFAULT_SIMULATOR.composer };
    }

    simulator.composer[key] = event.target.value;
    persistClientState();
    updateStatusFromSimulator("Simulator draft updated");
  };
}

function syncSimulatorReplyDraft(event) {
  const approval = getSelectedSimulatorApproval();
  if (!approval) {
    return;
  }

  approval.replyDraft = event.target.value;
  approval.updatedAt = nowIso();
  persistClientState();
  updateSimulatorDetail();
  updateSimulatorQueue();
  updateStatusFromSimulator("Reply draft updated");
}

function updateSimulatorComposerFields() {
  const simulator = getSimulatorState();
  const composer = simulator.composer || { ...DEFAULT_SIMULATOR.composer };

  if (elements.simulatorPresetSelect) {
    elements.simulatorPresetSelect.value = composer.scenario;
  }
  if (elements.simulatorSenderNameInput) {
    elements.simulatorSenderNameInput.value = composer.senderName;
  }
  if (elements.simulatorSenderWaIdInput) {
    elements.simulatorSenderWaIdInput.value = composer.senderWaId;
  }
  if (elements.simulatorMessageInput) {
    elements.simulatorMessageInput.value = composer.latestMessage;
  }
  if (elements.simulatorContextInput) {
    elements.simulatorContextInput.value = composer.threadContext;
  }
  if (elements.simulatorApprovalUrlInput) {
    elements.simulatorApprovalUrlInput.value = composer.approvalUrl;
  }
}

function createSimulatorQueueItem(approval, isActive) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "glass-card simulator-queue-item";
  item.classList.toggle("is-active", isActive);
  item.addEventListener("click", () => selectSimulatorApproval(approval.approvalId));

  const head = document.createElement("div");
  head.className = "simulator-queue-head";

  const titleBlock = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = approval.senderName;
  const meta = document.createElement("p");
  meta.className = "simulator-queue-meta";
  meta.textContent = approval.senderWaId ? approval.senderWaId : "No WhatsApp ID yet";
  titleBlock.append(title, meta);

  const status = document.createElement("span");
  status.className = `feature-status ${approval.status === "sent" ? "is-sent" : ""}`.trim();
  status.textContent = approval.status === "sent" ? "Sent" : "Pending";

  head.append(titleBlock, status);

  const message = document.createElement("p");
  message.className = "simulator-queue-copy";
  message.textContent = approval.latestMessage;

  const footer = document.createElement("div");
  footer.className = "simulator-queue-footer";

  const created = document.createElement("span");
  created.textContent = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(approval.createdAt));

  const action = document.createElement("span");
  action.textContent = "Open";

  footer.append(created, action);
  item.append(head, message, footer);
  return item;
}

function updateSimulatorQueue() {
  const approvals = getSimulatorApprovals();
  if (elements.simulatorQueueCount) {
    const pendingCount = approvals.filter((approval) => approval.status !== "sent").length;
    elements.simulatorQueueCount.textContent = `${pendingCount} pending`;
  }

  if (!elements.simulatorQueueList) {
    return;
  }

  if (!approvals.length) {
    const emptyState = document.createElement("article");
    emptyState.className = "glass-card empty-state simulator-empty";
    const title = document.createElement("h3");
    title.textContent = "No mock approvals yet";
    const copy = document.createElement("p");
    copy.textContent = "Use the form to queue a fake WhatsApp message and create a local approval card.";
    emptyState.append(title, copy);
    elements.simulatorQueueList.replaceChildren(emptyState);
    return;
  }

  const selectedApproval = getSelectedSimulatorApproval();
  elements.simulatorQueueList.replaceChildren(
    ...approvals.map((approval) => createSimulatorQueueItem(approval, approval.approvalId === selectedApproval?.approvalId)),
  );
}

function updateSimulatorDetail() {
  const approval = getSelectedSimulatorApproval();
  if (!approval) {
    if (elements.simulatorDetailTitle) {
      elements.simulatorDetailTitle.textContent = "Select a queued approval";
    }
    if (elements.simulatorDetailStatus) {
      elements.simulatorDetailStatus.textContent = "Empty";
    }
    if (elements.simulatorDetailSender) {
      elements.simulatorDetailSender.textContent = "No sender";
    }
    if (elements.simulatorDetailMessage) {
      elements.simulatorDetailMessage.textContent = "Queue a message to see the local approval view.";
    }
    if (elements.simulatorReplyInput) {
      elements.simulatorReplyInput.value = "";
      elements.simulatorReplyInput.disabled = true;
    }
    if (elements.simulatorContextList) {
      elements.simulatorContextList.replaceChildren();
    }
    if (elements.simulatorApprovalNote) {
      elements.simulatorApprovalNote.textContent = "Edit opens the inline draft editor in this simulator.";
    }
    if (elements.simulatorSendButton) {
      elements.simulatorSendButton.disabled = true;
    }
    if (elements.simulatorEditButton) {
      elements.simulatorEditButton.disabled = true;
    }
    return;
  }

  if (elements.simulatorDetailTitle) {
    elements.simulatorDetailTitle.textContent = approval.senderName;
  }
  if (elements.simulatorDetailStatus) {
    elements.simulatorDetailStatus.textContent = approval.status === "sent" ? "Sent" : "Pending";
  }
  if (elements.simulatorDetailSender) {
    elements.simulatorDetailSender.textContent = approval.senderWaId || "Customer";
  }
  if (elements.simulatorDetailMessage) {
    elements.simulatorDetailMessage.textContent = approval.latestMessage;
  }
  if (elements.simulatorReplyInput) {
    elements.simulatorReplyInput.value = approval.replyDraft || approval.suggestedReply || "";
    elements.simulatorReplyInput.disabled = approval.status === "sent";
  }
  if (elements.simulatorContextList) {
    const items = approval.threadContext.length
      ? approval.threadContext.map((line, index) => {
          const row = document.createElement("div");
          row.className = `simulator-context-item ${index === 0 ? "is-primary" : ""}`.trim();
          row.textContent = line;
          return row;
        })
      : [];

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "notice";
      empty.textContent = "No thread context was added to this mock message.";
      elements.simulatorContextList.replaceChildren(empty);
    } else {
      elements.simulatorContextList.replaceChildren(...items);
    }
  }
  if (elements.simulatorApprovalNote) {
    elements.simulatorApprovalNote.textContent = approval.approvalUrl
      ? `In production, Edit opens ${approval.approvalUrl}. In the simulator, the draft stays local.`
      : "In the simulator, Edit keeps the draft local.";
  }
  if (elements.simulatorSendButton) {
    elements.simulatorSendButton.disabled = approval.status === "sent";
    elements.simulatorSendButton.textContent = approval.status === "sent" ? "Sent" : "Send";
  }
  if (elements.simulatorEditButton) {
    elements.simulatorEditButton.disabled = false;
  }
}

function updateSimulatorPanel() {
  ensureSimulatorSelection();
  updateSimulatorComposerFields();
  updateSimulatorQueue();
  updateSimulatorDetail();
}

function updateHeader() {
  const displayName = getDisplayName();
  const workspaceName = getWorkspaceName();
  const selectedFeature = getSelectedFeature();
  const titleLabel = state.settingsOpen
    ? "Settings"
    : state.selectedFeatureId && selectedFeature
      ? selectedFeature.name
      : capitalizeWords(state.activeTab);
  if (elements.workspaceTitle) {
    elements.workspaceTitle.textContent = workspaceName;
  }
  if (elements.workspaceSubtitle) {
    elements.workspaceSubtitle.textContent = `Signed in as ${displayName}`;
  }
  elements.accountAvatar.textContent = getAvatarLabel();
  elements.accountLabel.textContent = activeEmail;
  document.title = `${workspaceName} · ${titleLabel}`;
}

function createFeatureCard(feature) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "glass-card feature-card feature-card-button";
  card.setAttribute("aria-label", `Open ${feature.name} studio`);
  card.addEventListener("click", () => openFeatureStudio(feature.id));

  const head = document.createElement("div");
  head.className = "feature-card-head";

  const titleBlock = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = feature.name;

  titleBlock.append(title);

  const status = document.createElement("span");
  status.className = "feature-status";
  status.textContent = feature.status || "Active";

  head.append(titleBlock, status);

  const description = document.createElement("p");
  description.className = "feature-card-copy";
  description.textContent = feature.description || "";
  const action = document.createElement("span");
  action.className = "feature-card-action";
  action.textContent = "Open";

  card.append(head, description, action);
  return card;
}

function updateFeatureList() {
  const features = clientState.features.length ? clientState.features : [];

  if (!features.length) {
    const emptyState = document.createElement("article");
    emptyState.className = "glass-card empty-state";

    const title = document.createElement("h3");
    title.textContent = "No features assigned";

    const copy = document.createElement("p");
    copy.textContent = "Add a feature to this account before editing a prompt.";

    emptyState.append(title, copy);
    elements.featureList.replaceChildren(emptyState);
    return;
  }

  elements.featureList.replaceChildren(...features.map((feature) => createFeatureCard(feature)));
}

function openFeatureStudio(featureId) {
  const feature = getFeatureById(featureId) || clientState.features[0];

  if (!feature) {
    return;
  }

  state.selectedFeatureId = feature.id;
  state.activeTab = "features";
  state.settingsOpen = false;
  closeMenu();
  setHashForTab("features", feature.id);
  renderApp();
}

function closeFeatureStudio() {
  state.selectedFeatureId = null;
  state.activeTab = "features";
  setHashForTab("features");
  renderApp();
}

function updateFeatureStudioHeader() {
  const feature = getSelectedFeature();
  if (!feature) {
    return;
  }

  elements.featureStudioStatus.textContent = feature.status || "Active";
  elements.featureStudioTitle.textContent = feature.name;
  elements.featureStudioDescription.textContent = feature.description || "";
  elements.featureStudioChannel.textContent = `Channel: ${feature.channel || "Web"}`;
  elements.featureStudioMode.textContent = `Mode: ${feature.mode || "Default"}`;
}

function updatePromptFields() {
  const prompt = getSelectedPrompt();
  elements.toneGuidance.value = prompt.toneGuidance;
  elements.responseStyle.value = prompt.responseStyle;
  elements.replyRules.value = prompt.replyRules;
  elements.businessNotes.value = prompt.businessNotes;
  elements.escalationGuidance.value = prompt.escalationGuidance;
  elements.approvalGuidance.value = prompt.approvalGuidance;
  elements.exampleReplies.value = prompt.exampleReplies;
}

function updateApprovalFields() {
  const feature = getSelectedFeature();
  elements.approvalUrlInput.value = feature?.approvalUrl || "";
}

function updateTabButtons() {
  for (const button of elements.tabButtons) {
    const isSettingsButton = button.dataset.tab === "settings";
    const isActive = isSettingsButton
      ? state.settingsOpen
      : !state.settingsOpen && button.dataset.tab === state.activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

function updateSettingsButtons() {
  for (const button of elements.settingsButtons) {
    const isActive = button.dataset.settingsMode === state.settingsMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  const showAccount = state.settingsMode === "account";
  elements.accountSettingsPane.classList.toggle("is-hidden", !showAccount);
  elements.preferencesSettingsPane.classList.toggle("is-hidden", showAccount);
}

function updatePanelVisibility() {
  const inStudio = state.activeTab === "features" && Boolean(state.selectedFeatureId);
  elements.featuresPanel.classList.toggle("is-hidden", state.activeTab !== "features" || inStudio);
  elements.featureStudioPanel.classList.toggle("is-hidden", !inStudio);
  elements.previewPanel.classList.toggle("is-hidden", state.activeTab !== "preview");
  elements.simulatorPanel.classList.toggle("is-hidden", state.activeTab !== "simulator");
  syncSettingsPanelState();
}

function syncSettingsPanelState() {
  const panel = elements.settingsPanel;

  if (!panel) {
    return;
  }

  if (settingsPanelOpenFrame !== null) {
    window.cancelAnimationFrame(settingsPanelOpenFrame);
    settingsPanelOpenFrame = null;
  }

  if (settingsPanelCloseTimer !== null) {
    window.clearTimeout(settingsPanelCloseTimer);
    settingsPanelCloseTimer = null;
  }

  if (state.settingsOpen) {
    panel.classList.remove("is-hidden");
    document.body.dataset.modal = "settings";

    if (!panel.classList.contains("is-open")) {
      settingsPanelOpenFrame = window.requestAnimationFrame(() => {
        panel.classList.add("is-open");
        settingsPanelOpenFrame = null;
      });
    }

    return;
  }

  panel.classList.remove("is-open");

  if (panel.classList.contains("is-hidden")) {
    delete document.body.dataset.modal;
    return;
  }

  settingsPanelCloseTimer = window.setTimeout(() => {
    panel.classList.add("is-hidden");
    delete document.body.dataset.modal;
    settingsPanelCloseTimer = null;
  }, SETTINGS_PANEL_ANIMATION_MS);
}

function updatePreview() {
  const prompt = getSelectedPrompt();
  const scenario = SCENARIOS[prompt.scenario] ?? SCENARIOS.availability;
  const feature = getSelectedFeature();
  elements.scenarioSelect.value = prompt.scenario;
  elements.approvalSender.textContent = scenario.sender || "Customer";
  elements.scenarioMessage.textContent = scenario.user;
  elements.responseMessage.textContent = buildResponseText(prompt);
  elements.approvalUrlNote.textContent = feature?.approvalUrl?.trim()
    ? `Edit opens ${feature.approvalUrl.trim()}`
    : "Edit opens the configured approval page.";
  elements.compiledPrompt.textContent = buildCompiledPrompt();
}

function updateSettingsFields() {
  elements.signedInEmail.textContent = activeEmail;
  elements.displayNameInput.value = clientState.settings.displayName;
  elements.workspaceNameInput.value = clientState.settings.workspaceName;
  elements.timezoneSelect.value = clientState.settings.timezone;
}

function renderApp() {
  updateHeader();
  updateTabButtons();
  updatePanelVisibility();
  updateFeatureList();
  updateFeatureStudioHeader();
  updatePromptFields();
  updateApprovalFields();
  updatePreview();
  updateSimulatorPanel();
  updateSettingsButtons();
  updateSettingsFields();
  setStatus("Autosaved locally");
}

function renderAuth() {
  const challengeEmail = normalizeEmail(authChallenge?.email || "");
  const showChallenge = Boolean(challengeEmail) && Boolean(authChallenge?.code);
  const stage = showChallenge ? "code" : "email";

  elements.authCard.dataset.authStage = stage;
  elements.emailInput.value = challengeEmail || normalizeEmail(authSession?.email || "");
  elements.emailInput.disabled = showChallenge;
  for (const digitInput of elements.otpDigits) {
    digitInput.disabled = !showChallenge;
  }
  elements.otpPanel.setAttribute("aria-hidden", String(!showChallenge));
  elements.sendCodeButton.setAttribute("aria-label", showChallenge ? "Verify code" : "Log in");
  elements.authMessage.textContent = showChallenge
    ? `A code is ready for ${challengeEmail}.`
    : "We’ll send a code to your email.";
  elements.demoCodeText.textContent = DEMO_MODE && showChallenge ? `Demo code: ${authChallenge.code}` : "";
  elements.demoCodeText.classList.toggle("is-hidden", !(showChallenge && DEMO_MODE));
  clearOtpDigits();
}

function refreshView() {
  if (authSession?.signedIn && activeEmail) {
    const route = resolveRouteFromHash();
    const rawHash = window.location.hash.replace(/^#/, "");

    if (route.tab === "settings") {
      state.selectedFeatureId = null;
      state.selectedSimulatorId = null;
      state.settingsOpen = true;
      state.activeTab = VALID_TABS.has(state.lastPrimaryTab) && state.lastPrimaryTab !== "settings"
        ? state.lastPrimaryTab
        : "features";
    } else {
      state.settingsOpen = false;
      state.activeTab = route.tab || "features";
      state.selectedFeatureId = route.tab === "features" && route.featureId
        ? route.featureId
        : null;
      state.selectedSimulatorId = route.tab === "simulator" && route.featureId
        ? route.featureId
        : clientState.simulator.selectedApprovalId || clientState.simulator.approvals[0]?.approvalId || null;
      if (state.selectedFeatureId && !getFeatureById(state.selectedFeatureId)) {
        state.selectedFeatureId = clientState.features[0]?.id || null;
      }
      if (state.selectedSimulatorId && !clientState.simulator.approvals.some((approval) => approval.approvalId === state.selectedSimulatorId)) {
        state.selectedSimulatorId = clientState.simulator.approvals[0]?.approvalId || null;
      }
      state.lastPrimaryTab = state.activeTab;
      persistLastPrimaryTab();
      if (!route.tab) {
        setHashForTab(state.activeTab);
      } else if (state.activeTab === "features" && state.selectedFeatureId) {
        setHashForTab("features", state.selectedFeatureId);
      } else if (state.activeTab === "simulator" && state.selectedSimulatorId) {
        setHashForTab("simulator", state.selectedSimulatorId);
      } else if (rawHash && rawHash !== route.tab) {
        setHashForTab(route.tab);
      }
    }

    setView("app");
    renderApp();
    return;
  }

  setView("auth");
  renderAuth();
}

function validateEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function clearOtpDigits() {
  for (const digitInput of elements.otpDigits) {
    digitInput.value = "";
  }
}

function setOtpDigits(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, elements.otpDigits.length);

  elements.otpDigits.forEach((digitInput, index) => {
    digitInput.value = digits[index] || "";
  });

  return digits;
}

function maybeAutoVerifyOtp() {
  if (!authChallenge?.code || !authChallenge?.email) {
    return false;
  }

  if (getOtpDigits().length !== elements.otpDigits.length) {
    return false;
  }

  verifyOtpFlow();
  return true;
}

function getOtpDigits() {
  return elements.otpDigits
    .map((digitInput) => String(digitInput.value || "").replace(/\D/g, "").slice(0, 1))
    .join("");
}

function focusOtpDigit(index = 0) {
  const safeIndex = Math.max(0, Math.min(index, elements.otpDigits.length - 1));
  const digitInput = elements.otpDigits[safeIndex];

  if (!digitInput) {
    return;
  }

  digitInput.focus();

  if (typeof digitInput.select === "function") {
    digitInput.select();
  }
}

function focusFirstEmptyOtpDigit() {
  const emptyIndex = elements.otpDigits.findIndex((digitInput) => !String(digitInput.value || "").trim());
  focusOtpDigit(emptyIndex >= 0 ? emptyIndex : elements.otpDigits.length - 1);
}

function handleOtpDigitInput(event) {
  const digitInput = event.target;
  const index = elements.otpDigits.indexOf(digitInput);

  if (index < 0) {
    return;
  }

  const digits = String(digitInput.value || "").replace(/\D/g, "");

  if (!digits) {
    digitInput.value = "";
    return;
  }

  if (digits.length > 1) {
    setOtpDigits(digits);
    if (!maybeAutoVerifyOtp()) {
      focusOtpDigit(Math.min(digits.length, elements.otpDigits.length - 1));
    }
    return;
  }

  digitInput.value = digits.slice(0, 1);

  const didAutoVerify = maybeAutoVerifyOtp();

  if (!didAutoVerify && index < elements.otpDigits.length - 1) {
    focusOtpDigit(index + 1);
  }
}

function handleOtpDigitKeydown(event) {
  const digitInput = event.target;
  const index = elements.otpDigits.indexOf(digitInput);

  if (index < 0) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    verifyOtpFlow();
    return;
  }

  if (event.key === "ArrowLeft" && index > 0) {
    event.preventDefault();
    focusOtpDigit(index - 1);
    return;
  }

  if (event.key === "ArrowRight" && index < elements.otpDigits.length - 1) {
    event.preventDefault();
    focusOtpDigit(index + 1);
    return;
  }

  if (event.key === "Backspace" && !digitInput.value && index > 0) {
    event.preventDefault();
    const previousInput = elements.otpDigits[index - 1];
    previousInput.value = "";
    focusOtpDigit(index - 1);
  }
}

function handleOtpDigitPaste(event) {
  const pasted = String(event.clipboardData?.getData("text") || "").replace(/\D/g, "");

  if (!pasted) {
    return;
  }

  event.preventDefault();
  setOtpDigits(pasted);
  if (!maybeAutoVerifyOtp()) {
    focusOtpDigit(Math.min(pasted.length, elements.otpDigits.length) - 1);
  }
}

function handlePrimaryAuthAction() {
  if (authChallenge?.code && authChallenge?.email) {
    verifyOtpFlow();
    return;
  }

  startOtpFlow();
}

function startOtpFlow() {
  const email = normalizeEmail(elements.emailInput.value);

  if (!validateEmail(email)) {
    authChallenge = null;
    persistJson(AUTH_CHALLENGE_KEY, null);
    clearOtpDigits();
    renderAuth();
    elements.authMessage.textContent = "Enter a valid email address first.";
    elements.demoCodeText.classList.add("is-hidden");
    elements.emailInput.focus();
    return;
  }

  authChallenge = {
    email,
    code: generateOtp(),
    expiresAt: Date.now() + OTP_TTL_MS,
  };
  persistJson(AUTH_CHALLENGE_KEY, authChallenge);
  renderAuth();
  window.requestAnimationFrame(() => {
    focusOtpDigit(0);
  });
}

function completeSignIn(email) {
  activeEmail = normalizeEmail(email);
  clientState = loadClientState(activeEmail);
  state.selectedSimulatorId = clientState.simulator.selectedApprovalId || clientState.simulator.approvals[0]?.approvalId || null;
  authSession = {
    email: activeEmail,
    signedIn: true,
    signedInAt: Date.now(),
  };
  authChallenge = null;

  persistJson(AUTH_SESSION_KEY, authSession);
  persistJson(AUTH_CHALLENGE_KEY, null);

  state.activeTab = "features";
  state.settingsMode = "account";
  state.settingsOpen = false;
  state.lastPrimaryTab = "features";
  persistLastPrimaryTab();
  setHashForTab("features");
  setView("app");
  renderApp();
}

function verifyOtpFlow() {
  const enteredCode = getOtpDigits();
  const email = normalizeEmail(elements.emailInput.value || authChallenge?.email || "");

  if (!authChallenge?.code || !authChallenge?.email) {
    elements.authMessage.textContent = "Send a fresh code first.";
    return;
  }

  if (Date.now() > authChallenge.expiresAt) {
    elements.authMessage.textContent = "That code expired. Send a new one.";
    return;
  }

  if (enteredCode.length !== elements.otpDigits.length) {
    elements.authMessage.textContent = "Enter the full 6-digit code.";
    focusFirstEmptyOtpDigit();
    return;
  }

  if (email !== normalizeEmail(authChallenge.email)) {
    elements.authMessage.textContent = "Use the same email that requested the code.";
    return;
  }

  if (enteredCode !== String(authChallenge.code)) {
    elements.authMessage.textContent = "That code is not correct.";
    return;
  }

  completeSignIn(email);
}

function signOut() {
  persistClientState();
  authSession = null;
  authChallenge = null;
  activeEmail = "";
  clientState = loadClientState(activeEmail);
  state.selectedSimulatorId = clientState.simulator.selectedApprovalId || clientState.simulator.approvals[0]?.approvalId || null;
  state.settingsOpen = false;
  state.lastPrimaryTab = "features";
  persistLastPrimaryTab();

  persistJson(AUTH_SESSION_KEY, null);
  persistJson(AUTH_CHALLENGE_KEY, null);
  clearHash();
  setView("auth");
  renderAuth();
  elements.emailInput.focus();
}

function syncPromptField(key) {
  return (event) => {
    const feature = getSelectedFeature();

    if (!feature) {
      return;
    }

    feature.prompt[key] = event.target.value;
    persistClientState();
    updateHeader();
    updateFeatureStudioHeader();
    updatePreview();
    setStatus("Autosaved locally");
  };
}

function syncSettingsField(key) {
  return (event) => {
    clientState.settings[key] = event.target.value;
    persistClientState();
    updateHeader();
    updateSettingsFields();
    setStatus("Autosaved locally");
  };
}

function syncFeatureField(key) {
  return (event) => {
    const feature = getSelectedFeature();

    if (!feature) {
      return;
    }

    feature[key] = event.target.value;
    persistClientState();
    updateHeader();
    updateFeatureStudioHeader();
    updateApprovalFields();
    updatePreview();
    setStatus("Autosaved locally");
  };
}

function handleMenuAction(action) {
  if (action === "account") {
    openSettings("account");
    return;
  }

  if (action === "settings") {
    openSettings("preferences");
    return;
  }

  if (action === "logout") {
    signOut();
  }
}

function bindEvents() {
  elements.sendCodeButton.addEventListener("click", handlePrimaryAuthAction);
  elements.changeEmailButton.addEventListener("click", () => {
    authChallenge = null;
    persistJson(AUTH_CHALLENGE_KEY, null);
    clearOtpDigits();
    renderAuth();
    elements.emailInput.focus();
  });
  elements.signOutButton.addEventListener("click", signOut);
  elements.closeSettingsButton.addEventListener("click", closeSettings);
  elements.backToFeaturesButton.addEventListener("click", closeFeatureStudio);

  elements.settingsPanel.addEventListener("click", (event) => {
    if (event.target === elements.settingsPanel) {
      closeSettings();
    }
  });

  elements.accountMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  for (const button of elements.tabButtons) {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab || "features");
    });
  }

  for (const button of elements.settingsButtons) {
    button.addEventListener("click", () => {
      setSettingsMode(button.dataset.settingsMode || "account");
    });
  }

  for (const item of Array.from(elements.accountMenu.querySelectorAll("[data-menu-action]"))) {
    item.addEventListener("click", () => {
      handleMenuAction(item.dataset.menuAction || "");
      closeMenu();
    });
  }

  document.addEventListener("click", (event) => {
    if (!elements.accountMenu.contains(event.target) && !elements.accountMenuButton.contains(event.target)) {
      closeMenu();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.settingsOpen) {
        closeSettings();
      } else {
        closeMenu();
      }
    }
  });

  window.addEventListener("hashchange", () => {
    if (!authSession?.signedIn) {
      return;
    }

    const route = resolveRouteFromHash();
    const rawHash = window.location.hash.replace(/^#/, "");

    if (route.tab === "settings") {
      state.selectedFeatureId = null;
      state.selectedSimulatorId = null;
      if (!state.settingsOpen) {
        openSettings(state.settingsMode);
      }
      return;
    }

    if (route.tab) {
      state.settingsOpen = false;
      if (route.tab !== state.activeTab) {
        state.activeTab = route.tab;
      }
      state.selectedFeatureId = route.tab === "features" && route.featureId
        ? route.featureId
        : null;
      state.selectedSimulatorId = route.tab === "simulator" && route.featureId
        ? route.featureId
        : state.selectedSimulatorId;
      if (state.selectedFeatureId && !getFeatureById(state.selectedFeatureId)) {
        state.selectedFeatureId = clientState.features[0]?.id || null;
      }
      if (state.selectedSimulatorId && !clientState.simulator.approvals.some((approval) => approval.approvalId === state.selectedSimulatorId)) {
        state.selectedSimulatorId = clientState.simulator.approvals[0]?.approvalId || null;
      }
      if (state.activeTab === "features" && state.selectedFeatureId) {
        setHashForTab("features", state.selectedFeatureId);
      } else if (state.activeTab === "simulator" && state.selectedSimulatorId) {
        setHashForTab("simulator", state.selectedSimulatorId);
      } else if (rawHash && rawHash !== route.tab) {
        setHashForTab(route.tab);
      }
      state.lastPrimaryTab = route.tab;
      persistLastPrimaryTab();
      renderApp();
      return;
    }

    if (!route.tab) {
      setHashForTab(state.settingsOpen ? "settings" : state.activeTab);
    }
  });

  elements.emailInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handlePrimaryAuthAction();
    }
  });

  for (const digitInput of elements.otpDigits) {
    digitInput.addEventListener("input", handleOtpDigitInput);
    digitInput.addEventListener("keydown", handleOtpDigitKeydown);
    digitInput.addEventListener("paste", handleOtpDigitPaste);
  }

  elements.toneGuidance.addEventListener("input", syncPromptField("toneGuidance"));
  elements.responseStyle.addEventListener("change", syncPromptField("responseStyle"));
  elements.replyRules.addEventListener("input", syncPromptField("replyRules"));
  elements.businessNotes.addEventListener("input", syncPromptField("businessNotes"));
  elements.escalationGuidance.addEventListener("input", syncPromptField("escalationGuidance"));
  elements.approvalGuidance.addEventListener("input", syncPromptField("approvalGuidance"));
  elements.exampleReplies.addEventListener("input", syncPromptField("exampleReplies"));
  elements.scenarioSelect.addEventListener("change", syncPromptField("scenario"));
  elements.approvalUrlInput.addEventListener("input", syncFeatureField("approvalUrl"));

  elements.displayNameInput.addEventListener("input", syncSettingsField("displayName"));
  elements.workspaceNameInput.addEventListener("input", syncSettingsField("workspaceName"));
  elements.timezoneSelect.addEventListener("change", syncSettingsField("timezone"));

  if (elements.simulatorPresetSelect) {
    elements.simulatorPresetSelect.addEventListener("change", (event) => {
      applySimulatorPreset(event.target.value);
    });
  }

  if (elements.simulatorLoadSampleButton) {
    elements.simulatorLoadSampleButton.addEventListener("click", () => {
      applySimulatorPreset(elements.simulatorPresetSelect?.value || DEFAULT_SIMULATOR.composer.scenario);
    });
  }

  if (elements.simulatorQueueButton) {
    elements.simulatorQueueButton.addEventListener("click", queueSimulatorApproval);
  }

  if (elements.simulatorReplyInput) {
    elements.simulatorReplyInput.addEventListener("input", syncSimulatorReplyDraft);
  }

  if (elements.simulatorEditButton) {
    elements.simulatorEditButton.addEventListener("click", () => {
      const approval = getSelectedSimulatorApproval();
      if (!approval) {
        return;
      }

      const editUrl = buildSimulatorEditUrl(approval);
      if (editUrl) {
        window.open(editUrl, "_blank", "noopener,noreferrer");
        updateStatusFromSimulator("Opened approval page");
        return;
      }

      if (elements.simulatorReplyInput) {
        elements.simulatorReplyInput.focus();
        if (typeof elements.simulatorReplyInput.select === "function") {
          elements.simulatorReplyInput.select();
        }
      }

      updateStatusFromSimulator("Focused the local reply draft");
    });
  }

  if (elements.simulatorSendButton) {
    elements.simulatorSendButton.addEventListener("click", markSimulatorApprovalSent);
  }

  for (const field of [
    ["simulatorSenderNameInput", "senderName"],
    ["simulatorSenderWaIdInput", "senderWaId"],
    ["simulatorMessageInput", "latestMessage"],
    ["simulatorContextInput", "threadContext"],
    ["simulatorApprovalUrlInput", "approvalUrl"],
  ]) {
    const [elementKey, stateKey] = field;
    const element = elements[elementKey];

    if (element) {
      element.addEventListener("input", syncSimulatorComposerField(stateKey));
    }
  }

  elements.copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildCompiledPrompt());
      setStatus("Instruction preview copied");
    } catch {
      setStatus("Copy failed in this browser");
    }
  });
}

bindEvents();
refreshView();
