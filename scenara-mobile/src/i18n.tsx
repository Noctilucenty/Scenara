/**
 * src/i18n/index.ts
 * 
 * Simple i18n system for Scenara.
 * Supports: English (en) and Portuguese Brazil (pt)
 * 
 * Usage:
 *   import { useLanguage } from "@/src/i18n";
 *   const { t, language, setLanguage } = useLanguage();
 *   <Text>{t("markets.title")}</Text>
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Language = "en" | "pt";

type Translations = typeof en;

// ── English ───────────────────────────────────────────────────────────────────

const en = {
  // Tab bar
  tabs: {
    markets:   "MARKETS",
    portfolio: "PORTFOLIO",
    insights:  "INSIGHTS",
    rankings:  "RANKINGS",
    settings:  "SETTINGS",
  },

  // Markets
  markets: {
    title:       "PREDICTION MARKETS",
    trending:    "↗ TRENDING",
    live:        "LIVE",
    closed:      "CLOSED",
    featured:    "★ FEATURED",
    resolve:     "RESOLVE",
    refresh:     "↻ REFRESH",
    loading:     "...",
    noMarkets:   "No markets yet",
    allMarkets:  "ALL MARKETS",
    balance:     "BALANCE",
    liveCount:   (n: number, c: number) => `${n} LIVE · ${c} CLOSED`,
    tapExpand:   "TAP TO EXPAND ↗",
    probHistory: "PROBABILITY HISTORY",
    outcomes:    "OUTCOMES",
    amount:      "AMOUNT",
    trade:       (amt: string) => `Trade · $${amt}`,
    opening:     "Opening position...",
    resolveMarket: "RESOLVE MARKET",
    confirmWinner: "Confirm Winner",
    cancel:      "Cancel",
    positionOpened: (amt: string) => `Position opened · $${amt}`,
    all:         "All",
    politics:    "Politics",
    economy:     "Economy",
    crypto:      "Crypto",
    sports:      "Sports",
    technology:  "Tech",
    geopolitics: "Global",
  },

  // Portfolio
  portfolio: {
    title:        "Portfolio",
    balance:      "SIMULATION BALANCE",
    total:        "TOTAL",
    open:         "OPEN",
    won:          "WON",
    lost:         "LOST",
    totalPnl:     "TOTAL P&L",
    winRate:      "WIN RATE",
    wagered:      "WAGERED",
    performance:  "PERFORMANCE SNAPSHOT",
    accuracy:     "ACCURACY",
    percentile:   "PERCENTILE",
    bestWin:      "BEST WIN",
    single:       "single",
    vsOthers:     "vs others",
    refresh:      "↻  REFRESH",
    positions:    (n: number) => `POSITIONS · ${n}`,
    noPositions:  "No positions yet",
    noPositionsSub: "Head to Markets to open your first position",
    wageredLabel: "WAGERED",
    probLabel:    "PROB",
    multLabel:    "MULT",
    resolved:     "RESOLVED",
    streak: {
      unstoppable: "UNSTOPPABLE",
      onFire:      "ON FIRE",
      hotStreak:   "HOT STREAK",
      streak:      "STREAK",
      winning:     "WINNING",
      best:        "BEST",
      consecutive: (n: number) => `${n} consecutive win${n !== 1 ? "s" : ""}`,
    },
  },

  // Insights
  insights: {
    title:          "Insights",
    grade:          "PERFORMANCE GRADE",
    calibration:    "Based on Brier-score calibration",
    accuracy:       "ACCURACY",
    percentileRank: "PERCENTILE RANK",
    outperform:     (pct: number) => `You outperform ${pct}% of all traders on this platform`,
    tradingStats:   "TRADING STATS",
    totalPreds:     "Total Predictions",
    winRate:        "Win Rate",
    accuracyScore:  "Accuracy Score",
    brierSub:       "Brier-score calibration",
    avgEntry:       "Avg Entry Probability",
    avgEntrySub:    "Lower = higher risk tolerance",
    currentStreak:  "Current Streak",
    bestStreak:     "Best Streak",
    wins:           (n: number) => `${n} wins`,
    pnlBreakdown:   "P&L BREAKDOWN",
    totalPnl:       "Total P&L",
    avgPnl:         "Avg P&L per Prediction",
    bestPred:       "Best Single Prediction",
    worstPred:      "Worst Single Prediction",
    totalWagered:   "Total Wagered",
    positionSummary:"POSITION SUMMARY",
    gradeScale:     "GRADE SCALE",
    gradeLabels: {
      S: "Elite Predictor",
      A: "Sharp",
      B: "Solid",
      C: "Average",
      D: "Needs Work",
    },
    youLabel:       "← You",
    score:          (r: string) => `Score ${r}`,
    quickStats:     "QUICK STATS",
    balance:        "Balance",
    noData:         "No data yet",
    noDataSub:      "Place predictions to see your insights",
  },

  // Rankings
  rankings: {
    title:      "Rankings",
    traders:    (n: number) => `${n} traders`,
    topPnl:     "Top P&L",
    balance:    "Balance",
    winRate:    "Win Rate",
    trader:     "TRADER",
    pnl:        "P&L",
    yourStanding: "YOUR STANDING",
    predictions:  (n: number) => `${n} predictions`,
    streak:       (n: number, b: number) => `🔥 ${n} win streak · Best: ${b}`,
    topTraders:   "🏆 Top Traders",
    platformStats:"PLATFORM STATS",
    totalTraders: "Total Traders",
    noTraders:    "No traders ranked yet",
    hotMarkets:   "🔥 Hot Markets",
    byCategory:   "📊 By Category",
    youBadge:     "YOU",
  },

  // Settings
  settings: {
    title:        "Settings",
    account:      "ACCOUNT",
    displayName:  "Display Name",
    email:        "Email",
    language:     "LANGUAGE",
    english:      "English",
    portuguese:   "Português",
    logout:       "Sign Out",
    logoutConfirm:"Are you sure you want to sign out?",
    logoutCancel: "Cancel",
    appVersion:   "APP VERSION",
    version:      "Scenara v0.6",
  },

  // Auth
  auth: {
    welcomeBack:   "Welcome back",
    signIn:        "Sign in to your account",
    email:         "EMAIL",
    password:      "PASSWORD",
    signInBtn:     "Sign In",
    noAccount:     "Don't have an account?",
    signUp:        "Sign Up",
    createAccount: "Create account",
    free:          "Free · No credit card · No real money",
    displayName:   "DISPLAY NAME",
    displayNamePh: "How you'll appear on the leaderboard",
    confirmPwd:    "CONFIRM PASSWORD",
    repeatPwd:     "Repeat password",
    minPwd:        "Min. 6 characters",
    startBalance:  "You'll start with $10,000 simulation balance",
    createBtn:     "Create Account",
    haveAccount:   "Already have an account?",
    tagline:       "Predict the future. Track your edge.",
    startTagline:  "Start with $10,000 simulation balance",
  },

  // Common
  common: {
    justNow:  "just now",
    mAgo:     (n: number) => `${n}m ago`,
    hAgo:     (n: number) => `${n}h ago`,
    dAgo:     (n: number) => `${n}d ago`,
    chance:   "chance",
    live:     "● LIVE",
    scenara:  "SCENARA",
  },
};

// ── Portuguese ────────────────────────────────────────────────────────────────

const pt: typeof en = {
  tabs: {
    markets:   "MERCADOS",
    portfolio: "CARTEIRA",
    insights:  "INSIGHTS",
    rankings:  "RANKING",
    settings:  "AJUSTES",
  },

  markets: {
    title:       "MERCADO DE PREVISÕES",
    trending:    "↗ EM ALTA",
    live:        "AO VIVO",
    closed:      "ENCERRADO",
    featured:    "★ DESTAQUE",
    resolve:     "RESOLVER",
    refresh:     "↻ ATUALIZAR",
    loading:     "...",
    noMarkets:   "Nenhum mercado ainda",
    allMarkets:  "TODOS OS MERCADOS",
    balance:     "SALDO",
    liveCount:   (n: number, c: number) => `${n} AO VIVO · ${c} ENCERRADO`,
    tapExpand:   "TOQUE PARA EXPANDIR ↗",
    probHistory: "HISTÓRICO DE PROBABILIDADE",
    outcomes:    "RESULTADOS",
    amount:      "VALOR",
    trade:       (amt: string) => `Apostar · $${amt}`,
    opening:     "Abrindo posição...",
    resolveMarket: "RESOLVER MERCADO",
    confirmWinner: "Confirmar Vencedor",
    cancel:      "Cancelar",
    positionOpened: (amt: string) => `Posição aberta · $${amt}`,
    all:         "Todos",
    politics:    "Política",
    economy:     "Economia",
    crypto:      "Cripto",
    sports:      "Esportes",
    technology:  "Tecnologia",
    geopolitics: "Global",
  },

  portfolio: {
    title:        "Carteira",
    balance:      "SALDO SIMULADO",
    total:        "TOTAL",
    open:         "ABERTO",
    won:          "GANHOU",
    lost:         "PERDEU",
    totalPnl:     "LUCRO TOTAL",
    winRate:      "TAXA DE ACERTO",
    wagered:      "APOSTADO",
    performance:  "DESEMPENHO",
    accuracy:     "PRECISÃO",
    percentile:   "PERCENTIL",
    bestWin:      "MELHOR WIN",
    single:       "aposta",
    vsOthers:     "vs outros",
    refresh:      "↻  ATUALIZAR",
    positions:    (n: number) => `POSIÇÕES · ${n}`,
    noPositions:  "Nenhuma posição ainda",
    noPositionsSub: "Vá para Mercados para abrir sua primeira posição",
    wageredLabel: "APOSTADO",
    probLabel:    "PROB",
    multLabel:    "MULT",
    resolved:     "RESOLVIDO",
    streak: {
      unstoppable: "IMPARÁVEL",
      onFire:      "EM CHAMAS",
      hotStreak:   "SEQUÊNCIA HOT",
      streak:      "SEQUÊNCIA",
      winning:     "VENCENDO",
      best:        "MELHOR",
      consecutive: (n: number) => `${n} vitória${n !== 1 ? "s" : ""} seguida${n !== 1 ? "s" : ""}`,
    },
  },

  insights: {
    title:          "Insights",
    grade:          "NOTA DE DESEMPENHO",
    calibration:    "Baseado na pontuação Brier",
    accuracy:       "PRECISÃO",
    percentileRank: "PERCENTIL",
    outperform:     (pct: number) => `Você supera ${pct}% dos traders nesta plataforma`,
    tradingStats:   "ESTATÍSTICAS",
    totalPreds:     "Total de Previsões",
    winRate:        "Taxa de Acerto",
    accuracyScore:  "Pontuação de Precisão",
    brierSub:       "Calibração Brier",
    avgEntry:       "Probabilidade Média de Entrada",
    avgEntrySub:    "Menor = maior tolerância ao risco",
    currentStreak:  "Sequência Atual",
    bestStreak:     "Melhor Sequência",
    wins:           (n: number) => `${n} vitória${n !== 1 ? "s" : ""}`,
    pnlBreakdown:   "DETALHAMENTO DE LUCRO",
    totalPnl:       "Lucro Total",
    avgPnl:         "Lucro Médio por Previsão",
    bestPred:       "Melhor Previsão",
    worstPred:      "Pior Previsão",
    totalWagered:   "Total Apostado",
    positionSummary:"RESUMO DE POSIÇÕES",
    gradeScale:     "ESCALA DE NOTAS",
    gradeLabels: {
      S: "Previsor Elite",
      A: "Afiado",
      B: "Sólido",
      C: "Médio",
      D: "Precisa Melhorar",
    },
    youLabel:       "← Você",
    score:          (r: string) => `Pontuação ${r}`,
    quickStats:     "ESTATÍSTICAS RÁPIDAS",
    balance:        "Saldo",
    noData:         "Sem dados ainda",
    noDataSub:      "Faça previsões para ver seus insights",
  },

  rankings: {
    title:      "Ranking",
    traders:    (n: number) => `${n} traders`,
    topPnl:     "Maior Lucro",
    balance:    "Saldo",
    winRate:    "Taxa de Acerto",
    trader:     "TRADER",
    pnl:        "LUCRO",
    yourStanding: "SUA POSIÇÃO",
    predictions:  (n: number) => `${n} previsões`,
    streak:       (n: number, b: number) => `🔥 ${n} sequência · Melhor: ${b}`,
    topTraders:   "🏆 Top Traders",
    platformStats:"STATS DA PLATAFORMA",
    totalTraders: "Total de Traders",
    noTraders:    "Nenhum trader no ranking ainda",
    hotMarkets:   "🔥 Mercados em Alta",
    byCategory:   "📊 Por Categoria",
    youBadge:     "VOCÊ",
  },

  settings: {
    title:        "Ajustes",
    account:      "CONTA",
    displayName:  "Nome de Exibição",
    email:        "Email",
    language:     "IDIOMA",
    english:      "English",
    portuguese:   "Português",
    logout:       "Sair",
    logoutConfirm:"Tem certeza que deseja sair?",
    logoutCancel: "Cancelar",
    appVersion:   "VERSÃO DO APP",
    version:      "Scenara v0.6",
  },

  auth: {
    welcomeBack:   "Bem-vindo de volta",
    signIn:        "Entre na sua conta",
    email:         "EMAIL",
    password:      "SENHA",
    signInBtn:     "Entrar",
    noAccount:     "Não tem uma conta?",
    signUp:        "Cadastrar",
    createAccount: "Criar conta",
    free:          "Grátis · Sem cartão de crédito · Sem dinheiro real",
    displayName:   "NOME DE EXIBIÇÃO",
    displayNamePh: "Como você aparecerá no ranking",
    confirmPwd:    "CONFIRMAR SENHA",
    repeatPwd:     "Repita a senha",
    minPwd:        "Mín. 6 caracteres",
    startBalance:  "Você começará com $10.000 de saldo simulado",
    createBtn:     "Criar Conta",
    haveAccount:   "Já tem uma conta?",
    tagline:       "Preveja o futuro. Rastreie sua vantagem.",
    startTagline:  "Comece com $10.000 de saldo simulado",
  },

  common: {
    justNow:  "agora mesmo",
    mAgo:     (n: number) => `há ${n}min`,
    hAgo:     (n: number) => `há ${n}h`,
    dAgo:     (n: number) => `há ${n}d`,
    chance:   "chance",
    live:     "● AO VIVO",
    scenara:  "SCENARA",
  },
};

const translations: Record<Language, typeof en> = { en, pt };

// ── Storage ───────────────────────────────────────────────────────────────────

const LANG_KEY = "scenara_language";

function saveLanguage(lang: Language) {
  if (Platform.OS === "web") {
    localStorage.setItem(LANG_KEY, lang);
  }
}

function loadLanguage(): Language {
  if (Platform.OS === "web") {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "pt") return saved;
  }
  return "en";
}

// ── Context ───────────────────────────────────────────────────────────────────

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(loadLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    saveLanguage(lang);
  }, []);

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
};