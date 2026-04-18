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

  // --- Market events seen in app ---
  "will nato admit a new member in 2026?": "北约会在2026年接纳新成员吗？",
  "will brazil win more than 10 medals at the 2028 la olympics?": "巴西会在2028年洛杉矶奥运会赢得超过10枚奖牌吗？",
  "will the voice brasil return with a new celebrity coach in 2026?": "巴西好声音会在2026年携新明星导师回归吗？",
  "will a brazilian artist win a grammy in 2027?": "巴西艺术家会在2027年赢得格莱美奖吗？",
  "will petrobras pay a special dividend in q2 2026?": "巴西石油会在2026年第二季度派发特别股息吗？",
  "will rio de janeiro break its annual rainfall record in 2026?": "里约热内卢会在2026年打破年降雨量记录吗？",
  "will a brazilian club win the 2026 copa libertadores?": "巴西俱乐部会赢得2026年美洲解放者杯吗？",
  "will brazil top their group at the 2026 world cup?": "巴西会在2026年世界杯小组赛中排名第一吗？",
  "will pix international transfers launch in brazil in 2026?": "Pix国际转账服务会在2026年在巴西推出吗？",
  "will a brazilian netflix original become a global top 10 hit in 2026?": "巴西Netflix原创内容会在2026年跻身全球前10吗？",
  "will there be a significant internal dispute in pt before the 2026 election?": "劳工党在2026年大选前会出现重大内部纷争吗？",
  "will brazil win more than 10 medals at the 2028 olympics?": "巴西会在2028年奥运会赢得超过10枚奖牌吗？",
  "will a new brazilian tv show break viewership records in 2026?": "巴西新电视节目会在2026年打破收视记录吗？",
  "will brazil's central bank cut rates before end of 2026?": "巴西央行会在2026年底前降息吗？",
  "will bolsonaro be barred from running in 2026?": "博索纳罗会被禁止参加2026年大选吗？",
  "will brazil implement a carbon tax in 2026?": "巴西会在2026年实施碳税吗？",
  "will the copa america 2026 be held in brazil?": "2026年美洲杯会在巴西举办吗？",

  // --- Global / Tech / Climate / Politics ---
  "will 2026 be the hottest year on record globally?": "2026年会否成为全球有史以来最热的一年？",
  "will 2025 be the hottest year on record globally?": "2025年会否成为全球有史以来最热的一年？",
  "will meta launch consumer ar glasses in 2026?": "Meta会否在2026年推出消费级AR眼镜？",
  "will brazil's bacen cut the selic rate at the next copom meeting?": "巴西央行会否在下次COPOM会议上降低SELIC利率？",
  "will democrats win back the house in the 2026 midterms?": "民主党会否在2026年中期选举中赢回众议院？",
  "will republicans keep the house in the 2026 midterms?": "共和党会否在2026年中期选举中保住众议院？",
  "will trump be impeached in 2026?": "特朗普会否在2026年遭到弹劾？",
  "will the us default on its debt in 2026?": "美国会否在2026年发生债务违约？",
  "will openai release gpt-5 in 2026?": "OpenAI会否在2026年发布GPT-5？",
  "will apple release a foldable iphone in 2026?": "苹果会否在2026年发布折叠屏iPhone？",
  "will elon musk remain ceo of tesla in 2026?": "埃隆·马斯克会否在2026年继续担任特斯拉CEO？",
  "will tesla launch its robotaxi service in 5+ cities by end of 2026?": "特斯拉会否在2026年底前于5个以上城市推出无人出租车服务？",
  "will there be a us recession in 2026?": "美国会否在2026年陷入经济衰退？",
  "will the us enter a recession in 2026?": "美国会否在2026年陷入经济衰退？",
  "will the fed cut interest rates in 2026?": "美联储会否在2026年降息？",
  "will bitcoin reach $100,000 in 2026?": "比特币会否在2026年突破10万美元？",
  "will the dow jones hit 50,000 in 2026?": "道琼斯指数会否在2026年突破5万点？",
  "will china invade taiwan in 2026?": "中国会否在2026年入侵台湾？",

  // --- Hot topics / market event titles ---
  "will lula's approval rating stay above 40% this week?": "卢拉本周支持率会否保持在40%以上？",
  "will there be a formal ceasefire in ukraine before july 2026?": "乌克兰能否在2026年7月前实现正式停火？",
  "will alex poatan defend his ufc light heavyweight title in 2026?": "阿莱克斯·波坦能否在2026年卫冕UFC轻重量级冠军？",
  "will petrobras post a record profit in 2026?": "巴西石油能否在2026年创利润记录？",
  "will ukraine and russia reach a peace deal in 2026?": "乌克兰与俄罗斯能否在2026年达成和平协议？",
  "will russia withdraw troops from ukraine by 2026?": "俄罗斯会否在2026年之前从乌克兰撤军？",
  "will israel and hamas reach a ceasefire in 2026?": "以色列与哈马斯能否在2026年实现停火？",
  "will trump impose new tariffs in 2026?": "特朗普会否在2026年实施新关税？",
  "will the us impose new tariffs in 2026?": "美国会否在2026年实施新关税？",
  "will neymar play in a brazilian club in 2026?": "内马尔会否在2026年效力巴西俱乐部？",
  "will brazil increase its science and research budget by more than 10% in 2026?": "巴西会否在2026年将科研预算提高10%以上？",
  "which club will win the brasileirão 2026?": "哪支球队将赢得2026年巴西甲级联赛？",
  "will a sovereign wealth fund disclose bitcoin etf holdings in 2026?": "2026年是否会有主权财富基金披露比特币ETF持仓？",
  "will bbb 27 break viewership records in brazil?": "BBB 27会否打破巴西收视率记录？",
  "will tesla launch its robotaxi service in 5+ cities by end of 2026?": "特斯拉会否在2026年底前于5个以上城市推出无人出租车服务？",
  "will sbt grow its prime-time ratings by more than 15% in 2026?": "SBT会否在2026年将黄金档收视率提高15%以上？",
  "will bitcoin reach $100,000 in 2026?": "比特币会否在2026年突破10万美元？",
  "will the fed cut interest rates in 2026?": "美联储会否在2026年降息？",
  "will elon musk remain ceo of tesla in 2026?": "埃隆·马斯克会否在2026年继续担任特斯拉CEO？",
  "will apple release a foldable iphone in 2026?": "苹果会否在2026年发布折叠屏iPhone？",
  "will trump win the 2024 us presidential election?": "特朗普会否赢得2024年美国总统大选？",
  "will the us enter a recession in 2026?": "美国会否在2026年陷入经济衰退？",
  "will there be a ceasefire in ukraine in 2026?": "乌克兰会否在2026年实现停火？",
  "will china invade taiwan in 2026?": "中国会否在2026年入侵台湾？",
  "will the dow jones hit 50,000 in 2026?": "道琼斯指数会否在2026年突破5万点？",
  "will brazil qualify for the 2026 world cup?": "巴西会否晋级2026年世界杯？",
  "will vinicius jr win the ballon d'or in 2026?": "维尼修斯会否赢得2026年金球奖？",
  "will the 2026 world cup be a success?": "2026年世界杯会否成功举办？",
  "will openai release gpt-5 in 2026?": "OpenAI会否在2026年发布GPT-5？",
};

const REPLACEMENTS: Array<[RegExp, string]> = [
  // Long phrases first
  [/\bwho will win\b/gi, "谁将赢得"],
  [/\balex poatan\b/gi, "阿莱克斯·波坦"],
  [/\bformal ceasefire\b/gi, "正式停火"],
  [/\blight heavyweight\b/gi, "轻重量级"],
  [/\bapproval rating\b/gi, "支持率"],
  [/\bpost a record\b/gi, "创纪录"],
  [/\bpeace deal\b/gi, "和平协议"],
  [/\bpeace talks\b/gi, "和平谈判"],
  [/\bin ukraine\b/gi, "在乌克兰"],
  [/\bfrom ukraine\b/gi, "从乌克兰"],
  [/\bstay above\b/gi, "保持高于"],
  [/\bstay below\b/gi, "保持低于"],
  [/\bwithdraw troops\b/gi, "撤军"],
  [/\bnew tariffs\b/gi, "新关税"],
  [/\bimpose.*tariffs?\b/gi, "实施关税"],
  [/\bconsumer ar glasses\b/gi, "消费级AR眼镜"],
  [/\bar glasses\b/gi, "AR眼镜"],
  [/\bselic rate\b/gi, "SELIC利率"],
  [/\bhottest year on record\b/gi, "史上最热年份"],
  [/\bon record\b/gi, "有史以来"],
  [/\bwin back the house\b/gi, "赢回众议院"],
  [/\bthe house\b/gi, "众议院"],
  [/\bthe senate\b/gi, "参议院"],
  [/\bmidterms?\b/gi, "中期选举"],
  [/\bcopa libertadores\b/gi, "美洲解放者杯"],
  [/\bcopa do brasil\b/gi, "巴西杯"],
  [/\bcopa america\b/gi, "美洲杯"],
  [/\bworld cup\b/gi, "世界杯"],
  [/\bla olympics\b/gi, "洛杉矶奥运会"],
  [/\bthe olympics\b/gi, "奥运会"],
  [/\bolympics\b/gi, "奥运会"],
  [/\bgrammy\b/gi, "格莱美奖"],
  [/\bnato\b/gi, "北约"],
  [/\bpetrobras\b/gi, "巴西石油"],
  [/\bbolsonaro\b/gi, "博索纳罗"],
  [/\bneymar\b/gi, "内马尔"],
  [/\bvinicius\b/gi, "维尼修斯"],
  [/\bflamengo\b/gi, "弗拉门戈"],
  [/\btiktok\b/gi, "TikTok"],
  [/\bnetflix\b/gi, "Netflix"],
  [/\bballon d'or\b/gi, "金球奖"],
  [/\bpresidential election\b/gi, "总统大选"],
  [/\bdiplomatic relations\b/gi, "外交关系"],
  [/\bstreaming platform\b/gi, "流媒体平台"],
  [/\bmajor cancer treatment breakthrough\b/gi, "重大癌症治疗突破"],
  [/\bbecome grammy eligible\b/gi, "获得格莱美参评资格"],
  [/\bai-generated song\b/gi, "AI生成歌曲"],
  [/\breturn for a new season\b/gi, "回归推出新一季"],
  [/\bface regulatory restrictions\b/gi, "面临监管限制"],
  [/\bright-wing candidate\b/gi, "右翼候选人"],
  [/\bother candidate\b/gi, "其他候选人"],
  [/\bstay between\b/gi, "维持在"],
  [/\bin 1 hour\b/gi, "在1小时内"],
  [/\bin the next hour\b/gi, "在接下来1小时内"],
  [/\bmore than\b/gi, "超过"],
  [/\btop their group\b/gi, "小组赛排名第一"],
  [/\bbreak.*record\b/gi, "打破记录"],
  [/\binternal dispute\b/gi, "内部纷争"],
  [/\bspecial dividend\b/gi, "特别股息"],
  [/\brainfall record\b/gi, "降雨量记录"],
  [/\bcelebrity coach\b/gi, "明星导师"],
  [/\bnew member\b/gi, "新成员"],
  [/\bin 2026\b/gi, "在2026年"],
  [/\bin 2027\b/gi, "在2027年"],
  [/\bin 2028\b/gi, "在2028年"],
  [/\bby 2026\b/gi, "到2026年"],
  [/\bthis year\b/gi, "今年"],
  [/\bthis month\b/gi, "本月"],
  [/\bin brazil\b/gi, "在巴西"],
  [/\bin q2\b/gi, "在第二季度"],
  [/\bopen markets\b/gi, "开放市场"],
  [/\bbreaking news\b/gi, "突发新闻"],
  [/\blive comments\b/gi, "实时评论"],
  // Medium phrases
  [/\bwill an?\b/gi, "会否有"],
  [/\bwill the\b/gi, "会否"],
  // Single words last
  [/\bwill\b/gi, "会否"],
  [/\bbrazilian\b/gi, "巴西"],
  [/\bbrazil\b/gi, "巴西"],
  [/\belection\b/gi, "选举"],
  [/\bmarket\b/gi, "市场"],
  [/\bfinal\b/gi, "决赛"],
  [/\breach\b/gi, "进入"],
  [/\bwin\b/gi, "赢得"],
  [/\bmedals?\b/gi, "枚奖牌"],
  [/\bartist\b/gi, "艺术家"],
  [/\badmit\b/gi, "接纳"],
  [/\bmember\b/gi, "成员"],
  [/\brecord\b/gi, "记录"],
  [/\bannual\b/gi, "年度"],
  [/\bfeatured\b/gi, "精选"],
  [/\bread\b/gi, "阅读"],
  [/\bview\b/gi, "查看"],
  [/\bbuy\b/gi, "买入"],
  [/\bglobally\b/gi, "全球"],
  [/\bhottest\b/gi, "最热的"],
  [/\bdemocrats?\b/gi, "民主党"],
  [/\brepublicans?\b/gi, "共和党"],
  [/\bimpeach\w*\b/gi, "弹劾"],
  [/\bdefault on.*debt\b/gi, "债务违约"],
  [/\bbacen\b/gi, "巴西央行"],
  [/\bselic\b/gi, "SELIC"],
  [/\bcopom\b/gi, "COPOM"],
  [/\bmeta\b(?!verse)/gi, "Meta"],
  [/\bukraine\b/gi, "乌克兰"],
  [/\brussia\b/gi, "俄罗斯"],
  [/\bisrael\b/gi, "以色列"],
  [/\bhamas\b/gi, "哈马斯"],
  [/\bpoatan\b/gi, "波坦"],
  [/\blula's\b/gi, "卢拉的"],
  [/\blula\b/gi, "卢拉"],
  [/\bufc\b/gi, "UFC"],
  [/\bdefend\b/gi, "卫冕"],
  [/\bprofit\b/gi, "利润"],
  [/\btariffs?\b/gi, "关税"],
  [/\bceasefire\b/gi, "停火"],
  [/\bthis week\b/gi, "本周"],
  [/\babove\b/gi, "以上"],
  [/\bbelow\b/gi, "以下"],
  [/\btitle\b/gi, "冠军"],
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
  // 30 % threshold: needs roughly 1 CJK char per 3 non-space chars to pass.
  // This prevents "会否 Neymar play in a 巴西 club 在2026年?" from showing
  // while still allowing short questions that are mostly translated.
  return ratio >= 0.30 ? result : text;
}
