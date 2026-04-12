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

import React, { createContext, useContext, useState, useCallback } from "react";
import { Platform, View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Language = "en" | "pt" | "zh";

type Translations = typeof en;

// ── English ───────────────────────────────────────────────────────────────────

const en = {
  // Tab bar
  tabs: {
    markets:   "MARKETS",
    portfolio: "PORTFOLIO",
    news:      "NEWS",
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
    trade:       (amt: string) => `Buy · $${amt}`,
    opening:     "Opening position...",
    resolveMarket: "RESOLVE MARKET",
    confirmWinner: "Confirm Winner",
    cancel:      "Cancel",
    positionOpened: (amt: string) => `Position opened · $${amt}`,
    all:           "All",
    politics:      "Politics",
    economy:       "Economy",
    crypto:        "Crypto",
    sports:        "Sports",
    technology:    "Tech",
    geopolitics:   "Global",
    entertainment: "Entertainment",
    music:         "Music",
    tv:            "TV",
    science:       "Science",
    weather:       "Weather",
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
    wagered:      "INVESTED",
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
    wageredLabel: "INVESTED",
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
    totalWagered:   "Total Invested",
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
    news:      "NOTÍCIAS",
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
    trade:       (amt: string) => `Comprar · $${amt}`,
    opening:     "Abrindo posição...",
    resolveMarket: "RESOLVER MERCADO",
    confirmWinner: "Confirmar Vencedor",
    cancel:      "Cancelar",
    positionOpened: (amt: string) => `Posição aberta · $${amt}`,
    all:           "Todos",
    politics:      "Política",
    economy:       "Economia",
    crypto:        "Cripto",
    sports:        "Esportes",
    technology:    "Tecnologia",
    geopolitics:   "Global",
    entertainment: "Entretenimento",
    music:         "Música",
    tv:            "TV",
    science:       "Ciência",
    weather:       "Clima",
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
    wagered:      "INVESTIDO",
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
    wageredLabel: "INVESTIDO",
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
    totalWagered:   "Total Investido",
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

// ── Chinese (Simplified) ──────────────────────────────────────────────────────

const zh: typeof en = {
  tabs: {
    markets:   "市场",
    portfolio: "投资组合",
    news:      "新闻",
    rankings:  "排行榜",
    settings:  "设置",
  },

  markets: {
    title:       "预测市场",
    trending:    "↗ 热门",
    live:        "直播",
    closed:      "已关闭",
    featured:    "★ 精选",
    resolve:     "结算",
    refresh:     "↻ 刷新",
    loading:     "...",
    noMarkets:   "暂无市场",
    allMarkets:  "全部市场",
    balance:     "余额",
    liveCount:   (n: number, c: number) => `${n} 直播 · ${c} 已关闭`,
    tapExpand:   "点击展开 ↗",
    probHistory: "概率历史",
    outcomes:    "结果",
    amount:      "金额",
    trade:       (amt: string) => `买入 · $${amt}`,
    opening:     "正在开仓...",
    resolveMarket: "结算市场",
    confirmWinner: "确认赢家",
    cancel:      "取消",
    positionOpened: (amt: string) => `已开仓 · $${amt}`,
    all:           "全部",
    politics:      "政治",
    economy:       "经济",
    crypto:        "加密",
    sports:        "体育",
    technology:    "科技",
    geopolitics:   "全球",
    entertainment: "娱乐",
    music:         "音乐",
    tv:            "电视",
    science:       "科学",
    weather:       "天气",
  },

  portfolio: {
    title:        "投资组合",
    balance:      "模拟余额",
    total:        "总计",
    open:         "进行中",
    won:          "已赢",
    lost:         "已亏",
    totalPnl:     "总盈亏",
    winRate:      "胜率",
    wagered:      "已投入",
    performance:  "表现快照",
    accuracy:     "准确率",
    percentile:   "百分位",
    bestWin:      "最佳胜利",
    single:       "单次",
    vsOthers:     "对比他人",
    refresh:      "↻ 刷新",
    positions:    (n: number) => `仓位 · ${n}`,
    noPositions:  "暂无仓位",
    noPositionsSub: "前往市场开立您的第一个仓位",
    wageredLabel: "已投入",
    probLabel:    "概率",
    multLabel:    "倍数",
    resolved:     "已结算",
    streak: {
      unstoppable: "势不可挡",
      onFire:      "火热进行",
      hotStreak:   "热门连胜",
      streak:      "连胜",
      winning:     "获胜",
      best:        "最佳",
      consecutive: (n: number) => `连胜 ${n} 场`,
    },
  },

  insights: {
    title:          "洞察",
    grade:          "表现评级",
    calibration:    "基于布里尔分数校准",
    accuracy:       "准确率",
    percentileRank: "百分位排名",
    outperform:     (pct: number) => `您超越了平台 ${pct}% 的交易者`,
    tradingStats:   "交易统计",
    totalPreds:     "预测总数",
    winRate:        "胜率",
    accuracyScore:  "准确率评分",
    brierSub:       "布里尔分数校准",
    avgEntry:       "平均入场概率",
    avgEntrySub:    "越低 = 风险承受能力越高",
    currentStreak:  "当前连胜",
    bestStreak:     "最佳连胜",
    wins:           (n: number) => `${n} 胜`,
    pnlBreakdown:   "盈亏明细",
    totalPnl:       "总盈亏",
    avgPnl:         "每次预测平均盈亏",
    bestPred:       "最佳预测",
    worstPred:      "最差预测",
    totalWagered:   "总投入",
    positionSummary:"仓位摘要",
    gradeScale:     "评级标准",
    gradeLabels: {
      S: "精英预测者",
      A: "敏锐",
      B: "稳健",
      C: "一般",
      D: "有待提高",
    },
    youLabel:       "← 您",
    score:          (r: string) => `评分 ${r}`,
    quickStats:     "快速统计",
    balance:        "余额",
    noData:         "暂无数据",
    noDataSub:      "进行预测以查看您的洞察",
  },

  rankings: {
    title:      "排行榜",
    traders:    (n: number) => `${n} 位交易者`,
    topPnl:     "最高盈亏",
    balance:    "余额",
    winRate:    "胜率",
    trader:     "交易者",
    pnl:        "盈亏",
    yourStanding: "您的排名",
    predictions:  (n: number) => `${n} 次预测`,
    streak:       (n: number, b: number) => `🔥 ${n} 连胜 · 最佳: ${b}`,
    topTraders:   "🏆 顶级交易者",
    platformStats:"平台统计",
    totalTraders: "总交易者数",
    noTraders:    "暂无交易者排名",
    hotMarkets:   "🔥 热门市场",
    byCategory:   "📊 按类别",
    youBadge:     "您",
  },

  settings: {
    title:        "设置",
    account:      "账户",
    displayName:  "显示名称",
    email:        "邮箱",
    language:     "语言",
    english:      "English",
    portuguese:   "Português",
    logout:       "退出登录",
    logoutConfirm:"确定要退出登录吗？",
    logoutCancel: "取消",
    appVersion:   "应用版本",
    version:      "Scenara v0.6",
  },

  auth: {
    welcomeBack:   "欢迎回来",
    signIn:        "登录您的账户",
    email:         "邮箱",
    password:      "密码",
    signInBtn:     "登录",
    noAccount:     "还没有账户？",
    signUp:        "注册",
    createAccount: "创建账户",
    free:          "免费 · 无需信用卡 · 无真实资金",
    displayName:   "显示名称",
    displayNamePh: "在排行榜上的显示方式",
    confirmPwd:    "确认密码",
    repeatPwd:     "重复密码",
    minPwd:        "最少6个字符",
    startBalance:  "您将获得 $10,000 模拟余额",
    createBtn:     "创建账户",
    haveAccount:   "已有账户？",
    tagline:       "预测未来，追踪优势。",
    startTagline:  "从 $10,000 模拟余额开始",
  },

  common: {
    justNow:  "刚刚",
    mAgo:     (n: number) => `${n}分钟前`,
    hAgo:     (n: number) => `${n}小时前`,
    dAgo:     (n: number) => `${n}天前`,
    chance:   "概率",
    live:     "● 直播",
    scenara:  "SCENARA",
  },
};

const translations: Record<Language, typeof en> = { en, pt, zh };

// ── Storage ───────────────────────────────────────────────────────────────────

const LANG_KEY      = "scenara_language";
const CHOSEN_KEY    = "scenara_lang_chosen";

function saveLanguage(lang: Language) {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(LANG_KEY, lang);
      localStorage.setItem(CHOSEN_KEY, "1");
    }
  } catch {}
}

function loadLanguage(): Language {
  try {
    if (Platform.OS === "web") {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "pt" || saved === "zh") return saved;
    }
  } catch {}
  return "pt";
}

function checkChosen(): boolean {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(CHOSEN_KEY) === "1";
    }
  } catch {}
  return false;
}

// ── Language picker overlay ───────────────────────────────────────────────────

const P  = "#7C5CFC";
const BL = "#4F8EF7";
const PK = "#F050AE";

function LanguagePicker({ onSelect }: { onSelect: (lang: Language) => void }) {
  const [selected, setSelected] = useState<Language | null>(null);

  const options: Array<{ lang: Language; flagUri: string; label: string; sub: string }> = [
    { lang: "pt", flagUri: "https://flagcdn.com/w80/br.png", label: "Português", sub: "Brasil" },
    { lang: "en", flagUri: "https://flagcdn.com/w80/us.png", label: "English",   sub: "United States" },
    { lang: "zh", flagUri: "https://flagcdn.com/w80/cn.png", label: "中文",       sub: "中国大陆" },
  ];

  return (
    <View style={ls.overlay}>
      <View style={ls.inner}>
        {/* Logo box */}
        <View style={ls.logoBox}>
          <Text style={ls.logoText}>▽</Text>
        </View>
        <Text style={ls.title}>scenara</Text>
        <Text style={ls.subtitle}>Choose your language · Escolha seu idioma · 选择语言</Text>

        {/* Options */}
        <View style={ls.optionsWrap}>
          {options.map((opt) => {
            const active = selected === opt.lang;
            return (
              <TouchableOpacity
                key={opt.lang}
                onPress={() => setSelected(opt.lang)}
                style={[ls.option, active && ls.optionActive]}
                activeOpacity={0.75}
              >
                <Image source={{ uri: opt.flagUri }} style={ls.flag} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={ls.optLabel}>{opt.label}</Text>
                  <Text style={ls.optSub}>{opt.sub}</Text>
                </View>
                {active && (
                  <View style={ls.check}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Confirm */}
        <TouchableOpacity
          onPress={() => selected && onSelect(selected)}
          disabled={!selected}
          style={{ width: "100%", borderRadius: 16, overflow: "hidden", opacity: selected ? 1 : 0.4 }}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[BL, P, PK]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={ls.btn}
          >
            <Text style={ls.btnText}>
              {selected === "pt" ? "Continuar →" : selected === "zh" ? "继续 →" : "Continue →"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ls = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: "#08090C", alignItems: "center", justifyContent: "center", padding: 28 },
  inner:       { width: "100%", maxWidth: 380, alignItems: "center" },
  logoBox:     { width: 72, height: 72, borderRadius: 22, backgroundColor: "rgba(124,92,252,0.12)", borderWidth: 1, borderColor: "rgba(124,92,252,0.3)", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  logoText:    { fontSize: 28, color: "#7C5CFC" },
  title:       { color: "#F1F5F9", fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 8 },
  subtitle:    { color: "#64748B", fontSize: 14, marginBottom: 44, textAlign: "center" },
  optionsWrap: { width: "100%", gap: 14, marginBottom: 28 },
  option:      { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: "#0D1117", borderRadius: 16, padding: 18, borderWidth: 2, borderColor: "rgba(255,255,255,0.08)" },
  optionActive:{ backgroundColor: "rgba(124,92,252,0.1)", borderColor: "#7C5CFC" },
  flag:        { width: 48, height: 32, borderRadius: 6 },
  optLabel:    { color: "#F1F5F9", fontSize: 18, fontWeight: "700" },
  optSub:      { color: "#64748B", fontSize: 13, marginTop: 2 },
  check:       { width: 22, height: 22, borderRadius: 11, backgroundColor: "#7C5CFC", alignItems: "center", justifyContent: "center" },
  btn:         { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  btnText:     { color: "#fff", fontSize: 16, fontWeight: "700" },
});

// ── Context ───────────────────────────────────────────────────────────────────

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(loadLanguage);
  const [chosen, setChosen]          = useState<boolean>(checkChosen);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    saveLanguage(lang);
  }, []);

  const handlePick = useCallback((lang: Language) => {
    setLanguage(lang);
    setChosen(true);
  }, [setLanguage]);

  const t = translations[language];

  if (!chosen) {
    return (
      <LanguageContext.Provider value={{ language, setLanguage, t }}>
        <LanguagePicker onSelect={handlePick} />
      </LanguageContext.Provider>
    );
  }

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