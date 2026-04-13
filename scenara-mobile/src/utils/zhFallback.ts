const EXACT_TITLE_MAP: Record<string, string> = {
  // --- Scenario labels ---
  "yes": "是",
  "no": "否",
  "lula (pt)": "卢拉（劳工党）",
  "bolsonaro / right-wing candidate": "博索纳罗 / 右翼候选人",
  "other candidate": "其他候选人",

  // --- Market event titles ---
  "will bnb stay between $583-$606 in 1 hour?": "币安币BNB会在1小时内维持在$583到$606之间吗？",
  "will the brazilian congress pass a new fiscal pec this month?": "巴西国会会在本月通过新的财政PEC吗？",
  "will an ai-generated song become grammy eligible in 2026?": "由AI生成的歌曲会在2026年获得格莱美参评资格吗？",
  "will brazil-argentina diplomatic relations improve under milei in 2026?": "在2026年米莱执政下，巴西与阿根廷的外交关系会改善吗？",
  "will netflix remain the #1 streaming platform in brazil in 2026?": "网飞Netflix会在2026年继续保持巴西第一大流媒体平台吗？",
  "will masterchef brasil return for a new season in 2026?": "MasterChef Brasil会在2026年回归推出新一季吗？",
  "who will win the 2026 brazilian presidential election?": "谁将赢得2026年巴西总统大选？",
  "pick the candidate you think will win the 2026 brazilian presidential election.": "请选择你认为将赢得2026年巴西总统大选的候选人。",
  "will btc be above $71,026 in 1 hour?": "BTC 会在 1 小时后高于 $71,026 吗？",
  "btc is trading at $71,026.00. will it close above this in the next hour?": "BTC 当前交易价格为 $71,026.00。它会在接下来 1 小时收于该价格上方吗？",
  "will tiktok face regulatory restrictions in brazil in 2026?": "TikTok会在2026年在巴西面临监管限制吗？",
  "will flamengo reach the copa do brasil final this year?": "弗拉门戈会在今年打进巴西杯决赛吗？",
  "will a brazilian fighter win a ufc title this year?": "今年会有巴西格斗选手赢得UFC冠军吗？",
  "will brazil's ipca stay within the 3% target band in 2026?": "巴西IPCA通胀率会在2026年保持在3%目标区间内吗？",
  "will a major cancer treatment breakthrough be announced in 2026?": "会在2026年宣布重大癌症治疗突破吗？",

  // --- News titles: Geopolitics / Iran ---
  "the war with iran offers a snapshot of trump world. it's not a pretty picture.": "与伊朗的战争折射出特朗普政治圈的真实面貌，这并不美好。",
  "'blown to hell': trump orders hormuz blockade after us-iran peace talks end": "「被炸个稀烂」：美伊和谈破裂后，特朗普下令封锁霍尔木兹海峡。",
  "failed u.s.-iran negotiations in pakistan raise questions about fragile ceasefire": "美国与伊朗在巴基斯坦的谈判失败，令脆弱的停火协议受到质疑。",
  "iran chose 'not to accept our terms', vance says after peace talks": "和平会谈后，万斯表示，伊朗选择「不接受我们的条件」。",
  "russia, ukraine trade accusations of orthodox easter ceasefire violations": "俄罗斯与乌克兰互相指控对方违反东正教复活节停火协议。",
  "iran war diverts us military and attention from asia ahead of trump's summit with china's leader": "伊朗战争分散了美军和美国对亚洲的关注，正值特朗普会见中国领导人之前。",
  "trump's strait of hormuz blockade threat raises risks and leaves predicaments unchanged": "特朗普封锁霍尔木兹海峡的威胁加剧风险，各方困境依旧。",
  "trump-linked world liberty crypto project faces investor revolt": "与特朗普相关的世界自由加密项目面临投资者反叛。",
  "us military says it will blockade iran's ports as ship traffic appears to halt in strait of hormuz": "美军称将封锁伊朗港口，霍尔木兹海峡船运陷入停滞。",
  "us military says it will blockade iran's ports as ship traffic appears to halt": "美军称将封锁伊朗港口，船运陷入停滞。",

  // --- News titles: Crypto / Bitcoin ---
  "musk's spacex holds $603 million in bitcoin despite $5 billion loss stemming from xai": "马斯克SpaceX持有6.03亿美元比特币，尽管因xAI造成50亿美元亏损。",
  "u.s. treasury secretary fuels huge $1.5 quadrillion crypto prediction as the bitcoin price suddenly soars": "美国财长在比特币突然飙升之际为天价加密货币预测推波助澜。",
  "5 on-chain signals suggest bitcoin's war-driven dip masks a quiet wealth transfer": "5个链上信号显示比特币战争驱动的下跌掩盖了一次悄然的财富转移。",
  "bitcoin price today: btc up as tariff reprieve boosts risk assets": "比特币今日行情：关税暂缓提振风险资产，BTC上涨。",
  "bitcoin reclaims $80k as trump pauses tariffs for 90 days": "特朗普暂停关税90天，比特币重回8万美元。",
  "crypto market: bitcoin jumps, altcoins rally on tariff pause": "加密市场：关税暂停提振比特币大涨，山寨币全线反弹。",
  "ethereum price today: eth rises as market recovers": "以太坊今日行情：市场回暖，ETH上涨。",
};

const REPLACEMENTS: Array<[RegExp, string]> = [
  // Phrases first (before single words)
  [/\bwho will win\b/gi, "谁将赢得"],
  [/\bwill an?\b/gi, "会否有"],
  [/\bwill the\b/gi, "会否"],
  [/\bstay between\b/gi, "维持在"],
  [/\bin 1 hour\b/gi, "在1小时内"],
  [/\bin the next hour\b/gi, "在接下来1小时内"],
  [/\bbecome grammy eligible\b/gi, "获得格莱美参评资格"],
  [/\bai-generated song\b/gi, "AI生成歌曲"],
  [/\breturn for a new season\b/gi, "回归推出新一季"],
  [/\bface regulatory restrictions\b/gi, "面临监管限制"],
  [/\bdiplomatic relations\b/gi, "外交关系"],
  [/\bstreaming platform\b/gi, "流媒体平台"],
  [/\bpresidential election\b/gi, "总统大选"],
  [/\bmajor cancer treatment breakthrough\b/gi, "重大癌症治疗突破"],
  [/\bin 2026\b/gi, "在2026年"],
  [/\bthis year\b/gi, "今年"],
  [/\bthis month\b/gi, "本月"],
  [/\bin brazil\b/gi, "在巴西"],
  [/\bopen markets\b/gi, "开放市场"],
  [/\bbreaking news\b/gi, "突发新闻"],
  [/\blive comments\b/gi, "实时评论"],
  [/\bright-wing candidate\b/gi, "右翼候选人"],
  [/\bother candidate\b/gi, "其他候选人"],
  // Single words last
  [/\bwill\b/gi, "会否"],
  [/\bbrazilian\b/gi, "巴西"],
  [/\belection\b/gi, "选举"],
  [/\bmarket\b/gi, "市场"],
  [/\bfinal\b/gi, "决赛"],
  [/\breach\b/gi, "进入"],
  [/\bfeatured\b/gi, "精选"],
  [/\bread\b/gi, "阅读"],
  [/\bview\b/gi, "查看"],
  [/\bbuy\b/gi, "买入"],
  [/\byes\b/gi, "是"],
  [/\bno\b/gi, "否"],
];

function countCJK(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}]/gu) || []).length;
}

function normalizeKey(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function toChineseFallback(text: string, language: string): string {
  if (language !== "zh" || !text) return text;

  const key = normalizeKey(text);
  const exact = EXACT_TITLE_MAP[key];
  if (exact) return exact;

  let result = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // Only return the partially-replaced string if it's meaningfully Chinese
  // (≥12% CJK chars of non-whitespace). Otherwise the original reads better.
  const nonSpace = result.replace(/\s/g, "").length;
  const ratio = nonSpace > 0 ? countCJK(result) / nonSpace : 0;
  return ratio >= 0.12 ? result : text;
}
