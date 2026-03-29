"""
app/services/event_generator.py

Generates diverse prediction events across:
- Brazilian politics & elections
- Brazilian economy & markets
- Global crypto prices (CoinGecko)
- International sports (Copa, F1, NBA)
- Technology & AI news
- Global geopolitics

Snapshots every 5 minutes, new events every 60 minutes.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.probability_history import ScenarioProbabilityHistory
from app.models.prediction import Prediction
from app.models.account import Account

logger = logging.getLogger(__name__)

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
COINS = {"bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "binancecoin": "BNB"}
CURRENCY = "usd"

SNAPSHOT_INTERVAL_SECONDS = 5 * 60
_snapshot_count = 0

_eg_price_cache: dict[str, float] = {}
_eg_price_cache_time: float = 0
EG_PRICE_CACHE_TTL = 180  # 3 minutes


# ---------------------------------------------------------------------------
# Static diverse event templates
# These rotate — a random subset gets created each hour
# ---------------------------------------------------------------------------

STATIC_EVENTS = [
    # ── Brazilian Politics ──────────────────────────────────────────────────
    {
        "slug_key": "br-lula-approval-week",
        "title": "Will Lula's approval rating stay above 40% this week?",
        "title_pt": "A aprovação de Lula vai ficar acima de 40% esta semana?",
        "description": "Latest Datafolha poll shows Lula at 38–42%. Will he hold above 40% in this week's release?",
        "description_pt": "A última pesquisa Datafolha mostra Lula entre 38–42%. Ele vai manter acima de 40% na divulgação desta semana?",
        "category": "politics",
        "scenarios": [("Yes", 55), ("No", 45)],
        "scenarios_pt": [("Sim", 55), ("Não", 45)],
    },
    {
        "slug_key": "br-congress-pec-pass",
        "title": "Will the Brazilian Congress pass a new fiscal PEC this month?",
        "title_pt": "O Congresso brasileiro vai aprovar uma nova PEC fiscal este mês?",
        "description": "The government is pushing for a constitutional amendment on spending. Will it be voted on and pass before month end?",
        "description_pt": "O governo está pressionando por uma emenda constitucional sobre gastos. Será votada e aprovada antes do fim do mês?",
        "category": "politics",
        "scenarios": [("Yes — passes", 38), ("No — delayed", 62)],
        "scenarios_pt": [("Sim — aprovada", 38), ("Não — adiada", 62)],
    },
    {
        "slug_key": "br-stf-ruling",
        "title": "Will the STF issue a major ruling on social media regulation this week?",
        "title_pt": "O STF vai emitir uma decisão importante sobre regulação de redes sociais esta semana?",
        "description": "Brazil's Supreme Court (STF) has been deliberating on platform liability. Will a decisive vote happen this week?",
        "description_pt": "O STF está deliberando sobre responsabilidade das plataformas. Haverá votação decisiva esta semana?",
        "category": "politics",
        "scenarios": [("Yes", 42), ("No", 58)],
        "scenarios_pt": [("Sim", 42), ("Não", 58)],
    },
    {
        "slug_key": "br-election-2026-lula",
        "title": "Will Lula announce his 2026 re-election bid before June?",
        "title_pt": "Lula vai anunciar sua candidatura à reeleição em 2026 antes de junho?",
        "description": "Political analysts expect a formal announcement in the first half of 2026. Will it come before June 1st?",
        "description_pt": "Analistas políticos esperam um anúncio formal no primeiro semestre de 2026. Virá antes de 1º de junho?",
        "category": "politics",
        "scenarios": [("Yes — before June", 61), ("No — after June", 39)],
        "scenarios_pt": [("Sim — antes de junho", 61), ("Não — depois de junho", 39)],
    },
    {
        "slug_key": "br-bolsonaro-ineligible",
        "title": "Will Bolsonaro remain ineligible for the 2026 election?",
        "title_pt": "Bolsonaro vai continuar inelegível para a eleição de 2026?",
        "description": "Bolsonaro was declared ineligible until 2030. Will this ruling stand through 2026?",
        "description_pt": "Bolsonaro foi declarado inelegível até 2030. Essa decisão vai se manter ao longo de 2026?",
        "category": "politics",
        "scenarios": [("Yes — stays ineligible", 72), ("No — overturned", 28)],
        "scenarios_pt": [("Sim — continua inelegível", 72), ("Não — decisão revertida", 28)],
    },

    # ── Brazilian Economy ───────────────────────────────────────────────────
    {
        "slug_key": "br-selic-cut-next",
        "title": "Will Brazil's BACEN cut the Selic rate at the next COPOM meeting?",
        "title_pt": "O BACEN vai cortar a Selic na próxima reunião do COPOM?",
        "description": "The COPOM meets soon. With inflation above target, will they cut, hold, or hike?",
        "description_pt": "O COPOM se reúne em breve. Com a inflação acima da meta, vão cortar, manter ou aumentar?",
        "category": "economy",
        "scenarios": [("Cut — below current", 25), ("Hold", 55), ("Hike", 20)],
        "scenarios_pt": [("Cortar — abaixo do atual", 25), ("Manter", 55), ("Aumentar", 20)],
    },
    {
        "slug_key": "br-dollar-real-6",
        "title": "Will USD/BRL close above R$6.00 this week?",
        "title_pt": "O USD/BRL vai fechar acima de R$6,00 esta semana?",
        "description": "The Real has been under pressure. Will the dollar close above 6 reais at any point this week?",
        "description_pt": "O Real tem estado sob pressão. O dólar vai fechar acima de 6 reais em algum momento desta semana?",
        "category": "economy",
        "scenarios": [("Yes — above R$6.00", 48), ("No — stays below", 52)],
        "scenarios_pt": [("Sim — acima de R$6,00", 48), ("Não — fica abaixo", 52)],
    },
    {
        "slug_key": "br-ibovespa-130k",
        "title": "Will the Ibovespa close above 130,000 points by end of month?",
        "title_pt": "O Ibovespa vai fechar acima de 130.000 pontos até o fim do mês?",
        "description": "Brazil's main index is near 125k. Will it reach 130k before month end?",
        "description_pt": "O principal índice brasileiro está perto de 125k. Vai chegar a 130k antes do fim do mês?",
        "category": "economy",
        "scenarios": [("Yes", 34), ("No", 66)],
        "scenarios_pt": [("Sim", 34), ("Não", 66)],
    },
    {
        "slug_key": "br-inflation-ipca",
        "title": "Will Brazil's IPCA inflation stay below 5% this year?",
        "title_pt": "A inflação IPCA do Brasil vai ficar abaixo de 5% este ano?",
        "description": "Annual inflation is currently tracking near 4.8%. Will it finish 2026 under 5%?",
        "description_pt": "A inflação anual está em cerca de 4,8%. Vai encerrar 2026 abaixo de 5%?",
        "category": "economy",
        "scenarios": [("Yes — under 5%", 44), ("No — above 5%", 56)],
        "scenarios_pt": [("Sim — abaixo de 5%", 44), ("Não — acima de 5%", 56)],
    },
    {
        "slug_key": "br-pib-growth",
        "title": "Will Brazil's GDP grow more than 2% in 2026?",
        "title_pt": "O PIB do Brasil vai crescer mais de 2% em 2026?",
        "description": "IMF projects 1.9% growth. Will Brazil beat 2% GDP expansion this year?",
        "description_pt": "O FMI projeta crescimento de 1,9%. O Brasil vai superar os 2% de expansão do PIB este ano?",
        "category": "economy",
        "scenarios": [("Yes — above 2%", 41), ("No — 2% or less", 59)],
        "scenarios_pt": [("Sim — acima de 2%", 41), ("Não — 2% ou menos", 59)],
    },

    # ── International Sports ────────────────────────────────────────────────
    {
        "slug_key": "f1-next-race-winner",
        "title": "Will Verstappen win the next Formula 1 Grand Prix?",
        "title_pt": "Verstappen vai vencer o próximo Grande Prêmio de Fórmula 1?",
        "description": "Max Verstappen leads the championship. Will he take victory at the next race?",
        "description_pt": "Max Verstappen lidera o campeonato. Ele vai vencer na próxima corrida?",
        "category": "sports",
        "scenarios": [("Yes — Verstappen wins", 38), ("No — another driver", 62)],
        "scenarios_pt": [("Sim — Verstappen vence", 38), ("Não — outro piloto", 62)],
    },
    {
        "slug_key": "copa-brasil-flamengo",
        "title": "Will Flamengo reach the Copa do Brasil final this year?",
        "title_pt": "O Flamengo vai chegar à final da Copa do Brasil este ano?",
        "description": "Flamengo is one of the favorites. Will they make it to the final stage?",
        "description_pt": "O Flamengo é um dos favoritos. Eles vão chegar à fase final?",
        "category": "sports",
        "scenarios": [("Yes", 52), ("No", 48)],
        "scenarios_pt": [("Sim", 52), ("Não", 48)],
    },
    {
        "slug_key": "nba-playoffs-lakers",
        "title": "Will the Lakers make the NBA playoffs this season?",
        "title_pt": "O Lakers vai classificar para os playoffs da NBA nesta temporada?",
        "description": "Los Angeles is battling for a play-in spot. Will they secure full playoff berth?",
        "description_pt": "Los Angeles está brigando por uma vaga no play-in. Vão garantir a classificação completa aos playoffs?",
        "category": "sports",
        "scenarios": [("Yes — playoffs", 58), ("No — miss out", 42)],
        "scenarios_pt": [("Sim — playoffs", 58), ("Não — eliminado", 42)],
    },
    {
        "slug_key": "world-cup-2026-brazil",
        "title": "Will Brazil win the 2026 FIFA World Cup?",
        "title_pt": "O Brasil vai vencer a Copa do Mundo FIFA 2026?",
        "description": "Brazil hosts the 2026 Copa America warm-up. What are the odds they lift the trophy in 2026?",
        "description_pt": "O Brasil sedia o aquecimento da Copa América 2026. Quais são as chances de levantar o troféu?",
        "category": "sports",
        "scenarios": [("Yes — Brazil wins", 22), ("No — another country", 78)],
        "scenarios_pt": [("Sim — Brasil campeão", 22), ("Não — outro país", 78)],
    },
    {
        "slug_key": "libertadores-2026",
        "title": "Will a Brazilian club win the 2026 Copa Libertadores?",
        "title_pt": "Um clube brasileiro vai vencer a Copa Libertadores 2026?",
        "description": "Brazilian clubs have dominated recently. Will Flamengo, Fluminense, or Atletico MG take the title?",
        "description_pt": "Clubes brasileiros têm dominado recentemente. Flamengo, Fluminense ou Atlético-MG vão levar o título?",
        "category": "sports",
        "scenarios": [("Yes — Brazilian club", 45), ("No — Argentine/other", 55)],
        "scenarios_pt": [("Sim — clube brasileiro", 45), ("Não — argentino/outro", 55)],
    },

    # ── Technology & AI ─────────────────────────────────────────────────────
    {
        "slug_key": "openai-gpt6-release-2026",
        "title": "Will OpenAI release GPT-6 before end of 2026?",
        "title_pt": "A OpenAI vai lançar o GPT-6 antes do fim de 2026?",
        "description": "With GPT-5 already out, the AI race continues. Will OpenAI ship GPT-6 by December 2026?",
        "description_pt": "Com o GPT-5 já lançado, a corrida de IA continua. A OpenAI vai lançar o GPT-6 até dezembro de 2026?",
        "category": "technology",
        "scenarios": [("Yes", 31), ("No", 69)],
        "scenarios_pt": [("Sim", 31), ("Não", 69)],
    },
    {
        "slug_key": "tesla-robotaxi-launch",
        "title": "Will Tesla launch its robotaxi service in a major city by end of 2026?",
        "title_pt": "A Tesla vai lançar seu serviço de robotáxi em uma grande cidade até o fim de 2026?",
        "description": "Elon Musk has promised fully autonomous robotaxis. Will it happen in any major US city this year?",
        "description_pt": "Elon Musk prometeu robotáxis totalmente autônomos. Isso vai acontecer em alguma grande cidade dos EUA este ano?",
        "category": "technology",
        "scenarios": [("Yes", 32), ("No", 68)],
        "scenarios_pt": [("Sim", 32), ("Não", 68)],
    },
    {
        "slug_key": "apple-ai-iphone",
        "title": "Will Apple's AI features overtake Google Assistant in usage by Q3 2026?",
        "title_pt": "Os recursos de IA da Apple vão superar o Google Assistant em uso até o 3T de 2026?",
        "description": "Apple Intelligence is expanding rapidly. Will it surpass Google Assistant in active user count?",
        "description_pt": "O Apple Intelligence está se expandindo rapidamente. Vai superar o Google Assistant em usuários ativos?",
        "category": "technology",
        "scenarios": [("Yes", 29), ("No", 71)],
        "scenarios_pt": [("Sim", 29), ("Não", 71)],
    },
    {
        "slug_key": "brazil-5g-coverage",
        "title": "Will 5G cover 80% of Brazilian cities by end of 2026?",
        "title_pt": "O 5G vai cobrir 80% das cidades brasileiras até o fim de 2026?",
        "description": "Brazil's 5G rollout is underway. Will Anatel's coverage targets be met this year?",
        "description_pt": "A implantação do 5G no Brasil está em andamento. As metas de cobertura da Anatel serão atingidas este ano?",
        "category": "technology",
        "scenarios": [("Yes — 80%+", 47), ("No — below 80%", 53)],
        "scenarios_pt": [("Sim — 80%+", 47), ("Não — abaixo de 80%", 53)],
    },

    # ── Global Geopolitics ──────────────────────────────────────────────────
    {
        "slug_key": "ukraine-ceasefire-2026",
        "title": "Will there be a formal ceasefire in Ukraine before July 2026?",
        "title_pt": "Haverá um cessar-fogo formal na Ucrânia antes de julho de 2026?",
        "description": "Peace talks have been discussed by multiple mediators. Will a formal halt to hostilities be declared?",
        "description_pt": "Negociações de paz foram discutidas por múltiplos mediadores. Um cessar-fogo formal será declarado?",
        "category": "geopolitics",
        "scenarios": [("Yes — ceasefire by July", 31), ("No — conflict continues", 69)],
        "scenarios_pt": [("Sim — cessar-fogo até julho", 31), ("Não — conflito continua", 69)],
    },
    {
        "slug_key": "trump-tariffs-brazil",
        "title": "Will Trump impose new tariffs on Brazilian exports in 2026?",
        "title_pt": "Trump vai impor novas tarifas sobre as exportações brasileiras em 2026?",
        "description": "The US has threatened tariffs on steel and agricultural goods. Will Brazil face new trade barriers?",
        "description_pt": "Os EUA ameaçaram tarifas sobre aço e produtos agrícolas. O Brasil vai enfrentar novas barreiras comerciais?",
        "category": "geopolitics",
        "scenarios": [("Yes — new tariffs", 44), ("No — exempt", 56)],
        "scenarios_pt": [("Sim — novas tarifas", 44), ("Não — isento", 56)],
    },
    {
        "slug_key": "fed-rate-cut-june",
        "title": "Will the US Federal Reserve cut rates at the June 2026 meeting?",
        "title_pt": "O Federal Reserve dos EUA vai cortar os juros na reunião de junho de 2026?",
        "description": "Markets are pricing in one more cut. Will the Fed deliver before summer?",
        "description_pt": "Os mercados precificam mais um corte. O Fed vai entregar antes do verão?",
        "category": "geopolitics",
        "scenarios": [("Yes — cut in June", 52), ("No — hold or hike", 48)],
        "scenarios_pt": [("Sim — corte em junho", 52), ("Não — manter ou subir", 48)],
    },
    {
        "slug_key": "china-taiwan-2026",
        "title": "Will China conduct military exercises near Taiwan this quarter?",
        "title_pt": "A China vai realizar exercícios militares perto de Taiwan neste trimestre?",
        "description": "Tensions in the Taiwan Strait remain elevated. Will China announce or conduct military drills?",
        "description_pt": "As tensões no Estreito de Taiwan continuam elevadas. A China vai anunciar ou realizar exercícios militares?",
        "category": "geopolitics",
        "scenarios": [("Yes", 61), ("No", 39)],
        "scenarios_pt": [("Sim", 61), ("Não", 39)],
    },
    {
        "slug_key": "brics-expansion-2026",
        "title": "Will BRICS admit a new member nation in 2026?",
        "title_pt": "O BRICS vai admitir um novo país membro em 2026?",
        "description": "Several countries have applied for BRICS membership. Will the bloc officially expand this year?",
        "description_pt": "Vários países solicitaram adesão ao BRICS. O bloco vai se expandir oficialmente este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 58), ("No", 42)],
        "scenarios_pt": [("Sim", 58), ("Não", 42)],
    },

    # ── Brazilian Sports ─────────────────────────────────────────────────────
    {
        "slug_key": "br-palmeiras-title-2026",
        "title": "Will Palmeiras win the 2026 Brasileirão?",
        "title_pt": "O Palmeiras vai vencer o Brasileirão 2026?",
        "description": "Palmeiras has been dominant in recent years. Will they take the national title again?",
        "description_pt": "O Palmeiras tem sido dominante nos últimos anos. Eles vão conquistar o título nacional novamente?",
        "category": "sports",
        "scenarios": [("Yes", 28), ("No", 72)],
        "scenarios_pt": [("Sim", 28), ("Não", 72)],
    },
    {
        "slug_key": "br-neymar-return-2026",
        "title": "Will Neymar play in a Brazilian club in 2026?",
        "title_pt": "Neymar vai jogar em um clube brasileiro em 2026?",
        "description": "Neymar's future remains uncertain after injuries. Will he return to play in Brazil this year?",
        "description_pt": "O futuro de Neymar continua incerto após lesões. Ele vai voltar a jogar no Brasil este ano?",
        "category": "sports",
        "scenarios": [("Yes", 45), ("No", 55)],
        "scenarios_pt": [("Sim", 45), ("Não", 55)],
    },
    {
        "slug_key": "br-vasco-relegation",
        "title": "Will Vasco be relegated from Serie A in 2026?",
        "title_pt": "O Vasco vai ser rebaixado da Série A em 2026?",
        "description": "Vasco is fighting to stay up. Will they survive the relegation battle this season?",
        "description_pt": "O Vasco está lutando para se manter. Eles vão sobreviver à batalha contra o rebaixamento nesta temporada?",
        "category": "sports",
        "scenarios": [("Yes — relegated", 38), ("No — stays up", 62)],
        "scenarios_pt": [("Sim — rebaixado", 38), ("Não — fica na Série A", 62)],
    },
    {
        "slug_key": "br-selecao-copa-2026-group",
        "title": "Will Brazil top their group at the 2026 World Cup?",
        "title_pt": "O Brasil vai terminar em primeiro no grupo na Copa do Mundo 2026?",
        "description": "Brazil is among the top seeds. Will they finish first in their World Cup group stage?",
        "description_pt": "O Brasil está entre os principais favoritos. Eles vão terminar em primeiro no grupo?",
        "category": "sports",
        "scenarios": [("Yes", 67), ("No", 33)],
        "scenarios_pt": [("Sim", 67), ("Não", 33)],
    },
    {
        "slug_key": "ufc-next-brazilian-champ",
        "title": "Will a Brazilian fighter win a UFC title this year?",
        "title_pt": "Um lutador brasileiro vai conquistar um cinturão do UFC este ano?",
        "description": "Brazil has a strong UFC presence. Will any Brazilian athlete claim a championship belt in 2026?",
        "description_pt": "O Brasil tem forte presença no UFC. Algum atleta brasileiro vai conquistar um cinturão em 2026?",
        "category": "sports",
        "scenarios": [("Yes", 42), ("No", 58)],
        "scenarios_pt": [("Sim", 42), ("Não", 58)],
    },

    # ── Brazilian Economy (more) ─────────────────────────────────────────────
    {
        "slug_key": "br-petrobras-dividend",
        "title": "Will Petrobras pay a special dividend in Q2 2026?",
        "title_pt": "A Petrobras vai pagar dividendo extraordinário no 2T de 2026?",
        "description": "Petrobras has been generous with dividends. Will they announce an extraordinary payment this quarter?",
        "description_pt": "A Petrobras tem sido generosa com dividendos. Vão anunciar um pagamento extraordinário neste trimestre?",
        "category": "economy",
        "scenarios": [("Yes", 54), ("No", 46)],
        "scenarios_pt": [("Sim", 54), ("Não", 46)],
    },
    {
        "slug_key": "br-vale-iron-price",
        "title": "Will Vale's stock close above R$70 by end of month?",
        "title_pt": "As ações da Vale vão fechar acima de R$70 até o fim do mês?",
        "description": "Vale is highly correlated with iron ore prices. Will VALE3 reach R$70?",
        "description_pt": "A Vale está altamente correlacionada com os preços do minério de ferro. A VALE3 vai chegar a R$70?",
        "category": "economy",
        "scenarios": [("Yes", 37), ("No", 63)],
        "scenarios_pt": [("Sim", 37), ("Não", 63)],
    },
    {
        "slug_key": "br-unemployment-below-6",
        "title": "Will Brazil's unemployment fall below 6% in 2026?",
        "title_pt": "O desemprego no Brasil vai cair abaixo de 6% em 2026?",
        "description": "Brazil's unemployment rate is near 6.5%. Will it dip below the historic 6% threshold this year?",
        "description_pt": "A taxa de desemprego no Brasil está perto de 6,5%. Vai cair abaixo do histórico de 6% este ano?",
        "category": "economy",
        "scenarios": [("Yes", 29), ("No", 71)],
        "scenarios_pt": [("Sim", 29), ("Não", 71)],
    },
    {
        "slug_key": "br-nubank-expansion",
        "title": "Will Nubank reach 120 million customers in 2026?",
        "title_pt": "O Nubank vai atingir 120 milhões de clientes em 2026?",
        "description": "Nubank has been growing rapidly across Latin America. Will they hit 120M customers this year?",
        "description_pt": "O Nubank tem crescido rapidamente na América Latina. Vão atingir 120 milhões de clientes este ano?",
        "category": "economy",
        "scenarios": [("Yes", 61), ("No", 39)],
        "scenarios_pt": [("Sim", 61), ("Não", 39)],
    },

    # ── Global Technology (more) ──────────────────────────────────────────────
    {
        "slug_key": "meta-ar-glasses-2026",
        "title": "Will Meta launch consumer AR glasses in 2026?",
        "title_pt": "A Meta vai lançar óculos de realidade aumentada para o consumidor em 2026?",
        "description": "Meta has been developing Orion AR glasses. Will a consumer version hit the market this year?",
        "description_pt": "A Meta vem desenvolvendo os óculos AR Orion. Uma versão para o consumidor vai chegar ao mercado este ano?",
        "category": "technology",
        "scenarios": [("Yes", 24), ("No", 76)],
        "scenarios_pt": [("Sim", 24), ("Não", 76)],
    },
    {
        "slug_key": "bitcoin-100k-2026",
        "title": "Will Bitcoin reach $100,000 before the end of 2026?",
        "title_pt": "O Bitcoin vai chegar a $100.000 antes do fim de 2026?",
        "description": "BTC has been consolidating after its 2024 ATH. Will it break $100k again this year?",
        "description_pt": "O BTC tem se consolidado após sua máxima histórica de 2024. Vai romper $100k novamente este ano?",
        "category": "crypto",
        "scenarios": [("Yes", 48), ("No", 52)],
        "scenarios_pt": [("Sim", 48), ("Não", 52)],
    },
    {
        "slug_key": "ethereum-eth-etf-flows",
        "title": "Will Ethereum ETF inflows exceed $1B in a single week in 2026?",
        "title_pt": "Os ETFs de Ethereum vão ter entradas acima de $1 bilhão em uma semana em 2026?",
        "description": "Ethereum ETFs have been gaining traction. Will we see a single week of $1B+ inflows?",
        "description_pt": "Os ETFs de Ethereum estão ganhando tração. Vamos ver uma semana com mais de $1 bilhão em entradas?",
        "category": "crypto",
        "scenarios": [("Yes", 33), ("No", 67)],
        "scenarios_pt": [("Sim", 33), ("Não", 67)],
    },
    {
        "slug_key": "nvidia-stock-ath-2026",
        "title": "Will Nvidia stock hit a new all-time high in Q2 2026?",
        "title_pt": "As ações da Nvidia vão atingir nova máxima histórica no 2T de 2026?",
        "description": "Nvidia has been the AI darling. Will NVDA set a new record in the second quarter?",
        "description_pt": "A Nvidia tem sido a queridinha da IA. A NVDA vai bater um novo recorde no segundo trimestre?",
        "category": "technology",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "x-twitter-profitability",
        "title": "Will X (Twitter) turn profitable in 2026?",
        "title_pt": "O X (Twitter) vai se tornar lucrativo em 2026?",
        "description": "Elon Musk has promised to make X profitable. Will the platform achieve positive EBITDA this year?",
        "description_pt": "Elon Musk prometeu tornar o X lucrativo. A plataforma vai atingir EBITDA positivo este ano?",
        "category": "technology",
        "scenarios": [("Yes", 31), ("No", 69)],
        "scenarios_pt": [("Sim", 31), ("Não", 69)],
    },

    # ── Global Geopolitics (more) ─────────────────────────────────────────────
    {
        "slug_key": "iran-nuclear-deal-2026",
        "title": "Will Iran reach a new nuclear agreement in 2026?",
        "title_pt": "O Irã vai alcançar um novo acordo nuclear em 2026?",
        "description": "Diplomatic talks with Iran have been ongoing. Will a formal deal be reached this year?",
        "description_pt": "As negociações diplomáticas com o Irã continuam. Um acordo formal será alcançado este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 22), ("No", 78)],
        "scenarios_pt": [("Sim", 22), ("Não", 78)],
    },
    {
        "slug_key": "india-gdp-overtake-japan",
        "title": "Will India overtake Japan as the world's 3rd largest economy in 2026?",
        "title_pt": "A Índia vai superar o Japão como a 3ª maior economia do mundo em 2026?",
        "description": "India's GDP has been closing the gap with Japan. Will they officially become #3 this year?",
        "description_pt": "O PIB da Índia tem se aproximado do Japão. Eles vão se tornar oficialmente a #3 este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 55), ("No", 45)],
        "scenarios_pt": [("Sim", 55), ("Não", 45)],
    },
    {
        "slug_key": "eu-ai-act-enforcement",
        "title": "Will the EU begin enforcing its AI Act in 2026?",
        "title_pt": "A UE vai começar a aplicar sua Lei de IA em 2026?",
        "description": "The EU AI Act has passed. Will member states begin enforcement proceedings against violators this year?",
        "description_pt": "A Lei de IA da UE foi aprovada. Os estados-membros vão iniciar procedimentos de execução este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 63), ("No", 37)],
        "scenarios_pt": [("Sim", 63), ("Não", 37)],
    },
    {
        "slug_key": "opec-production-cut",
        "title": "Will OPEC+ announce a production cut in H1 2026?",
        "title_pt": "A OPEP+ vai anunciar um corte de produção no 1S de 2026?",
        "description": "Oil prices have been volatile. Will OPEC+ agree to cut output in the first half of the year?",
        "description_pt": "Os preços do petróleo têm sido voláteis. A OPEP+ vai concordar em cortar a produção no primeiro semestre?",
        "category": "geopolitics",
        "scenarios": [("Yes", 47), ("No", 53)],
        "scenarios_pt": [("Sim", 47), ("Não", 53)],
    },

    # ── Brazilian Politics (more) ─────────────────────────────────────────────
    {
        "slug_key": "br-ministerio-reforma",
        "title": "Will Lula reshuffle his cabinet before mid-2026?",
        "title_pt": "Lula vai reformar o ministério antes de meados de 2026?",
        "description": "Political pressure has been mounting on several ministers. Will there be a cabinet reshuffle?",
        "description_pt": "A pressão política sobre vários ministros tem aumentado. Haverá uma reforma ministerial?",
        "category": "politics",
        "scenarios": [("Yes", 58), ("No", 42)],
        "scenarios_pt": [("Sim", 58), ("Não", 42)],
    },
    {
        "slug_key": "br-amazon-deforestation",
        "title": "Will Amazon deforestation fall below 5,000 km² in 2026?",
        "title_pt": "O desmatamento da Amazônia vai cair abaixo de 5.000 km² em 2026?",
        "description": "Deforestation has been declining under the current government. Will it reach the 5,000 km² target?",
        "description_pt": "O desmatamento tem diminuído com o governo atual. Vai atingir a meta de 5.000 km²?",
        "category": "politics",
        "scenarios": [("Yes", 41), ("No", 59)],
        "scenarios_pt": [("Sim", 41), ("Não", 59)],
    },
    {
        "slug_key": "br-pix-international",
        "title": "Will Brazil launch international Pix transfers in 2026?",
        "title_pt": "O Brasil vai lançar transferências internacionais via Pix em 2026?",
        "description": "Banco Central has been working on cross-border Pix. Will it launch officially this year?",
        "description_pt": "O Banco Central tem trabalhado no Pix internacional. Vai ser lançado oficialmente este ano?",
        "category": "economy",
        "scenarios": [("Yes", 52), ("No", 48)],
        "scenarios_pt": [("Sim", 52), ("Não", 48)],
    },
    {
        "slug_key": "br-embraer-record-delivery",
        "title": "Will Embraer deliver a record number of aircraft in 2026?",
        "title_pt": "A Embraer vai entregar um número recorde de aeronaves em 2026?",
        "description": "Embraer has seen strong orders. Will they beat their delivery record this year?",
        "description_pt": "A Embraer tem registrado pedidos fortes. Eles vão bater o recorde de entregas este ano?",
        "category": "economy",
        "scenarios": [("Yes", 46), ("No", 54)],
        "scenarios_pt": [("Sim", 46), ("Não", 54)],
    },

    # ── Brazilian Politics (extra) ────────────────────────────────────────────
    {
        "slug_key": "br-lula-popularity-q2",
        "title": "Will Lula's approval rating exceed 45% by Q2 2026?",
        "title_pt": "A aprovação de Lula vai superar 45% no 2T de 2026?",
        "description": "Lula's ratings have been recovering. Will he break the 45% mark this quarter?",
        "description_pt": "A aprovação de Lula tem se recuperado. Ele vai superar a marca de 45% neste trimestre?",
        "category": "politics",
        "scenarios": [("Yes", 36), ("No", 64)],
        "scenarios_pt": [("Sim", 36), ("Não", 64)],
    },
    {
        "slug_key": "br-opposition-candidate-2026",
        "title": "Will a unified opposition candidate emerge for 2026 before August?",
        "title_pt": "Um candidato único da oposição vai surgir para 2026 antes de agosto?",
        "description": "The Brazilian opposition is fragmented. Will they unify behind a single presidential candidate?",
        "description_pt": "A oposição brasileira está fragmentada. Vão se unificar em torno de um único candidato presidencial?",
        "category": "politics",
        "scenarios": [("Yes", 33), ("No", 67)],
        "scenarios_pt": [("Sim", 33), ("Não", 67)],
    },
    {
        "slug_key": "br-municipal-corruption-scandal",
        "title": "Will a major corruption scandal hit a Brazilian ministry in 2026?",
        "title_pt": "Um grande escândalo de corrupção vai atingir um ministério brasileiro em 2026?",
        "description": "Brazilian politics has historically been prone to scandals. Will a major case emerge this year?",
        "description_pt": "A política brasileira tem histórico de escândalos. Um grande caso vai surgir este ano?",
        "category": "politics",
        "scenarios": [("Yes", 55), ("No", 45)],
        "scenarios_pt": [("Sim", 55), ("Não", 45)],
    },
    {
        "slug_key": "br-stf-x-twitter-ban",
        "title": "Will the Brazilian STF maintain restrictions on X (Twitter) in 2026?",
        "title_pt": "O STF brasileiro vai manter restrições ao X (Twitter) em 2026?",
        "description": "The STF imposed restrictions on X in 2025. Will those remain in place through 2026?",
        "description_pt": "O STF impôs restrições ao X em 2025. Elas vão se manter ao longo de 2026?",
        "category": "politics",
        "scenarios": [("Yes — maintained", 61), ("No — lifted", 39)],
        "scenarios_pt": [("Sim — mantidas", 61), ("Não — suspensas", 39)],
    },
    {
        "slug_key": "br-pt-party-internal",
        "title": "Will there be a significant internal dispute in PT before the 2026 election?",
        "title_pt": "Haverá uma disputa interna significativa no PT antes da eleição de 2026?",
        "description": "Lula's PT party has been managing internal tensions. Will a public rift emerge?",
        "description_pt": "O PT de Lula tem gerenciado tensões internas. Uma ruptura pública vai emergir?",
        "category": "politics",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "br-senate-reform-vote",
        "title": "Will the Brazilian Senate pass a major administrative reform in 2026?",
        "title_pt": "O Senado brasileiro vai aprovar uma grande reforma administrativa em 2026?",
        "description": "Administrative reform has been on the agenda for years. Will it finally pass this year?",
        "description_pt": "A reforma administrativa está na agenda há anos. Vai finalmente ser aprovada este ano?",
        "category": "politics",
        "scenarios": [("Yes", 29), ("No", 71)],
        "scenarios_pt": [("Sim", 29), ("Não", 71)],
    },
    {
        "slug_key": "br-election-polls-tie",
        "title": "Will the 2026 presidential race be within 5 points by June?",
        "title_pt": "A corrida presidencial de 2026 vai estar empatada tecnicamente até junho?",
        "description": "Early polls show Lula ahead. Will the race tighten to within 5 percentage points by mid-year?",
        "description_pt": "As primeiras pesquisas mostram Lula na frente. A corrida vai apertar para menos de 5 pontos até o meio do ano?",
        "category": "politics",
        "scenarios": [("Yes — within 5pts", 48), ("No — wider gap", 52)],
        "scenarios_pt": [("Sim — empate técnico", 48), ("Não — diferença maior", 52)],
    },
    {
        "slug_key": "br-amazon-fund-record",
        "title": "Will the Amazon Fund receive record donations in 2026?",
        "title_pt": "O Fundo Amazônia vai receber doações recordes em 2026?",
        "description": "International donations to protect the Amazon have been rising. Will 2026 set a new record?",
        "description_pt": "As doações internacionais para proteger a Amazônia têm crescido. 2026 vai bater um novo recorde?",
        "category": "politics",
        "scenarios": [("Yes", 62), ("No", 38)],
        "scenarios_pt": [("Sim", 62), ("Não", 38)],
    },
    {
        "slug_key": "br-drug-policy-reform",
        "title": "Will Brazil pass drug policy reform legislation in 2026?",
        "title_pt": "O Brasil vai aprovar legislação de reforma da política de drogas em 2026?",
        "description": "Drug policy debates have intensified in Brazil. Will Congress pass meaningful reform?",
        "description_pt": "O debate sobre política de drogas se intensificou no Brasil. O Congresso vai aprovar uma reforma significativa?",
        "category": "politics",
        "scenarios": [("Yes", 22), ("No", 78)],
        "scenarios_pt": [("Sim", 22), ("Não", 78)],
    },
    {
        "slug_key": "br-minimum-wage-raise",
        "title": "Will Brazil's minimum wage exceed R$1,600 by end of 2026?",
        "title_pt": "O salário mínimo brasileiro vai superar R$1.600 até o fim de 2026?",
        "description": "The minimum wage was raised in 2025. Will another increase push it above R$1,600 this year?",
        "description_pt": "O salário mínimo foi reajustado em 2025. Um novo aumento vai levá-lo acima de R$1.600 este ano?",
        "category": "politics",
        "scenarios": [("Yes", 57), ("No", 43)],
        "scenarios_pt": [("Sim", 57), ("Não", 43)],
    },

    # ── Economy (extra) ───────────────────────────────────────────────────────
    {
        "slug_key": "br-real-recover-5-80",
        "title": "Will the Brazilian Real recover to below R$5.80 against the dollar in 2026?",
        "title_pt": "O Real brasileiro vai se recuperar para abaixo de R$5,80 frente ao dólar em 2026?",
        "description": "The Real has been weak. Will a recovery bring it back below R$5.80 this year?",
        "description_pt": "O Real tem estado fraco. Uma recuperação vai levá-lo de volta abaixo de R$5,80 este ano?",
        "category": "economy",
        "scenarios": [("Yes", 31), ("No", 69)],
        "scenarios_pt": [("Sim", 31), ("Não", 69)],
    },
    {
        "slug_key": "br-agro-record-export",
        "title": "Will Brazilian agribusiness set a new export record in 2026?",
        "title_pt": "O agronegócio brasileiro vai bater um novo recorde de exportações em 2026?",
        "description": "Brazil's agribusiness has been booming. Will exports exceed last year's record?",
        "description_pt": "O agronegócio brasileiro está em expansão. As exportações vão superar o recorde do ano passado?",
        "category": "economy",
        "scenarios": [("Yes", 66), ("No", 34)],
        "scenarios_pt": [("Sim", 66), ("Não", 34)],
    },
    {
        "slug_key": "br-startups-unicorn-2026",
        "title": "Will a new Brazilian startup reach unicorn status in 2026?",
        "title_pt": "Uma nova startup brasileira vai atingir o status de unicórnio em 2026?",
        "description": "Brazil has produced several unicorns. Will a new company join the club this year?",
        "description_pt": "O Brasil já produziu vários unicórnios. Uma nova empresa vai se juntar ao clube este ano?",
        "category": "economy",
        "scenarios": [("Yes", 54), ("No", 46)],
        "scenarios_pt": [("Sim", 54), ("Não", 46)],
    },
    {
        "slug_key": "br-cdi-above-12",
        "title": "Will Brazil's CDI rate stay above 12% through Q3 2026?",
        "title_pt": "A taxa CDI do Brasil vai ficar acima de 12% até o 3T de 2026?",
        "description": "The CDI tracks the Selic. With rates elevated, will it remain above 12% through September?",
        "description_pt": "O CDI acompanha a Selic. Com os juros elevados, vai permanecer acima de 12% até setembro?",
        "category": "economy",
        "scenarios": [("Yes", 58), ("No", 42)],
        "scenarios_pt": [("Sim", 58), ("Não", 42)],
    },
    {
        "slug_key": "br-itau-record-profit",
        "title": "Will Itaú Unibanco post a record profit in 2026?",
        "title_pt": "O Itaú Unibanco vai registrar lucro recorde em 2026?",
        "description": "Brazil's largest bank has been posting strong results. Will 2026 be a record year?",
        "description_pt": "O maior banco do Brasil tem registrado resultados fortes. 2026 vai ser um ano recorde?",
        "category": "economy",
        "scenarios": [("Yes", 61), ("No", 39)],
        "scenarios_pt": [("Sim", 61), ("Não", 39)],
    },
    {
        "slug_key": "br-housing-prices-rise",
        "title": "Will Brazilian housing prices rise more than 8% in 2026?",
        "title_pt": "Os preços dos imóveis no Brasil vão subir mais de 8% em 2026?",
        "description": "Real estate has been heating up in major Brazilian cities. Will the national average exceed 8%?",
        "description_pt": "O mercado imobiliário tem esquentado nas grandes cidades brasileiras. A média nacional vai superar 8%?",
        "category": "economy",
        "scenarios": [("Yes", 43), ("No", 57)],
        "scenarios_pt": [("Sim", 43), ("Não", 57)],
    },
    {
        "slug_key": "br-trade-surplus-record",
        "title": "Will Brazil post a record trade surplus in 2026?",
        "title_pt": "O Brasil vai registrar um superávit comercial recorde em 2026?",
        "description": "Brazil's trade balance has been strong. Will 2026 set a new record for trade surplus?",
        "description_pt": "A balança comercial do Brasil tem sido forte. 2026 vai bater um novo recorde de superávit?",
        "category": "economy",
        "scenarios": [("Yes", 49), ("No", 51)],
        "scenarios_pt": [("Sim", 49), ("Não", 51)],
    },
    {
        "slug_key": "br-electric-vehicles-growth",
        "title": "Will electric vehicle sales in Brazil grow more than 50% in 2026?",
        "title_pt": "As vendas de veículos elétricos no Brasil vão crescer mais de 50% em 2026?",
        "description": "EV adoption is accelerating in Brazil. Will sales grow by more than half compared to last year?",
        "description_pt": "A adoção de veículos elétricos está acelerando no Brasil. As vendas vão crescer mais da metade em relação ao ano passado?",
        "category": "economy",
        "scenarios": [("Yes", 52), ("No", 48)],
        "scenarios_pt": [("Sim", 52), ("Não", 48)],
    },
    {
        "slug_key": "br-tourism-record-2026",
        "title": "Will Brazil receive record international tourists in 2026?",
        "title_pt": "O Brasil vai receber turistas internacionais em número recorde em 2026?",
        "description": "Brazil's tourism sector is recovering strongly. Will 2026 be the best year ever for foreign visitors?",
        "description_pt": "O setor de turismo do Brasil está se recuperando fortemente. 2026 vai ser o melhor ano de todos para visitantes estrangeiros?",
        "category": "economy",
        "scenarios": [("Yes", 58), ("No", 42)],
        "scenarios_pt": [("Sim", 58), ("Não", 42)],
    },
    {
        "slug_key": "br-meli-mercadolibre-growth",
        "title": "Will MercadoLibre's Brazil revenue grow more than 30% in 2026?",
        "title_pt": "A receita do MercadoLibre no Brasil vai crescer mais de 30% em 2026?",
        "description": "MercadoLibre dominates Brazilian e-commerce. Will they maintain high growth rates this year?",
        "description_pt": "O MercadoLibre domina o e-commerce brasileiro. Vão manter altas taxas de crescimento este ano?",
        "category": "economy",
        "scenarios": [("Yes", 64), ("No", 36)],
        "scenarios_pt": [("Sim", 64), ("Não", 36)],
    },

    # ── Sports (extra) ────────────────────────────────────────────────────────
    {
        "slug_key": "br-corinthians-title-2026",
        "title": "Will Corinthians win a title in 2026?",
        "title_pt": "O Corinthians vai conquistar um título em 2026?",
        "description": "Corinthians has been rebuilding. Will they win the Brasileirão, Copa do Brasil, or another title?",
        "description_pt": "O Corinthians está se reconstruindo. Vão vencer o Brasileirão, a Copa do Brasil ou outro título?",
        "category": "sports",
        "scenarios": [("Yes", 41), ("No", 59)],
        "scenarios_pt": [("Sim", 41), ("Não", 59)],
    },
    {
        "slug_key": "f1-hamilton-ferrari-win",
        "title": "Will Lewis Hamilton win a race for Ferrari in 2026?",
        "title_pt": "Lewis Hamilton vai vencer uma corrida pela Ferrari em 2026?",
        "description": "Hamilton joined Ferrari for 2026. Will he take his first win with the Scuderia this season?",
        "description_pt": "Hamilton se juntou à Ferrari para 2026. Ele vai conquistar sua primeira vitória pela Scuderia nesta temporada?",
        "category": "sports",
        "scenarios": [("Yes", 67), ("No", 33)],
        "scenarios_pt": [("Sim", 67), ("Não", 33)],
    },
    {
        "slug_key": "nba-finals-2026-winner",
        "title": "Will the Golden State Warriors reach the 2026 NBA Finals?",
        "title_pt": "O Golden State Warriors vai chegar às Finais da NBA 2026?",
        "description": "The Warriors have been rebuilding around a new core. Will they return to the Finals?",
        "description_pt": "O Warriors tem se reconstruído em torno de um novo núcleo. Vão voltar às Finais?",
        "category": "sports",
        "scenarios": [("Yes", 28), ("No", 72)],
        "scenarios_pt": [("Sim", 28), ("Não", 72)],
    },
    {
        "slug_key": "br-fluminense-libertadores",
        "title": "Will Fluminense defend their Copa Libertadores title in 2026?",
        "title_pt": "O Fluminense vai defender o título da Copa Libertadores em 2026?",
        "description": "Fluminense won the Libertadores in 2023. Can they make another deep run in 2026?",
        "description_pt": "O Fluminense venceu a Libertadores em 2023. Conseguem fazer outra campanha profunda em 2026?",
        "category": "sports",
        "scenarios": [("Yes — to final", 22), ("No — knocked out early", 78)],
        "scenarios_pt": [("Sim — até a final", 22), ("Não — eliminado cedo", 78)],
    },
    {
        "slug_key": "tennis-alcaraz-wimbledon",
        "title": "Will Carlos Alcaraz win Wimbledon 2026?",
        "title_pt": "Carlos Alcaraz vai vencer Wimbledon 2026?",
        "description": "Alcaraz has been dominant on grass. Will he defend or reclaim the Wimbledon title?",
        "description_pt": "Alcaraz tem sido dominante na grama. Ele vai defender ou reconquistar o título de Wimbledon?",
        "category": "sports",
        "scenarios": [("Yes", 38), ("No", 62)],
        "scenarios_pt": [("Sim", 38), ("Não", 62)],
    },
    {
        "slug_key": "br-atletico-mg-title",
        "title": "Will Atlético Mineiro win the Brasileirão 2026?",
        "title_pt": "O Atlético Mineiro vai vencer o Brasileirão 2026?",
        "description": "Atlético MG has been one of Brazil's strongest clubs recently. Will they take the national title?",
        "description_pt": "O Atlético MG tem sido um dos clubes mais fortes do Brasil recentemente. Vão conquistar o título nacional?",
        "category": "sports",
        "scenarios": [("Yes", 25), ("No", 75)],
        "scenarios_pt": [("Sim", 25), ("Não", 75)],
    },
    {
        "slug_key": "world-cup-2026-final-europe",
        "title": "Will the 2026 World Cup final be a European vs South American match?",
        "title_pt": "A final da Copa do Mundo 2026 vai ser Europa vs América do Sul?",
        "description": "A classic final setup. Will we see a European team face a South American one in the final?",
        "description_pt": "Um clássico formato de final. Vamos ver uma equipe europeia enfrentar uma sul-americana na final?",
        "category": "sports",
        "scenarios": [("Yes", 54), ("No", 46)],
        "scenarios_pt": [("Sim", 54), ("Não", 46)],
    },
    {
        "slug_key": "mma-poatan-title-defense",
        "title": "Will Alex Poatan defend his UFC light heavyweight title in 2026?",
        "title_pt": "Alex Poatan vai defender o cinturão do UFC meio-pesado em 2026?",
        "description": "Brazilian champion Alex Pereira (Poatan) is dominant. Will he successfully defend in 2026?",
        "description_pt": "O campeão brasileiro Alex Pereira (Poatan) está dominante. Ele vai defender com sucesso em 2026?",
        "category": "sports",
        "scenarios": [("Yes", 62), ("No", 38)],
        "scenarios_pt": [("Sim", 62), ("Não", 38)],
    },
    {
        "slug_key": "br-seleção-coach-change",
        "title": "Will Brazil's national football team change coach before the World Cup?",
        "title_pt": "A seleção brasileira vai trocar de técnico antes da Copa do Mundo?",
        "description": "Pressure on the Brazilian national team coach has been mounting. Will there be a change before 2026?",
        "description_pt": "A pressão sobre o técnico da seleção brasileira tem aumentado. Haverá uma troca antes de 2026?",
        "category": "sports",
        "scenarios": [("Yes", 39), ("No", 61)],
        "scenarios_pt": [("Sim", 39), ("Não", 61)],
    },
    {
        "slug_key": "olympics-2028-brazil-medals",
        "title": "Will Brazil win more than 10 medals at the 2028 LA Olympics?",
        "title_pt": "O Brasil vai ganhar mais de 10 medalhas nas Olimpíadas de Los Angeles 2028?",
        "description": "Brazil has been growing as an Olympic power. Will they top 10 medals in LA?",
        "description_pt": "O Brasil tem crescido como potência olímpica. Vão superar 10 medalhas em Los Angeles?",
        "category": "sports",
        "scenarios": [("Yes", 57), ("No", 43)],
        "scenarios_pt": [("Sim", 57), ("Não", 43)],
    },

    # ── Technology (extra) ───────────────────────────────────────────────────
    {
        "slug_key": "anthropic-claude-gpt-rival",
        "title": "Will Anthropic's Claude surpass ChatGPT in monthly users in 2026?",
        "title_pt": "O Claude da Anthropic vai superar o ChatGPT em usuários mensais em 2026?",
        "description": "Claude has been gaining ground. Will it overtake ChatGPT as the most-used AI assistant?",
        "description_pt": "O Claude tem ganhado terreno. Vai superar o ChatGPT como o assistente de IA mais usado?",
        "category": "technology",
        "scenarios": [("Yes", 22), ("No", 78)],
        "scenarios_pt": [("Sim", 22), ("Não", 78)],
    },
    {
        "slug_key": "openai-ipo-2026",
        "title": "Will OpenAI go public (IPO) in 2026?",
        "title_pt": "A OpenAI vai abrir capital (IPO) em 2026?",
        "description": "OpenAI has been discussing restructuring to allow an IPO. Will it happen this year?",
        "description_pt": "A OpenAI tem discutido reestruturação para permitir um IPO. Isso vai acontecer este ano?",
        "category": "technology",
        "scenarios": [("Yes", 31), ("No", 69)],
        "scenarios_pt": [("Sim", 31), ("Não", 69)],
    },
    {
        "slug_key": "google-gemini-dominance",
        "title": "Will Google Gemini become the most-used AI model in Brazil by end of 2026?",
        "title_pt": "O Google Gemini vai se tornar o modelo de IA mais usado no Brasil até o fim de 2026?",
        "description": "Google has strong distribution in Brazil. Will Gemini dominate the Brazilian AI market?",
        "description_pt": "O Google tem forte distribuição no Brasil. O Gemini vai dominar o mercado de IA brasileiro?",
        "category": "technology",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "spacex-mars-mission-2026",
        "title": "Will SpaceX announce a crewed Mars mission timeline in 2026?",
        "title_pt": "A SpaceX vai anunciar um cronograma para missão tripulada a Marte em 2026?",
        "description": "Elon Musk has long promised crewed Mars missions. Will SpaceX announce a concrete timeline in 2026?",
        "description_pt": "Elon Musk prometeu missões tripuladas a Marte há muito tempo. A SpaceX vai anunciar um cronograma concreto em 2026?",
        "category": "technology",
        "scenarios": [("Yes", 29), ("No", 71)],
        "scenarios_pt": [("Sim", 29), ("Não", 71)],
    },
    {
        "slug_key": "apple-foldable-iphone",
        "title": "Will Apple announce a foldable iPhone in 2026?",
        "title_pt": "A Apple vai anunciar um iPhone dobrável em 2026?",
        "description": "Rumors of a foldable iPhone have persisted. Will Apple finally enter the foldable market this year?",
        "description_pt": "Os rumores de um iPhone dobrável persistem. A Apple vai finalmente entrar no mercado de dobráveis este ano?",
        "category": "technology",
        "scenarios": [("Yes", 48), ("No", 52)],
        "scenarios_pt": [("Sim", 48), ("Não", 52)],
    },
    {
        "slug_key": "brazil-ai-regulation-2026",
        "title": "Will Brazil pass a national AI regulation law in 2026?",
        "title_pt": "O Brasil vai aprovar uma lei nacional de regulação de IA em 2026?",
        "description": "Brazil is drafting AI legislation. Will Congress pass a final AI regulation law this year?",
        "description_pt": "O Brasil está elaborando legislação de IA. O Congresso vai aprovar uma lei final de regulação de IA este ano?",
        "category": "technology",
        "scenarios": [("Yes", 38), ("No", 62)],
        "scenarios_pt": [("Sim", 38), ("Não", 62)],
    },
    {
        "slug_key": "microsoft-activision-games",
        "title": "Will Microsoft release a major Xbox exclusive game in H1 2026?",
        "title_pt": "A Microsoft vai lançar um grande jogo exclusivo do Xbox no 1S de 2026?",
        "description": "Microsoft's gaming pipeline is growing after Activision Blizzard acquisition. A big exclusive before July?",
        "description_pt": "O pipeline de jogos da Microsoft está crescendo após a aquisição da Activision Blizzard. Um grande exclusivo antes de julho?",
        "category": "technology",
        "scenarios": [("Yes", 55), ("No", 45)],
        "scenarios_pt": [("Sim", 55), ("Não", 45)],
    },
    {
        "slug_key": "quantum-computing-breakthrough",
        "title": "Will a major quantum computing breakthrough be announced in 2026?",
        "title_pt": "Um grande avanço em computação quântica vai ser anunciado em 2026?",
        "description": "Google, IBM and others are racing in quantum. Will 2026 see a landmark achievement?",
        "description_pt": "Google, IBM e outros estão competindo no quântico. 2026 vai ver uma conquista histórica?",
        "category": "technology",
        "scenarios": [("Yes", 42), ("No", 58)],
        "scenarios_pt": [("Sim", 42), ("Não", 58)],
    },
    {
        "slug_key": "tiktok-brazil-ban",
        "title": "Will TikTok face regulatory restrictions in Brazil in 2026?",
        "title_pt": "O TikTok vai enfrentar restrições regulatórias no Brasil em 2026?",
        "description": "Brazil has been watching global TikTok bans closely. Will it implement its own restrictions?",
        "description_pt": "O Brasil tem acompanhado de perto as proibições do TikTok no mundo. Vai implementar suas próprias restrições?",
        "category": "technology",
        "scenarios": [("Yes", 27), ("No", 73)],
        "scenarios_pt": [("Sim", 27), ("Não", 73)],
    },
    {
        "slug_key": "waymo-international-expansion",
        "title": "Will Waymo expand to a non-US city in 2026?",
        "title_pt": "A Waymo vai expandir para uma cidade fora dos EUA em 2026?",
        "description": "Waymo has been US-only. Will they announce international expansion to any city in 2026?",
        "description_pt": "A Waymo tem operado apenas nos EUA. Vão anunciar expansão internacional para alguma cidade em 2026?",
        "category": "technology",
        "scenarios": [("Yes", 33), ("No", 67)],
        "scenarios_pt": [("Sim", 33), ("Não", 67)],
    },

    # ── Geopolitics (extra) ──────────────────────────────────────────────────
    {
        "slug_key": "us-china-trade-war-escalate",
        "title": "Will US-China trade tensions escalate further in 2026?",
        "title_pt": "As tensões comerciais EUA-China vão se intensificar ainda mais em 2026?",
        "description": "Trade tensions between the US and China remain high. Will there be a new escalation this year?",
        "description_pt": "As tensões comerciais entre os EUA e a China permanecem altas. Haverá uma nova escalada este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 59), ("No", 41)],
        "scenarios_pt": [("Sim", 59), ("Não", 41)],
    },
    {
        "slug_key": "nato-new-member-2026",
        "title": "Will NATO admit a new member in 2026?",
        "title_pt": "A OTAN vai admitir um novo membro em 2026?",
        "description": "Several countries have expressed interest in NATO membership. Will a new member join this year?",
        "description_pt": "Vários países manifestaram interesse em aderir à OTAN. Um novo membro vai se juntar este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 34), ("No", 66)],
        "scenarios_pt": [("Sim", 34), ("Não", 66)],
    },
    {
        "slug_key": "russia-ukraine-territory",
        "title": "Will Ukraine reclaim significant territory from Russia in 2026?",
        "title_pt": "A Ucrânia vai reconquistar território significativo da Rússia em 2026?",
        "description": "The war in Ukraine continues. Will Ukrainian forces make major territorial gains this year?",
        "description_pt": "A guerra na Ucrânia continua. As forças ucranianas vão fazer grandes avanços territoriais este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 26), ("No", 74)],
        "scenarios_pt": [("Sim", 26), ("Não", 74)],
    },
    {
        "slug_key": "middle-east-peace-deal",
        "title": "Will there be a formal peace agreement in Gaza by end of 2026?",
        "title_pt": "Haverá um acordo de paz formal em Gaza até o fim de 2026?",
        "description": "Negotiations for a lasting Gaza ceasefire continue. Will a formal peace deal be signed?",
        "description_pt": "As negociações para um cessar-fogo duradouro em Gaza continuam. Um acordo de paz formal vai ser assinado?",
        "category": "geopolitics",
        "scenarios": [("Yes", 19), ("No", 81)],
        "scenarios_pt": [("Sim", 19), ("Não", 81)],
    },
    {
        "slug_key": "brazil-argentina-relations",
        "title": "Will Brazil-Argentina diplomatic relations improve under Milei in 2026?",
        "title_pt": "As relações diplomáticas Brasil-Argentina vão melhorar com Milei em 2026?",
        "description": "Lula and Milei have had tensions. Will the two governments improve relations this year?",
        "description_pt": "Lula e Milei têm tido tensões. Os dois governos vão melhorar as relações este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 37), ("No", 63)],
        "scenarios_pt": [("Sim", 37), ("Não", 63)],
    },
    {
        "slug_key": "un-security-council-reform",
        "title": "Will the UN Security Council reform be approved in 2026?",
        "title_pt": "A reforma do Conselho de Segurança da ONU vai ser aprovada em 2026?",
        "description": "Brazil has long pushed for UNSC reform to gain a permanent seat. Will reform move forward?",
        "description_pt": "O Brasil tem pressionado por uma reforma do CSNU para obter um assento permanente. A reforma vai avançar?",
        "category": "geopolitics",
        "scenarios": [("Yes", 11), ("No", 89)],
        "scenarios_pt": [("Sim", 11), ("Não", 89)],
    },
    {
        "slug_key": "north-korea-nuclear-test",
        "title": "Will North Korea conduct a nuclear test in 2026?",
        "title_pt": "A Coreia do Norte vai realizar um teste nuclear em 2026?",
        "description": "North Korea has been advancing its nuclear program. Will they conduct a live test this year?",
        "description_pt": "A Coreia do Norte tem avançado seu programa nuclear. Vão realizar um teste ao vivo este ano?",
        "category": "geopolitics",
        "scenarios": [("Yes", 29), ("No", 71)],
        "scenarios_pt": [("Sim", 29), ("Não", 71)],
    },
    {
        "slug_key": "africa-union-currency",
        "title": "Will the African Union announce a unified currency initiative in 2026?",
        "title_pt": "A União Africana vai anunciar uma iniciativa de moeda unificada em 2026?",
        "description": "The African Union has discussed a single currency. Will a concrete initiative be announced?",
        "description_pt": "A União Africana tem discutido uma moeda única. Uma iniciativa concreta vai ser anunciada?",
        "category": "geopolitics",
        "scenarios": [("Yes", 14), ("No", 86)],
        "scenarios_pt": [("Sim", 14), ("Não", 86)],
    },
    {
        "slug_key": "g20-brazil-outcomes",
        "title": "Will Brazil host a successful G20 summit with major agreements in 2026?",
        "title_pt": "O Brasil vai sediar uma cúpula do G20 bem-sucedida com grandes acordos em 2026?",
        "description": "Brazil holds the G20 presidency. Will the summit produce significant international agreements?",
        "description_pt": "O Brasil detém a presidência do G20. A cúpula vai produzir acordos internacionais significativos?",
        "category": "geopolitics",
        "scenarios": [("Yes", 48), ("No", 52)],
        "scenarios_pt": [("Sim", 48), ("Não", 52)],
    },
    {
        "slug_key": "venezuela-election-crisis",
        "title": "Will Venezuela hold a free and fair election in 2026?",
        "title_pt": "A Venezuela vai realizar uma eleição livre e justa em 2026?",
        "description": "Venezuela's political situation remains dire. Will internationally recognized free elections occur?",
        "description_pt": "A situação política da Venezuela continua grave. Eleições livres reconhecidas internacionalmente vão ocorrer?",
        "category": "geopolitics",
        "scenarios": [("Yes", 17), ("No", 83)],
        "scenarios_pt": [("Sim", 17), ("Não", 83)],
    },

    # ── Crypto (extra) ───────────────────────────────────────────────────────
    {
        "slug_key": "btc-etf-institutional",
        "title": "Will a sovereign wealth fund disclose Bitcoin ETF holdings in 2026?",
        "title_pt": "Um fundo soberano vai divulgar participações em ETF de Bitcoin em 2026?",
        "description": "Institutional adoption of Bitcoin ETFs is growing. Will a sovereign wealth fund be among the holders?",
        "description_pt": "A adoção institucional de ETFs de Bitcoin está crescendo. Um fundo soberano vai estar entre os detentores?",
        "category": "crypto",
        "scenarios": [("Yes", 38), ("No", 62)],
        "scenarios_pt": [("Sim", 38), ("Não", 62)],
    },
    {
        "slug_key": "solana-flips-ethereum-fees",
        "title": "Will Solana generate more daily fees than Ethereum in 2026?",
        "title_pt": "A Solana vai gerar mais taxas diárias do que o Ethereum em 2026?",
        "description": "Solana has been growing rapidly. Will it surpass Ethereum in daily fee revenue at any point in 2026?",
        "description_pt": "A Solana tem crescido rapidamente. Vai superar o Ethereum na receita de taxas diárias em algum momento em 2026?",
        "category": "crypto",
        "scenarios": [("Yes", 33), ("No", 67)],
        "scenarios_pt": [("Sim", 33), ("Não", 67)],
    },
    {
        "slug_key": "crypto-us-regulation-2026",
        "title": "Will the US pass comprehensive crypto regulation in 2026?",
        "title_pt": "Os EUA vão aprovar uma regulação abrangente de criptomoedas em 2026?",
        "description": "Congress has been working on crypto bills. Will comprehensive crypto legislation pass this year?",
        "description_pt": "O Congresso tem trabalhado em projetos de lei sobre criptomoedas. Uma legislação abrangente vai ser aprovada este ano?",
        "category": "crypto",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "defi-tvl-record-2026",
        "title": "Will DeFi total value locked reach a new all-time high in 2026?",
        "title_pt": "O valor total bloqueado em DeFi vai atingir uma nova máxima histórica em 2026?",
        "description": "DeFi TVL has been recovering. Will it surpass the 2021 all-time high in 2026?",
        "description_pt": "O TVL de DeFi tem se recuperado. Vai superar a máxima histórica de 2021 em 2026?",
        "category": "crypto",
        "scenarios": [("Yes", 47), ("No", 53)],
        "scenarios_pt": [("Sim", 47), ("Não", 53)],
    },
    {
        "slug_key": "xrp-legal-clarity-2026",
        "title": "Will XRP gain full legal clarity in the US by end of 2026?",
        "title_pt": "O XRP vai obter clareza jurídica total nos EUA até o fim de 2026?",
        "description": "The Ripple vs SEC case has been ongoing. Will XRP achieve definitive legal status in 2026?",
        "description_pt": "O caso Ripple vs SEC continua em andamento. O XRP vai obter status jurídico definitivo em 2026?",
        "category": "crypto",
        "scenarios": [("Yes", 52), ("No", 48)],
        "scenarios_pt": [("Sim", 52), ("Não", 48)],
    },
    {
        "slug_key": "brazil-cbdc-drex-launch",
        "title": "Will Brazil's CBDC (Drex) launch publicly in 2026?",
        "title_pt": "O CBDC do Brasil (Drex) vai ser lançado publicamente em 2026?",
        "description": "Banco Central's digital real (Drex) is in pilot. Will it launch to the general public this year?",
        "description_pt": "O real digital do Banco Central (Drex) está em piloto. Vai ser lançado ao público em geral este ano?",
        "category": "crypto",
        "scenarios": [("Yes", 43), ("No", 57)],
        "scenarios_pt": [("Sim", 43), ("Não", 57)],
    },
    {
        "slug_key": "nft-market-recovery",
        "title": "Will the NFT market recover to 2022 volumes in 2026?",
        "title_pt": "O mercado de NFT vai se recuperar para os volumes de 2022 em 2026?",
        "description": "NFT trading volumes collapsed after 2022. Will the market return to those peaks this year?",
        "description_pt": "Os volumes de negociação de NFTs despencaram depois de 2022. O mercado vai voltar a esses picos este ano?",
        "category": "crypto",
        "scenarios": [("Yes", 21), ("No", 79)],
        "scenarios_pt": [("Sim", 21), ("Não", 79)],
    },
    {
        "slug_key": "eth-staking-yield-above-5",
        "title": "Will Ethereum staking yield stay above 5% APR in 2026?",
        "title_pt": "O rendimento de staking do Ethereum vai ficar acima de 5% ao ano em 2026?",
        "description": "ETH staking yields have been fluctuating. Will they hold above 5% APR through 2026?",
        "description_pt": "Os rendimentos de staking do ETH têm oscilado. Vão se manter acima de 5% ao ano ao longo de 2026?",
        "category": "crypto",
        "scenarios": [("Yes", 41), ("No", 59)],
        "scenarios_pt": [("Sim", 41), ("Não", 59)],
    },
    {
        "slug_key": "crypto-winter-return",
        "title": "Will crypto enter a bear market (BTC below $40k) in 2026?",
        "title_pt": "O mercado cripto vai entrar em um bear market (BTC abaixo de $40k) em 2026?",
        "description": "After the 2024 bull run, will crypto face a significant downturn bringing BTC below $40,000?",
        "description_pt": "Após o bull run de 2024, o cripto vai enfrentar uma queda significativa levando o BTC abaixo de $40.000?",
        "category": "crypto",
        "scenarios": [("Yes", 24), ("No", 76)],
        "scenarios_pt": [("Sim", 24), ("Não", 76)],
    },
    {
        "slug_key": "stablecoin-regulation-global",
        "title": "Will stablecoins face coordinated global regulation in 2026?",
        "title_pt": "As stablecoins vão enfrentar regulação global coordenada em 2026?",
        "description": "Multiple countries are drafting stablecoin rules. Will we see a coordinated global framework emerge?",
        "description_pt": "Vários países estão elaborando regras para stablecoins. Vamos ver um framework global coordenado emergir?",
        "category": "crypto",
        "scenarios": [("Yes", 36), ("No", 64)],
        "scenarios_pt": [("Sim", 36), ("Não", 64)],
    },

    # ── Entertainment ─────────────────────────────────────────────────────────
    {
        "slug_key": "oscar-best-picture-2026",
        "title": "Will a non-English film win Best Picture at the 2027 Oscars?",
        "title_pt": "Um filme não anglófono vai vencer o Oscar de Melhor Filme em 2027?",
        "description": "International cinema has been gaining ground at the Oscars. Will a non-English film take the top prize?",
        "description_pt": "O cinema internacional tem ganhado espaço no Oscar. Um filme não anglófono vai levar o prêmio máximo?",
        "category": "entertainment",
        "scenarios": [("Yes", 28), ("No", 72)],
        "scenarios_pt": [("Sim", 28), ("Não", 72)],
    },
    {
        "slug_key": "netflix-br-original-hit",
        "title": "Will a Brazilian Netflix original become a global top 10 hit in 2026?",
        "title_pt": "Um original brasileiro da Netflix vai entrar no top 10 global em 2026?",
        "description": "Brazilian content on Netflix has been growing. Will one reach the global top 10 weekly charts?",
        "description_pt": "O conteúdo brasileiro na Netflix tem crescido. Algum vai chegar ao top 10 semanal global?",
        "category": "entertainment",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "marvel-box-office-2026",
        "title": "Will a Marvel film gross over $1B at the box office in 2026?",
        "title_pt": "Um filme da Marvel vai arrecadar mais de $1 bilhão nas bilheterias em 2026?",
        "description": "Marvel has been recovering its box office performance. Will any 2026 release cross the $1B mark?",
        "description_pt": "A Marvel tem recuperado seu desempenho nas bilheterias. Algum lançamento de 2026 vai cruzar a marca de $1 bilhão?",
        "category": "entertainment",
        "scenarios": [("Yes", 52), ("No", 48)],
        "scenarios_pt": [("Sim", 52), ("Não", 48)],
    },
    {
        "slug_key": "globo-novela-record",
        "title": "Will a Globo novela break 40 million viewers in 2026?",
        "title_pt": "Uma novela da Globo vai bater 40 milhões de espectadores em 2026?",
        "description": "Globo novelas have been declining in ratings. Will one recover to hit 40M viewers this year?",
        "description_pt": "As novelas da Globo têm perdido audiência. Alguma vai se recuperar e atingir 40 milhões de espectadores este ano?",
        "category": "entertainment",
        "scenarios": [("Yes", 33), ("No", 67)],
        "scenarios_pt": [("Sim", 33), ("Não", 67)],
    },
    {
        "slug_key": "cannes-palme-dor-2026",
        "title": "Will a Latin American film win the Palme d'Or at Cannes 2026?",
        "title_pt": "Um filme latino-americano vai vencer a Palma de Ouro em Cannes 2026?",
        "description": "Latin American cinema has a strong tradition at Cannes. Will a film from the region win the top prize?",
        "description_pt": "O cinema latino-americano tem forte tradição em Cannes. Um filme da região vai ganhar o prêmio máximo?",
        "category": "entertainment",
        "scenarios": [("Yes", 18), ("No", 82)],
        "scenarios_pt": [("Sim", 18), ("Não", 82)],
    },
    {
        "slug_key": "streaming-wars-winner",
        "title": "Will Netflix remain the #1 streaming platform in Brazil in 2026?",
        "title_pt": "A Netflix vai continuar como a plataforma de streaming #1 no Brasil em 2026?",
        "description": "Competition from Disney+, HBO Max and Globoplay is intense. Will Netflix hold its top position?",
        "description_pt": "A concorrência de Disney+, HBO Max e Globoplay é intensa. A Netflix vai manter sua posição de liderança?",
        "category": "entertainment",
        "scenarios": [("Yes", 61), ("No", 39)],
        "scenarios_pt": [("Sim", 61), ("Não", 39)],
    },
    {
        "slug_key": "br-cinema-record-2026",
        "title": "Will Brazilian cinema set a box office record in 2026?",
        "title_pt": "O cinema brasileiro vai bater um recorde de bilheteria em 2026?",
        "description": "Brazilian films have been recovering post-pandemic. Will domestic productions set a new record?",
        "description_pt": "Os filmes brasileiros têm se recuperado pós-pandemia. As produções nacionais vão bater um novo recorde?",
        "category": "entertainment",
        "scenarios": [("Yes", 47), ("No", 53)],
        "scenarios_pt": [("Sim", 47), ("Não", 53)],
    },
    {
        "slug_key": "video-game-goty-2026",
        "title": "Will The Game Awards 2026 Game of the Year be a sequel?",
        "title_pt": "O Jogo do Ano no The Game Awards 2026 vai ser uma sequência?",
        "description": "Recent Game of the Year winners have often been sequels. Will the trend continue in 2026?",
        "description_pt": "Os últimos Jogos do Ano frequentemente foram sequências. A tendência vai continuar em 2026?",
        "category": "entertainment",
        "scenarios": [("Yes", 58), ("No", 42)],
        "scenarios_pt": [("Sim", 58), ("Não", 42)],
    },
    {
        "slug_key": "br-funk-global-hit",
        "title": "Will a Brazilian funk/phonk song reach the global Spotify top 10 in 2026?",
        "title_pt": "Uma música de funk/phonk brasileiro vai chegar ao top 10 global do Spotify em 2026?",
        "description": "Brazilian music has been increasingly global. Will a funk or phonk track break into the worldwide top 10?",
        "description_pt": "A música brasileira tem sido cada vez mais global. Uma faixa de funk ou phonk vai entrar no top 10 mundial?",
        "category": "entertainment",
        "scenarios": [("Yes", 39), ("No", 61)],
        "scenarios_pt": [("Sim", 39), ("Não", 61)],
    },
    {
        "slug_key": "reality-show-br-record",
        "title": "Will BBB 27 break viewership records in Brazil?",
        "title_pt": "O BBB 27 vai bater recordes de audiência no Brasil?",
        "description": "Big Brother Brasil remains one of TV's biggest events. Will the 2027 edition set new viewership records?",
        "description_pt": "O Big Brother Brasil continua sendo um dos maiores eventos da TV. A edição de 2027 vai bater novos recordes de audiência?",
        "category": "entertainment",
        "scenarios": [("Yes", 41), ("No", 59)],
        "scenarios_pt": [("Sim", 41), ("Não", 59)],
    },

    # ── Music ─────────────────────────────────────────────────────────────────
    {
        "slug_key": "grammy-2026-brazil",
        "title": "Will a Brazilian artist win a Grammy in 2027?",
        "title_pt": "Um artista brasileiro vai vencer um Grammy em 2027?",
        "description": "Brazilian artists have been gaining global recognition. Will one take home a Grammy?",
        "description_pt": "Artistas brasileiros têm ganhado reconhecimento global. Algum vai levar um Grammy?",
        "category": "music",
        "scenarios": [("Yes", 31), ("No", 69)],
        "scenarios_pt": [("Sim", 31), ("Não", 69)],
    },
    {
        "slug_key": "taylor-swift-tour-br",
        "title": "Will Taylor Swift announce a Brazil tour date in 2026?",
        "title_pt": "Taylor Swift vai anunciar uma data de show no Brasil em 2026?",
        "description": "The Eras Tour was a massive success in Brazil. Will Taylor Swift return or announce new Brazilian dates?",
        "description_pt": "A The Eras Tour foi um enorme sucesso no Brasil. Taylor Swift vai voltar ou anunciar novas datas brasileiras?",
        "category": "music",
        "scenarios": [("Yes", 48), ("No", 52)],
        "scenarios_pt": [("Sim", 48), ("Não", 52)],
    },
    {
        "slug_key": "spotify-streams-record-2026",
        "title": "Will a song break 500M Spotify streams in its first week in 2026?",
        "title_pt": "Uma música vai quebrar a marca de 500 milhões de streams no Spotify na primeira semana em 2026?",
        "description": "Streaming records keep falling. Will any song achieve 500M first-week streams this year?",
        "description_pt": "Os recordes de streaming continuam caindo. Alguma música vai atingir 500 milhões de streams na primeira semana?",
        "category": "music",
        "scenarios": [("Yes", 27), ("No", 73)],
        "scenarios_pt": [("Sim", 27), ("Não", 73)],
    },
    {
        "slug_key": "rock-in-rio-2026-headliner",
        "title": "Will Rock in Rio 2026 sell out all stages in the first week of ticket sales?",
        "title_pt": "O Rock in Rio 2026 vai esgotar todos os ingressos na primeira semana de vendas?",
        "description": "Rock in Rio is one of the world's biggest music festivals. Will the high demand lead to an instant sellout?",
        "description_pt": "O Rock in Rio é um dos maiores festivais de música do mundo. A alta demanda vai levar a um esgotamento instantâneo?",
        "category": "music",
        "scenarios": [("Yes", 71), ("No", 29)],
        "scenarios_pt": [("Sim", 71), ("Não", 29)],
    },
    {
        "slug_key": "br-sertanejo-global",
        "title": "Will a sertanejo artist reach 10M monthly Spotify listeners in 2026?",
        "title_pt": "Um artista sertanejo vai atingir 10 milhões de ouvintes mensais no Spotify em 2026?",
        "description": "Sertanejo has been growing internationally. Will any artist from the genre cross 10M monthly listeners?",
        "description_pt": "O sertanejo tem crescido internacionalmente. Algum artista do gênero vai cruzar a marca de 10 milhões de ouvintes mensais?",
        "category": "music",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "rock-in-rio-2026",
        "title": "Will Rock in Rio 2026 announce an international headliner from Brazil?",
        "title_pt": "O Rock in Rio 2026 vai anunciar um headliner internacional do Brasil?",
        "description": "Rock in Rio has been mixing global and local acts. Will a Brazilian artist headline the main stage?",
        "description_pt": "O Rock in Rio tem misturado atrações globais e locais. Um artista brasileiro vai ser headliner do palco principal?",
        "category": "music",
        "scenarios": [("Yes", 52), ("No", 48)],
        "scenarios_pt": [("Sim", 52), ("Não", 48)],
    },
    {
        "slug_key": "vinyl-sales-record-2026",
        "title": "Will vinyl record sales surpass CD sales globally in 2026?",
        "title_pt": "As vendas de discos de vinil vão superar as de CDs globalmente em 2026?",
        "description": "Vinyl has been making a comeback while CDs decline. Will vinyl finally outsell CDs worldwide?",
        "description_pt": "O vinil tem feito um retorno enquanto os CDs declinam. O vinil vai finalmente superar os CDs mundialmente?",
        "category": "music",
        "scenarios": [("Yes", 59), ("No", 41)],
        "scenarios_pt": [("Sim", 59), ("Não", 41)],
    },
    {
        "slug_key": "anitta-top10-billboard",
        "title": "Will Anitta reach the Billboard Hot 100 top 10 again in 2026?",
        "title_pt": "Anitta vai voltar ao top 10 da Billboard Hot 100 em 2026?",
        "description": "Anitta made history with Envolver. Will she have another top 10 hit on the Hot 100 this year?",
        "description_pt": "Anitta fez história com Envolver. Ela vai ter outro hit no top 10 da Hot 100 este ano?",
        "category": "music",
        "scenarios": [("Yes", 36), ("No", 64)],
        "scenarios_pt": [("Sim", 36), ("Não", 64)],
    },
    {
        "slug_key": "ai-music-grammy-eligible",
        "title": "Will an AI-generated song become Grammy eligible in 2026?",
        "title_pt": "Uma música gerada por IA vai se tornar elegível ao Grammy em 2026?",
        "description": "The Recording Academy is debating AI music rules. Will AI-assisted songs be allowed to compete?",
        "description_pt": "A Recording Academy está debatendo as regras para músicas de IA. Músicas com assistência de IA poderão competir?",
        "category": "music",
        "scenarios": [("Yes", 23), ("No", 77)],
        "scenarios_pt": [("Sim", 23), ("Não", 77)],
    },
    {
        "slug_key": "fortnite-concert-2026",
        "title": "Will a major artist hold a virtual concert in Fortnite or Roblox in 2026?",
        "title_pt": "Um artista importante vai realizar um show virtual no Fortnite ou Roblox em 2026?",
        "description": "Virtual concerts in gaming platforms have become a trend. Will a big name perform in a game world this year?",
        "description_pt": "Os shows virtuais em plataformas de jogos tornaram-se uma tendência. Um grande nome vai se apresentar num mundo de jogo este ano?",
        "category": "music",
        "scenarios": [("Yes", 61), ("No", 39)],
        "scenarios_pt": [("Sim", 61), ("Não", 39)],
    },

    # ── Brazilian TV ──────────────────────────────────────────────────────────
    {
        "slug_key": "bbb-2026-winner-famous",
        "title": "Will the BBB 26 winner become a mainstream celebrity within 6 months?",
        "title_pt": "O vencedor do BBB 26 vai se tornar uma celebridade mainstream em 6 meses?",
        "description": "Recent BBB winners have had mixed fortunes in celebrity. Will this year's winner sustain public interest?",
        "description_pt": "Os últimos vencedores do BBB tiveram fortunas variadas na celebridade. O vencedor deste ano vai manter o interesse público?",
        "category": "tv",
        "scenarios": [("Yes", 54), ("No", 46)],
        "scenarios_pt": [("Sim", 54), ("Não", 46)],
    },
    {
        "slug_key": "globo-vs-record-ratings",
        "title": "Will TV Record beat Globo in weekly ratings at least once in 2026?",
        "title_pt": "A TV Record vai superar a Globo na audiência semanal pelo menos uma vez em 2026?",
        "description": "TV Record has been gaining ground on Globo. Will they beat Globo in any single weekly ratings period?",
        "description_pt": "A TV Record tem ganhado terreno sobre a Globo. Vão superar a Globo em algum período de audiência semanal?",
        "category": "tv",
        "scenarios": [("Yes", 38), ("No", 62)],
        "scenarios_pt": [("Sim", 38), ("Não", 62)],
    },
    {
        "slug_key": "masterchef-brasil-2026",
        "title": "Will MasterChef Brasil return for a new season in 2026?",
        "title_pt": "O MasterChef Brasil vai retornar para uma nova temporada em 2026?",
        "description": "MasterChef Brasil has been a consistent hit. Will Band renew for another season this year?",
        "description_pt": "O MasterChef Brasil tem sido um sucesso consistente. A Band vai renovar para mais uma temporada este ano?",
        "category": "tv",
        "scenarios": [("Yes", 72), ("No", 28)],
        "scenarios_pt": [("Sim", 72), ("Não", 28)],
    },
    {
        "slug_key": "novela-das-9-record",
        "title": "Will the Globo 9pm novela average over 30 million viewers in 2026?",
        "title_pt": "A novela das 9 da Globo vai ter média acima de 30 milhões de espectadores em 2026?",
        "description": "The 9pm slot is Globo's crown jewel. Will the prime-time novela return to 30M+ average viewers?",
        "description_pt": "O horário das 9 é a joia da Globo. A novela das 9 vai voltar a ter média de mais de 30 milhões de espectadores?",
        "category": "tv",
        "scenarios": [("Yes", 29), ("No", 71)],
        "scenarios_pt": [("Sim", 29), ("Não", 71)],
    },
    {
        "slug_key": "multishow-comedy-hit",
        "title": "Will a new Brazilian comedy show become a hit on streaming in 2026?",
        "title_pt": "Um novo show de comédia brasileiro vai fazer sucesso no streaming em 2026?",
        "description": "Brazilian comedy content has been growing on streaming platforms. Will a new show break out this year?",
        "description_pt": "O conteúdo de comédia brasileiro tem crescido nas plataformas de streaming. Um novo show vai despontar este ano?",
        "category": "tv",
        "scenarios": [("Yes", 58), ("No", 42)],
        "scenarios_pt": [("Sim", 58), ("Não", 42)],
    },
    {
        "slug_key": "globo-cancel-novela",
        "title": "Will Globo cancel a running novela before its planned ending in 2026?",
        "title_pt": "A Globo vai cancelar uma novela em andamento antes do fim planejado em 2026?",
        "description": "Globo has cancelled struggling novelas before. Will low ratings force an early ending in 2026?",
        "description_pt": "A Globo já cancelou novelas com baixa audiência antes. A baixa audiência vai forçar um fim antecipado em 2026?",
        "category": "tv",
        "scenarios": [("Yes", 41), ("No", 59)],
        "scenarios_pt": [("Sim", 41), ("Não", 59)],
    },
    {
        "slug_key": "sbt-ratings-growth",
        "title": "Will SBT grow its prime-time ratings by more than 15% in 2026?",
        "title_pt": "O SBT vai crescer sua audiência no horário nobre em mais de 15% em 2026?",
        "description": "SBT has been restructuring its programming. Will the changes deliver significant rating growth?",
        "description_pt": "O SBT tem reestruturado sua programação. As mudanças vão entregar crescimento significativo de audiência?",
        "category": "tv",
        "scenarios": [("Yes", 34), ("No", 66)],
        "scenarios_pt": [("Sim", 34), ("Não", 66)],
    },
    {
        "slug_key": "br-podcast-tv-crossover",
        "title": "Will a Brazilian podcast host get their own TV show in 2026?",
        "title_pt": "Um apresentador de podcast brasileiro vai ganhar seu próprio programa de TV em 2026?",
        "description": "Brazilian podcasting has produced huge stars. Will any make the jump to mainstream TV in 2026?",
        "description_pt": "O podcasting brasileiro produziu grandes estrelas. Algum vai dar o salto para a TV mainstream em 2026?",
        "category": "tv",
        "scenarios": [("Yes", 53), ("No", 47)],
        "scenarios_pt": [("Sim", 53), ("Não", 47)],
    },
    {
        "slug_key": "globoplay-subscribers-10m",
        "title": "Will Globoplay reach 10 million subscribers in 2026?",
        "title_pt": "O Globoplay vai atingir 10 milhões de assinantes em 2026?",
        "description": "Globoplay has been growing steadily. Will it hit the 10M subscriber milestone this year?",
        "description_pt": "O Globoplay tem crescido de forma constante. Vai atingir a marca de 10 milhões de assinantes este ano?",
        "category": "tv",
        "scenarios": [("Yes", 49), ("No", 51)],
        "scenarios_pt": [("Sim", 49), ("Não", 51)],
    },
    {
        "slug_key": "the-voice-br-2026",
        "title": "Will The Voice Brasil return with a new celebrity coach in 2026?",
        "title_pt": "The Voice Brasil vai retornar com um novo técnico celebridade em 2026?",
        "description": "The Voice Brasil has been refreshing its coach lineup. Will a surprise new celebrity join the show?",
        "description_pt": "The Voice Brasil tem renovado seu time de técnicos. Uma nova celebridade surpresa vai se juntar ao programa?",
        "category": "tv",
        "scenarios": [("Yes", 64), ("No", 36)],
        "scenarios_pt": [("Sim", 64), ("Não", 36)],
    },

    # ── Science ───────────────────────────────────────────────────────────────
    {
        "slug_key": "james-webb-discovery-2026",
        "title": "Will the James Webb Telescope announce a major discovery in 2026?",
        "title_pt": "O Telescópio James Webb vai anunciar uma grande descoberta em 2026?",
        "description": "JWST keeps producing groundbreaking science. Will 2026 see a landmark discovery announcement?",
        "description_pt": "O JWST continua produzindo ciência revolucionária. 2026 vai ver o anúncio de uma descoberta histórica?",
        "category": "science",
        "scenarios": [("Yes", 78), ("No", 22)],
        "scenarios_pt": [("Sim", 78), ("Não", 22)],
    },
    {
        "slug_key": "cancer-cure-breakthrough",
        "title": "Will a major cancer treatment breakthrough be announced in 2026?",
        "title_pt": "Um grande avanço no tratamento do câncer vai ser anunciado em 2026?",
        "description": "Cancer research has been accelerating with AI and mRNA tech. Will 2026 see a historic treatment advance?",
        "description_pt": "A pesquisa sobre câncer tem acelerado com IA e tecnologia mRNA. 2026 vai ver um avanço histórico no tratamento?",
        "category": "science",
        "scenarios": [("Yes", 51), ("No", 49)],
        "scenarios_pt": [("Sim", 51), ("Não", 49)],
    },
    {
        "slug_key": "nasa-moon-return-2026",
        "title": "Will NASA's Artemis program land humans on the Moon in 2026?",
        "title_pt": "O programa Artemis da NASA vai pousar humanos na Lua em 2026?",
        "description": "NASA's Artemis has faced delays. Will the crewed lunar landing finally happen in 2026?",
        "description_pt": "O Artemis da NASA enfrentou atrasos. O pouso lunar tripulado vai finalmente acontecer em 2026?",
        "category": "science",
        "scenarios": [("Yes", 34), ("No", 66)],
        "scenarios_pt": [("Sim", 34), ("Não", 66)],
    },
    {
        "slug_key": "alzheimer-drug-approval",
        "title": "Will a new Alzheimer's drug receive FDA approval in 2026?",
        "title_pt": "Um novo medicamento para Alzheimer vai receber aprovação da FDA em 2026?",
        "description": "Several Alzheimer's drugs are in late-stage trials. Will one receive full FDA approval this year?",
        "description_pt": "Vários medicamentos para Alzheimer estão em ensaios de fase avançada. Algum vai receber aprovação total da FDA este ano?",
        "category": "science",
        "scenarios": [("Yes", 47), ("No", 53)],
        "scenarios_pt": [("Sim", 47), ("Não", 53)],
    },
    {
        "slug_key": "brazil-science-budget",
        "title": "Will Brazil increase its science and research budget by more than 10% in 2026?",
        "title_pt": "O Brasil vai aumentar seu orçamento de ciência e pesquisa em mais de 10% em 2026?",
        "description": "Brazil's science funding has been volatile. Will the government commit to a significant budget increase?",
        "description_pt": "O financiamento científico do Brasil tem sido volátil. O governo vai se comprometer com um aumento significativo no orçamento?",
        "category": "science",
        "scenarios": [("Yes", 38), ("No", 62)],
        "scenarios_pt": [("Sim", 38), ("Não", 62)],
    },
    {
        "slug_key": "crispr-human-trial-2026",
        "title": "Will a CRISPR gene therapy receive regulatory approval in 2026?",
        "title_pt": "Uma terapia genética com CRISPR vai receber aprovação regulatória em 2026?",
        "description": "CRISPR therapies are advancing through clinical trials. Will one receive full regulatory approval this year?",
        "description_pt": "As terapias com CRISPR estão avançando nos ensaios clínicos. Alguma vai receber aprovação regulatória total este ano?",
        "category": "science",
        "scenarios": [("Yes", 43), ("No", 57)],
        "scenarios_pt": [("Sim", 43), ("Não", 57)],
    },
    {
        "slug_key": "fusion-energy-milestone",
        "title": "Will nuclear fusion produce net energy gain again in 2026?",
        "title_pt": "A fusão nuclear vai produzir ganho líquido de energia novamente em 2026?",
        "description": "Following the 2022 NIF breakthrough, will fusion energy achieve another net gain milestone in 2026?",
        "description_pt": "Após o avanço do NIF em 2022, a energia de fusão vai atingir outro marco de ganho líquido em 2026?",
        "category": "science",
        "scenarios": [("Yes", 56), ("No", 44)],
        "scenarios_pt": [("Sim", 56), ("Não", 44)],
    },
    {
        "slug_key": "alien-life-evidence",
        "title": "Will scientists announce credible evidence of extraterrestrial life in 2026?",
        "title_pt": "Cientistas vão anunciar evidências críveis de vida extraterrestre em 2026?",
        "description": "NASA and ESA are actively searching for biosignatures. Will 2026 produce a credible life detection announcement?",
        "description_pt": "A NASA e a ESA estão ativamente buscando biossinaturas. 2026 vai produzir um anúncio crível de detecção de vida?",
        "category": "science",
        "scenarios": [("Yes", 8), ("No", 92)],
        "scenarios_pt": [("Sim", 8), ("Não", 92)],
    },
    {
        "slug_key": "fiocruz-vaccine-2026",
        "title": "Will Fiocruz develop a new vaccine approved for public use in Brazil in 2026?",
        "title_pt": "A Fiocruz vai desenvolver uma nova vacina aprovada para uso público no Brasil em 2026?",
        "description": "Fiocruz is a global leader in vaccine development. Will they have a new vaccine approved this year?",
        "description_pt": "A Fiocruz é líder global no desenvolvimento de vacinas. Vão ter uma nova vacina aprovada este ano?",
        "category": "science",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "solar-storm-impact-2026",
        "title": "Will a major solar storm disrupt global communications in 2026?",
        "title_pt": "Uma grande tempestade solar vai perturbar as comunicações globais em 2026?",
        "description": "Solar activity is at a peak. Will a powerful solar storm cause significant disruption to tech infrastructure?",
        "description_pt": "A atividade solar está no pico. Uma poderosa tempestade solar vai causar perturbação significativa na infraestrutura tecnológica?",
        "category": "science",
        "scenarios": [("Yes", 21), ("No", 79)],
        "scenarios_pt": [("Sim", 21), ("Não", 79)],
    },

    # ── Weather ───────────────────────────────────────────────────────────────
    {
        "slug_key": "br-summer-heat-record",
        "title": "Will Brazil break its national heat record in 2026?",
        "title_pt": "O Brasil vai quebrar seu recorde nacional de temperatura em 2026?",
        "description": "Brazil has been experiencing extreme heat. Will temperatures surpass the all-time national record this year?",
        "description_pt": "O Brasil tem enfrentado calor extremo. As temperaturas vão superar o recorde nacional de todos os tempos este ano?",
        "category": "weather",
        "scenarios": [("Yes", 34), ("No", 66)],
        "scenarios_pt": [("Sim", 34), ("Não", 66)],
    },
    {
        "slug_key": "amazon-drought-2026",
        "title": "Will the Amazon experience a severe drought in 2026?",
        "title_pt": "A Amazônia vai enfrentar uma seca severa em 2026?",
        "description": "The Amazon has faced historic droughts in recent years. Will 2026 bring another severe drought event?",
        "description_pt": "A Amazônia enfrentou secas históricas nos últimos anos. 2026 vai trazer outro evento de seca severa?",
        "category": "weather",
        "scenarios": [("Yes", 48), ("No", 52)],
        "scenarios_pt": [("Sim", 48), ("Não", 52)],
    },
    {
        "slug_key": "sp-flood-season-2026",
        "title": "Will São Paulo have a major flood event this rainy season?",
        "title_pt": "São Paulo vai ter um grande evento de enchente nesta temporada de chuvas?",
        "description": "São Paulo's rainy season brings regular flooding. Will 2026 see a severe flood affecting major areas?",
        "description_pt": "A temporada de chuvas de São Paulo traz enchentes regulares. 2026 vai ver uma enchente severa afetando grandes áreas?",
        "category": "weather",
        "scenarios": [("Yes", 62), ("No", 38)],
        "scenarios_pt": [("Sim", 62), ("Não", 38)],
    },
    {
        "slug_key": "atlantic-hurricane-season",
        "title": "Will the 2026 Atlantic hurricane season be above average?",
        "title_pt": "A temporada de furacões no Atlântico de 2026 vai ser acima da média?",
        "description": "Climate forecasters are tracking La Niña conditions. Will the 2026 season produce above-average storm activity?",
        "description_pt": "Os meteorologistas estão acompanhando as condições de La Niña. A temporada de 2026 vai produzir atividade de tempestades acima da média?",
        "category": "weather",
        "scenarios": [("Yes", 57), ("No", 43)],
        "scenarios_pt": [("Sim", 57), ("Não", 43)],
    },
    {
        "slug_key": "el-nino-2026",
        "title": "Will El Niño conditions return in the second half of 2026?",
        "title_pt": "As condições de El Niño vão retornar no segundo semestre de 2026?",
        "description": "After La Niña, meteorologists are watching for El Niño patterns. Will El Niño develop by late 2026?",
        "description_pt": "Após La Niña, os meteorologistas estão observando os padrões de El Niño. O El Niño vai se desenvolver no final de 2026?",
        "category": "weather",
        "scenarios": [("Yes", 41), ("No", 59)],
        "scenarios_pt": [("Sim", 41), ("Não", 59)],
    },
    {
        "slug_key": "rio-rainfall-record",
        "title": "Will Rio de Janeiro break its annual rainfall record in 2026?",
        "title_pt": "O Rio de Janeiro vai quebrar seu recorde anual de chuvas em 2026?",
        "description": "Rio has been experiencing increasingly intense rainfall events. Will the annual total set a new record?",
        "description_pt": "O Rio tem enfrentado eventos de chuva cada vez mais intensos. O total anual vai bater um novo recorde?",
        "category": "weather",
        "scenarios": [("Yes", 31), ("No", 69)],
        "scenarios_pt": [("Sim", 31), ("Não", 69)],
    },
    {
        "slug_key": "nordeste-drought-2026",
        "title": "Will the Brazilian Northeast face a severe drought in 2026?",
        "title_pt": "O Nordeste brasileiro vai enfrentar uma seca severa em 2026?",
        "description": "The semi-arid Northeast is prone to droughts. Will 2026 bring another severe drought to the region?",
        "description_pt": "O semiárido nordestino é propenso a secas. 2026 vai trazer mais uma seca severa para a região?",
        "category": "weather",
        "scenarios": [("Yes", 44), ("No", 56)],
        "scenarios_pt": [("Sim", 44), ("Não", 56)],
    },
    {
        "slug_key": "global-temp-record-2026",
        "title": "Will 2026 be the hottest year on record globally?",
        "title_pt": "2026 vai ser o ano mais quente já registrado globalmente?",
        "description": "2023 and 2024 were record-hot years. Will 2026 continue the trend and set a new global temperature record?",
        "description_pt": "2023 e 2024 foram anos recordes de calor. 2026 vai continuar a tendência e bater um novo recorde de temperatura global?",
        "category": "weather",
        "scenarios": [("Yes", 52), ("No", 48)],
        "scenarios_pt": [("Sim", 52), ("Não", 48)],
    },
    {
        "slug_key": "br-tornado-rare-2026",
        "title": "Will Brazil experience an unusually high number of tornadoes in 2026?",
        "title_pt": "O Brasil vai registrar um número incomumente alto de tornados em 2026?",
        "description": "Brazil has been seeing more frequent tornadic activity. Will 2026 see an above-average number of tornadoes?",
        "description_pt": "O Brasil tem visto atividade de tornados mais frequente. 2026 vai registrar um número acima da média de tornados?",
        "category": "weather",
        "scenarios": [("Yes", 38), ("No", 62)],
        "scenarios_pt": [("Sim", 38), ("Não", 62)],
    },
    {
        "slug_key": "pantanal-fire-season-2026",
        "title": "Will the Pantanal fire season be worse than 2024 in 2026?",
        "title_pt": "A temporada de incêndios no Pantanal vai ser pior que 2024 em 2026?",
        "description": "The Pantanal has faced devastating fires in recent years. Will 2026 surpass 2024's fire destruction?",
        "description_pt": "O Pantanal tem enfrentado incêndios devastadores nos últimos anos. 2026 vai superar a destruição dos incêndios de 2024?",
        "category": "weather",
        "scenarios": [("Yes", 36), ("No", 64)],
        "scenarios_pt": [("Sim", 36), ("Não", 64)],
    },

    # ── Multi-option markets (4-6 outcomes, higher multipliers) ──────────────
    {
        "slug_key": "btc-price-range-eoy-2026",
        "title": "Where will Bitcoin's price be at end of 2026?",
        "title_pt": "Qual será o preço do Bitcoin no fim de 2026?",
        "description": "Pick the price range you think Bitcoin will land in by December 31, 2026.",
        "description_pt": "Escolha a faixa de preço em que você acha que o Bitcoin vai estar em 31 de dezembro de 2026.",
        "category": "crypto",
        "scenarios": [
            ("Below $50,000", 8),
            ("$50k – $80k", 18),
            ("$80k – $120k", 34),
            ("$120k – $180k", 27),
            ("Above $180k", 13),
        ],
        "scenarios_pt": [
            ("Abaixo de $50.000", 8),
            ("$50k – $80k", 18),
            ("$80k – $120k", 34),
            ("$120k – $180k", 27),
            ("Acima de $180k", 13),
        ],
    },
    {
        "slug_key": "world-cup-2026-winner",
        "title": "Which country will win the 2026 World Cup?",
        "title_pt": "Qual país vai vencer a Copa do Mundo 2026?",
        "description": "Pick the country you think will lift the trophy at the 2026 FIFA World Cup.",
        "description_pt": "Escolha o país que você acha que vai levantar a taça na Copa do Mundo FIFA 2026.",
        "category": "sports",
        "scenarios": [
            ("Brazil", 18),
            ("France", 16),
            ("England", 14),
            ("Argentina", 15),
            ("Germany", 11),
            ("Other", 26),
        ],
        "scenarios_pt": [
            ("Brasil", 18),
            ("França", 16),
            ("Inglaterra", 14),
            ("Argentina", 15),
            ("Alemanha", 11),
            ("Outro", 26),
        ],
    },
    {
        "slug_key": "brazil-president-2026",
        "title": "Who will win the 2026 Brazilian presidential election?",
        "title_pt": "Quem vai vencer a eleição presidencial brasileira de 2026?",
        "description": "Pick the candidate you think will win the 2026 Brazilian presidential election.",
        "description_pt": "Escolha o candidato que você acha que vai vencer a eleição presidencial brasileira de 2026.",
        "category": "politics",
        "scenarios": [
            ("Lula (PT)", 41),
            ("Bolsonaro / right-wing candidate", 35),
            ("Tarcísio de Freitas", 14),
            ("Other candidate", 10),
        ],
        "scenarios_pt": [
            ("Lula (PT)", 41),
            ("Bolsonaro / candidato de direita", 35),
            ("Tarcísio de Freitas", 14),
            ("Outro candidato", 10),
        ],
    },
    {
        "slug_key": "selic-rate-end-2026",
        "title": "What will Brazil's Selic rate be at end of 2026?",
        "title_pt": "Qual será a taxa Selic do Brasil no fim de 2026?",
        "description": "Pick the range you think the Selic rate will land in by December 2026.",
        "description_pt": "Escolha a faixa em que você acha que a taxa Selic vai estar em dezembro de 2026.",
        "category": "economy",
        "scenarios": [
            ("Below 10%", 9),
            ("10% – 12%", 22),
            ("12% – 13.5%", 31),
            ("13.5% – 15%", 24),
            ("Above 15%", 14),
        ],
        "scenarios_pt": [
            ("Abaixo de 10%", 9),
            ("10% – 12%", 22),
            ("12% – 13,5%", 31),
            ("13,5% – 15%", 24),
            ("Acima de 15%", 14),
        ],
    },
    {
        "slug_key": "f1-champion-2026",
        "title": "Who will be the 2026 F1 World Champion?",
        "title_pt": "Quem será o Campeão Mundial de F1 em 2026?",
        "description": "Pick the driver you think will win the 2026 Formula 1 World Championship.",
        "description_pt": "Escolha o piloto que você acha que vai vencer o Campeonato Mundial de Fórmula 1 em 2026.",
        "category": "sports",
        "scenarios": [
            ("Max Verstappen", 32),
            ("Lewis Hamilton", 22),
            ("Charles Leclerc", 16),
            ("Lando Norris", 14),
            ("Other driver", 16),
        ],
        "scenarios_pt": [
            ("Max Verstappen", 32),
            ("Lewis Hamilton", 22),
            ("Charles Leclerc", 16),
            ("Lando Norris", 14),
            ("Outro piloto", 16),
        ],
    },
    {
        "slug_key": "ai-leader-end-2026",
        "title": "Which AI company will be most dominant by end of 2026?",
        "title_pt": "Qual empresa de IA será mais dominante até o fim de 2026?",
        "description": "Pick the AI company you think will lead the market by the end of 2026.",
        "description_pt": "Escolha a empresa de IA que você acha que vai liderar o mercado até o fim de 2026.",
        "category": "technology",
        "scenarios": [
            ("OpenAI", 38),
            ("Google / Gemini", 28),
            ("Anthropic", 14),
            ("Meta AI", 11),
            ("Other", 9),
        ],
        "scenarios_pt": [
            ("OpenAI", 38),
            ("Google / Gemini", 28),
            ("Anthropic", 14),
            ("Meta AI", 11),
            ("Outro", 9),
        ],
    },
    {
        "slug_key": "nba-champion-2026",
        "title": "Which team will win the 2026 NBA Championship?",
        "title_pt": "Qual time vai vencer o Campeonato da NBA 2026?",
        "description": "Pick the team you think will win the 2026 NBA Finals.",
        "description_pt": "Escolha o time que você acha que vai vencer as Finais da NBA 2026.",
        "category": "sports",
        "scenarios": [
            ("Boston Celtics", 22),
            ("Golden State Warriors", 14),
            ("Oklahoma City Thunder", 18),
            ("Cleveland Cavaliers", 16),
            ("Other team", 30),
        ],
        "scenarios_pt": [
            ("Boston Celtics", 22),
            ("Golden State Warriors", 14),
            ("Oklahoma City Thunder", 18),
            ("Cleveland Cavaliers", 16),
            ("Outro time", 30),
        ],
    },
    {
        "slug_key": "usd-brl-end-2026",
        "title": "Where will USD/BRL be at end of 2026?",
        "title_pt": "Onde vai estar o dólar (USD/BRL) no fim de 2026?",
        "description": "Pick the price range you think the USD/BRL exchange rate will be in by December 2026.",
        "description_pt": "Escolha a faixa de preço em que você acha que o câmbio USD/BRL vai estar em dezembro de 2026.",
        "category": "economy",
        "scenarios": [
            ("Below R$5.00", 7),
            ("R$5.00 – R$5.50", 16),
            ("R$5.50 – R$6.00", 29),
            ("R$6.00 – R$6.80", 31),
            ("Above R$6.80", 17),
        ],
        "scenarios_pt": [
            ("Abaixo de R$5,00", 7),
            ("R$5,00 – R$5,50", 16),
            ("R$5,50 – R$6,00", 29),
            ("R$6,00 – R$6,80", 31),
            ("Acima de R$6,80", 17),
        ],
    },
    {
        "slug_key": "brasileirao-champion-2026",
        "title": "Which club will win the Brasileirão 2026?",
        "title_pt": "Qual clube vai vencer o Brasileirão 2026?",
        "description": "Pick the team you think will be crowned Brazilian football champion in 2026.",
        "description_pt": "Escolha o time que você acha que vai ser coroado campeão brasileiro de futebol em 2026.",
        "category": "sports",
        "scenarios": [
            ("Flamengo", 24),
            ("Palmeiras", 21),
            ("Atlético Mineiro", 16),
            ("Corinthians", 12),
            ("Fluminense", 9),
            ("Other club", 18),
        ],
        "scenarios_pt": [
            ("Flamengo", 24),
            ("Palmeiras", 21),
            ("Atlético Mineiro", 16),
            ("Corinthians", 12),
            ("Fluminense", 9),
            ("Outro clube", 18),
        ],
    },
    {
        "slug_key": "eth-price-range-eoy-2026",
        "title": "Where will Ethereum's price be at end of 2026?",
        "title_pt": "Qual será o preço do Ethereum no fim de 2026?",
        "description": "Pick the price range you think ETH will land in by December 31, 2026.",
        "description_pt": "Escolha a faixa de preço em que você acha que o ETH vai estar em 31 de dezembro de 2026.",
        "category": "crypto",
        "scenarios": [
            ("Below $1,500", 7),
            ("$1,500 – $3,000", 19),
            ("$3,000 – $5,000", 33),
            ("$5,000 – $8,000", 26),
            ("Above $8,000", 15),
        ],
        "scenarios_pt": [
            ("Abaixo de $1.500", 7),
            ("$1.500 – $3.000", 19),
            ("$3.000 – $5.000", 33),
            ("$5.000 – $8.000", 26),
            ("Acima de $8.000", 15),
        ],
    },

    # ── Iran / Middle East deep markets ──────────────────────────────────────
    {"slug_key": "iran-oil-exports-q2-2026", "title": "Will Iran's oil exports exceed 1.8M barrels/day in Q2 2026?", "title_pt": "As exportações de petróleo do Irã vão superar 1,8M barris/dia no T2 2026?", "description": "Iran has been increasing oil exports despite sanctions. Will Q2 2026 exceed 1.8M bpd?", "description_pt": "O Irã tem aumentado as exportações de petróleo apesar das sanções.", "category": "geopolitics", "scenarios": [("Yes", 44), ("No", 56)], "scenarios_pt": [("Sim", 44), ("Não", 56)]},
    {"slug_key": "iran-nuclear-deal-2026", "title": "Will Iran sign a new nuclear deal before end of 2026?", "title_pt": "O Irã vai assinar um novo acordo nuclear antes do fim de 2026?", "description": "Negotiations between Iran and Western powers continue. Will a deal be reached?", "description_pt": "As negociações entre o Irã e potências ocidentais continuam.", "category": "geopolitics", "scenarios": [("Yes", 24), ("No", 76)], "scenarios_pt": [("Sim", 24), ("Não", 76)]},
    {"slug_key": "iran-oil-price-impact-2026", "title": "Will oil prices exceed $100/barrel due to Iran tensions in 2026?", "title_pt": "O preço do petróleo vai superar $100/barril por causa das tensões com o Irã em 2026?", "description": "Iran-related geopolitical risks remain high. Could escalation push oil above $100?", "description_pt": "Os riscos geopolíticos relacionados ao Irã permanecem altos.", "category": "economy", "scenarios": [("Yes", 29), ("No", 71)], "scenarios_pt": [("Sim", 29), ("Não", 71)]},
    {"slug_key": "iran-israel-strike-2026", "title": "Will Israel conduct a military strike on Iran in 2026?", "title_pt": "Israel vai conduzir um ataque militar ao Irã em 2026?", "description": "Tensions between Israel and Iran remain at historic highs. Will direct military action occur?", "description_pt": "As tensões entre Israel e Irã estão em máximas históricas.", "category": "geopolitics", "scenarios": [("Yes", 22), ("No", 78)], "scenarios_pt": [("Sim", 22), ("Não", 78)]},
    {"slug_key": "iran-rial-collapse-2026", "title": "Will the Iranian Rial hit a new all-time low in 2026?", "title_pt": "O Rial iraniano vai atingir uma nova mínima histórica em 2026?", "description": "The Iranian Rial has been under severe pressure. Will it hit new lows?", "description_pt": "O Rial iraniano está sob pressão severa.", "category": "economy", "scenarios": [("Yes", 61), ("No", 39)], "scenarios_pt": [("Sim", 61), ("Não", 39)]},
    {"slug_key": "opec-cut-q2-2026", "title": "Will OPEC+ announce additional production cuts in Q2 2026?", "title_pt": "A OPEP+ vai anunciar cortes adicionais de produção no T2 2026?", "description": "OPEC+ has been managing production levels carefully. Will further cuts be announced?", "description_pt": "A OPEP+ tem gerenciado os níveis de produção com cuidado.", "category": "economy", "scenarios": [("Yes", 38), ("No", 62)], "scenarios_pt": [("Sim", 38), ("Não", 62)]},
    {"slug_key": "saudi-aramco-ipo-2026", "title": "Will Saudi Aramco announce a secondary share offering in 2026?", "title_pt": "A Saudi Aramco vai anunciar uma oferta secundária de ações em 2026?", "description": "Saudi Arabia has been considering raising capital through Aramco. Will a new offering happen?", "description_pt": "A Arábia Saudita tem considerado levantar capital através da Aramco.", "category": "economy", "scenarios": [("Yes", 31), ("No", 69)], "scenarios_pt": [("Sim", 31), ("Não", 69)]},

    # ── US Politics deep markets ──────────────────────────────────────────────
    {"slug_key": "trump-impeachment-2026", "title": "Will there be an impeachment vote against Trump in 2026?", "title_pt": "Haverá uma votação de impeachment contra Trump em 2026?", "description": "With Democrats in opposition, will the House attempt to impeach President Trump?", "description_pt": "Com os democratas na oposição, a Câmara tentará fazer o impeachment do presidente Trump?", "category": "politics", "scenarios": [("Yes", 18), ("No", 82)], "scenarios_pt": [("Sim", 18), ("Não", 82)]},
    {"slug_key": "trump-tariffs-brazil-2026", "title": "Will Trump impose 25%+ tariffs on Brazilian goods in 2026?", "title_pt": "Trump vai impor tarifas de 25%+ nos produtos brasileiros em 2026?", "description": "Trump has been aggressive with tariffs. Will Brazil be targeted with major trade barriers?", "description_pt": "Trump tem sido agressivo com tarifas. O Brasil será alvo de grandes barreiras comerciais?", "category": "geopolitics", "scenarios": [("Yes", 31), ("No", 69)], "scenarios_pt": [("Sim", 31), ("Não", 69)]},
    {"slug_key": "us-midterms-2026-house", "title": "Will Democrats win back the House in the 2026 midterms?", "title_pt": "Os democratas vão reconquistar a Câmara nas eleições de meio de mandato de 2026?", "description": "The 2026 midterm elections could reshape the balance of power in Washington.", "description_pt": "As eleições de meio de mandato de 2026 podem remodelar o equilíbrio de poder em Washington.", "category": "politics", "scenarios": [("Yes", 44), ("No", 56)], "scenarios_pt": [("Sim", 44), ("Não", 56)]},
    {"slug_key": "us-debt-ceiling-2026", "title": "Will the US hit its debt ceiling crisis in 2026?", "title_pt": "Os EUA vão enfrentar uma crise do teto da dívida em 2026?", "description": "The US debt ceiling has been a recurring political battleground.", "description_pt": "O teto da dívida dos EUA tem sido um campo de batalha político recorrente.", "category": "economy", "scenarios": [("Yes", 35), ("No", 65)], "scenarios_pt": [("Sim", 35), ("Não", 65)]},
    {"slug_key": "us-fed-cut-sept-2026", "title": "Will the US Fed cut rates in September 2026?", "title_pt": "O Fed dos EUA vai cortar as taxas em setembro de 2026?", "description": "Will the Federal Reserve cut interest rates at its September 2026 meeting?", "description_pt": "O Federal Reserve vai cortar as taxas de juros na reunião de setembro de 2026?", "category": "economy", "scenarios": [("Yes", 52), ("No", 48)], "scenarios_pt": [("Sim", 52), ("Não", 48)]},
    {"slug_key": "us-recession-2026", "title": "Will the US enter a recession in 2026?", "title_pt": "Os EUA vão entrar em recessão em 2026?", "description": "Economic indicators are mixed. Will the US economy contract in 2026?", "description_pt": "Os indicadores econômicos são mistos. A economia dos EUA vai contrair em 2026?", "category": "economy", "scenarios": [("Yes", 28), ("No", 72)], "scenarios_pt": [("Sim", 28), ("Não", 72)]},

    # ── Crypto DeFi deep markets ──────────────────────────────────────────────
    {"slug_key": "solana-etf-approval-2026", "title": "Will a Solana ETF be approved in the US in 2026?", "title_pt": "Um ETF de Solana será aprovado nos EUA em 2026?", "description": "Following Bitcoin and Ethereum ETFs, will Solana get its own US ETF approval?", "description_pt": "Após os ETFs de Bitcoin e Ethereum, o Solana terá sua própria aprovação de ETF nos EUA?", "category": "crypto", "scenarios": [("Yes", 48), ("No", 52)], "scenarios_pt": [("Sim", 48), ("Não", 52)]},
    {"slug_key": "btc-200k-2026", "title": "Will Bitcoin reach $200,000 in 2026?", "title_pt": "O Bitcoin vai chegar a $200.000 em 2026?", "description": "Bitcoin has been on a bull run. Will it reach the $200k milestone this year?", "description_pt": "O Bitcoin está em alta. Ele vai atingir a marca de $200k este ano?", "category": "crypto", "scenarios": [("Yes", 19), ("No", 81)], "scenarios_pt": [("Sim", 19), ("Não", 81)]},
    {"slug_key": "eth-merge-staking-2026", "title": "Will Ethereum staking APR drop below 3% in 2026?", "title_pt": "O APR de staking do Ethereum vai cair abaixo de 3% em 2026?", "description": "As more ETH is staked, yields decrease. Will staking rewards fall below 3%?", "description_pt": "À medida que mais ETH é stakeado, os rendimentos diminuem.", "category": "crypto", "scenarios": [("Yes", 33), ("No", 67)], "scenarios_pt": [("Sim", 33), ("Não", 67)]},
    {"slug_key": "xrp-price-5-2026", "title": "Will XRP reach $5 before end of 2026?", "title_pt": "O XRP vai chegar a $5 antes do fim de 2026?", "description": "XRP has been gaining momentum after legal clarity. Will it hit $5?", "description_pt": "O XRP ganhou impulso após a clareza legal. Ele vai atingir $5?", "category": "crypto", "scenarios": [("Yes", 36), ("No", 64)], "scenarios_pt": [("Sim", 36), ("Não", 64)]},
    {"slug_key": "bnb-new-ath-2026", "title": "Will BNB hit a new all-time high in 2026?", "title_pt": "O BNB vai atingir uma nova máxima histórica em 2026?", "description": "BNB has been consolidating. Will it break to new all-time highs in 2026?", "description_pt": "O BNB tem estado em consolidação. Ele vai romper para novas máximas históricas em 2026?", "category": "crypto", "scenarios": [("Yes", 41), ("No", 59)], "scenarios_pt": [("Sim", 41), ("Não", 59)]},
    {"slug_key": "defi-tvl-100b-2026", "title": "Will DeFi total value locked exceed $100B in 2026?", "title_pt": "O valor total bloqueado em DeFi vai superar $100B em 2026?", "description": "DeFi has been growing rapidly. Will TVL break the $100B barrier?", "description_pt": "O DeFi tem crescido rapidamente. O TVL vai romper a barreira de $100B?", "category": "crypto", "scenarios": [("Yes", 47), ("No", 53)], "scenarios_pt": [("Sim", 47), ("Não", 53)]},
    {"slug_key": "crypto-market-cap-4t-2026", "title": "Will total crypto market cap exceed $4 trillion in 2026?", "title_pt": "A capitalização total do mercado cripto vai superar $4 trilhões em 2026?", "description": "The total crypto market has been expanding. Will it surpass $4T?", "description_pt": "O mercado cripto total tem se expandido. Ele vai superar $4T?", "category": "crypto", "scenarios": [("Yes", 38), ("No", 62)], "scenarios_pt": [("Sim", 38), ("Não", 62)]},

    # ── Brazilian daily life markets ──────────────────────────────────────────
    {"slug_key": "pix-international-2026", "title": "Will Pix international transfers launch in Brazil in 2026?", "title_pt": "As transferências internacionais pelo Pix vão ser lançadas no Brasil em 2026?", "description": "The Central Bank has been working on Pix international. Will it go live this year?", "description_pt": "O Banco Central tem trabalhado no Pix internacional. Ele vai ao ar este ano?", "category": "economy", "scenarios": [("Yes", 58), ("No", 42)], "scenarios_pt": [("Sim", 58), ("Não", 42)]},
    {"slug_key": "nubank-300m-customers-2026", "title": "Will Nubank reach 150 million customers in 2026?", "title_pt": "O Nubank vai atingir 150 milhões de clientes em 2026?", "description": "Nubank has been growing rapidly across Latin America.", "description_pt": "O Nubank tem crescido rapidamente na América Latina.", "category": "economy", "scenarios": [("Yes", 46), ("No", 54)], "scenarios_pt": [("Sim", 46), ("Não", 54)]},
    {"slug_key": "enem-2026-record", "title": "Will ENEM 2026 break the record for number of applicants?", "title_pt": "O ENEM 2026 vai bater o recorde de número de inscritos?", "description": "ENEM participation has been growing. Will 2026 set a new all-time high?", "description_pt": "A participação no ENEM tem crescido. 2026 vai estabelecer uma nova máxima histórica?", "category": "politics", "scenarios": [("Yes", 52), ("No", 48)], "scenarios_pt": [("Sim", 52), ("Não", 48)]},
    {"slug_key": "uber-brazil-revenue-2026", "title": "Will Uber's Brazil revenue grow more than 20% in 2026?", "title_pt": "A receita do Uber no Brasil vai crescer mais de 20% em 2026?", "description": "Uber has been expanding its services in Brazil. Will strong growth continue?", "description_pt": "O Uber tem expandido seus serviços no Brasil. O crescimento forte vai continuar?", "category": "economy", "scenarios": [("Yes", 54), ("No", 46)], "scenarios_pt": [("Sim", 54), ("Não", 46)]},
    {"slug_key": "brazil-inflation-target-2026", "title": "Will Brazil's IPCA stay within the 3% target band in 2026?", "title_pt": "O IPCA do Brasil vai ficar dentro da banda alvo de 3% em 2026?", "description": "Brazil has been fighting to keep inflation under control. Will it stay within target?", "description_pt": "O Brasil tem lutado para manter a inflação sob controle.", "category": "economy", "scenarios": [("Yes", 39), ("No", 61)], "scenarios_pt": [("Sim", 39), ("Não", 61)]},
    {"slug_key": "petrobras-profit-2026", "title": "Will Petrobras post a record profit in 2026?", "title_pt": "A Petrobras vai registrar um lucro recorde em 2026?", "description": "Petrobras has been benefiting from high oil prices. Will profits reach record levels?", "description_pt": "A Petrobras tem se beneficiado dos altos preços do petróleo.", "category": "economy", "scenarios": [("Yes", 43), ("No", 57)], "scenarios_pt": [("Sim", 43), ("Não", 57)]},
    {"slug_key": "brazil-carnival-2026-record", "title": "Will the 2026 Brazilian Carnival break tourism records?", "title_pt": "O Carnaval Brasileiro de 2026 vai bater recordes de turismo?", "description": "Brazilian Carnival attracts millions. Will 2026 set new visitor records?", "description_pt": "O Carnaval Brasileiro atrai milhões. 2026 vai estabelecer novos recordes de visitantes?", "category": "entertainment", "scenarios": [("Yes", 62), ("No", 38)], "scenarios_pt": [("Sim", 62), ("Não", 38)]},
    {"slug_key": "copa-libertadores-br-winner-2026", "title": "Will a Brazilian club win the 2026 Copa Libertadores?", "title_pt": "Um clube brasileiro vai vencer a Copa Libertadores de 2026?", "description": "Brazilian clubs have dominated recently. Will they win the Libertadores in 2026?", "description_pt": "Os clubes brasileiros têm dominado recentemente. Eles vão vencer a Libertadores em 2026?", "category": "sports", "scenarios": [("Yes", 54), ("No", 46)], "scenarios_pt": [("Sim", 54), ("Não", 46)]},

    # ── AI / Tech deep markets ────────────────────────────────────────────────
    {"slug_key": "gpt6-release-2026", "title": "Will OpenAI release GPT-6 before end of 2026?", "title_pt": "A OpenAI vai lançar o GPT-6 antes do fim de 2026?", "description": "With GPT-5 already out, will OpenAI push GPT-6 in 2026?", "description_pt": "Com o GPT-5 já lançado, a OpenAI vai lançar o GPT-6 em 2026?", "category": "technology", "scenarios": [("Yes", 31), ("No", 69)], "scenarios_pt": [("Sim", 31), ("Não", 69)]},
    {"slug_key": "apple-ai-siri-2026", "title": "Will Apple's AI Siri overhaul launch globally in 2026?", "title_pt": "A reformulação da IA Siri da Apple vai ser lançada globalmente em 2026?", "description": "Apple has been working on a major Siri AI upgrade. Will it launch worldwide?", "description_pt": "A Apple tem trabalhado em uma grande atualização de IA para a Siri.", "category": "technology", "scenarios": [("Yes", 62), ("No", 38)], "scenarios_pt": [("Sim", 62), ("Não", 38)]},
    {"slug_key": "nvidia-stock-1000-2026", "title": "Will Nvidia stock hit $1,000 per share in 2026?", "title_pt": "A ação da Nvidia vai atingir $1.000 por ação em 2026?", "description": "Nvidia has been on a historic run. Will it reach $1,000 per share?", "description_pt": "A Nvidia está em uma corrida histórica. Ela vai atingir $1.000 por ação?", "category": "economy", "scenarios": [("Yes", 44), ("No", 56)], "scenarios_pt": [("Sim", 44), ("Não", 56)]},
    {"slug_key": "tesla-robotaxi-city-2026", "title": "Will Tesla launch its robotaxi service in 5+ cities by end of 2026?", "title_pt": "A Tesla vai lançar seu serviço de robotáxi em 5+ cidades até o fim de 2026?", "description": "Tesla's robotaxi rollout has been expanding. Will it cover 5+ cities by year end?", "description_pt": "O lançamento do robotáxi da Tesla tem se expandido.", "category": "technology", "scenarios": [("Yes", 37), ("No", 63)], "scenarios_pt": [("Sim", 37), ("Não", 63)]},
    {"slug_key": "meta-ar-glasses-2026", "title": "Will Meta ship consumer AR glasses in 2026?", "title_pt": "A Meta vai lançar óculos de RA para consumidores em 2026?", "description": "Meta has been developing AR glasses. Will they ship to consumers this year?", "description_pt": "A Meta tem desenvolvido óculos de RA. Eles serão lançados para consumidores este ano?", "category": "technology", "scenarios": [("Yes", 41), ("No", 59)], "scenarios_pt": [("Sim", 41), ("Não", 59)]},
    {"slug_key": "openai-ipo-2026", "title": "Will OpenAI go public (IPO) in 2026?", "title_pt": "A OpenAI vai abrir capital (IPO) em 2026?", "description": "OpenAI has been exploring going public. Will it IPO in 2026?", "description_pt": "A OpenAI tem explorado a abertura de capital. Ela vai fazer IPO em 2026?", "category": "technology", "scenarios": [("Yes", 34), ("No", 66)], "scenarios_pt": [("Sim", 34), ("Não", 66)]},

    # ── Sports deep markets ───────────────────────────────────────────────────
    {"slug_key": "neymar-brazil-2026-wc", "title": "Will Neymar make Brazil's 2026 World Cup squad?", "title_pt": "Neymar vai integrar o elenco do Brasil na Copa do Mundo 2026?", "description": "Neymar has been recovering from injury. Will he make the squad for the World Cup?", "description_pt": "Neymar está se recuperando de lesão. Ele vai estar na seleção para a Copa do Mundo?", "category": "sports", "scenarios": [("Yes", 49), ("No", 51)], "scenarios_pt": [("Sim", 49), ("Não", 51)]},
    {"slug_key": "brazil-wc-group-stage-2026", "title": "Will Brazil finish top of their 2026 World Cup group?", "title_pt": "O Brasil vai terminar em primeiro no seu grupo na Copa do Mundo 2026?", "description": "Brazil is expected to advance comfortably. Will they top their group?", "description_pt": "Espera-se que o Brasil avance confortavelmente. Eles vão liderar seu grupo?", "category": "sports", "scenarios": [("Yes", 67), ("No", 33)], "scenarios_pt": [("Sim", 67), ("Não", 33)]},
    {"slug_key": "verstappen-wc-2026-f1", "title": "Will Max Verstappen win the 2026 F1 Constructors title with Red Bull?", "title_pt": "Max Verstappen vai vencer o título de Construtores da F1 2026 com a Red Bull?", "description": "Red Bull's dominance has been challenged. Will they retain the constructors title?", "description_pt": "A dominância da Red Bull foi desafiada.", "category": "sports", "scenarios": [("Yes", 28), ("No", 72)], "scenarios_pt": [("Sim", 28), ("Não", 72)]},
    {"slug_key": "lakers-championship-2026", "title": "Will the LA Lakers win the 2026 NBA Championship?", "title_pt": "O LA Lakers vai vencer o Campeonato NBA 2026?", "description": "The Lakers have been competitive. Can they win the 2026 title?", "description_pt": "O Lakers tem sido competitivo. Eles podem vencer o título de 2026?", "category": "sports", "scenarios": [("Yes", 12), ("No", 88)], "scenarios_pt": [("Sim", 12), ("Não", 88)]},
    {"slug_key": "sinner-french-open-2026", "title": "Will Jannik Sinner win the French Open 2026?", "title_pt": "Jannik Sinner vai vencer o Aberto da França 2026?", "description": "Sinner has been dominating tennis. Can he add the French Open to his collection?", "description_pt": "Sinner tem dominado o tênis. Ele pode adicionar o Aberto da França à sua coleção?", "category": "sports", "scenarios": [("Yes", 22), ("No", 78)], "scenarios_pt": [("Sim", 22), ("Não", 78)]},
    {"slug_key": "man-city-ucl-2026", "title": "Will Manchester City win the 2026 UEFA Champions League?", "title_pt": "O Manchester City vai vencer a Liga dos Campeões da UEFA 2026?", "description": "Man City remains one of the favorites. Can they win the UCL in 2026?", "description_pt": "O Man City continua sendo um dos favoritos.", "category": "sports", "scenarios": [("Yes", 16), ("No", 84)], "scenarios_pt": [("Sim", 16), ("Não", 84)]},

    # ── Global geopolitics deep markets ──────────────────────────────────────
    {"slug_key": "russia-ukraine-ceasefire-2026", "title": "Will there be a formal ceasefire in Ukraine before July 2026?", "title_pt": "Haverá um cessar-fogo formal na Ucrânia antes de julho de 2026?", "description": "Peace negotiations have been ongoing. Will a formal ceasefire be reached?", "description_pt": "As negociações de paz estão em andamento.", "category": "geopolitics", "scenarios": [("Yes", 31), ("No", 69)], "scenarios_pt": [("Sim", 31), ("Não", 69)]},
    {"slug_key": "china-taiwan-military-2026", "title": "Will China conduct military exercises near Taiwan in Q2 2026?", "title_pt": "A China vai conduzir exercícios militares perto de Taiwan no T2 2026?", "description": "China has been increasing military pressure on Taiwan.", "description_pt": "A China tem aumentado a pressão militar sobre Taiwan.", "category": "geopolitics", "scenarios": [("Yes", 54), ("No", 46)], "scenarios_pt": [("Sim", 54), ("Não", 46)]},
    {"slug_key": "nato-new-member-2026", "title": "Will NATO admit a new member in 2026?", "title_pt": "A OTAN vai admitir um novo membro em 2026?", "description": "Several countries have been seeking NATO membership.", "description_pt": "Vários países têm buscado adesão à OTAN.", "category": "geopolitics", "scenarios": [("Yes", 28), ("No", 72)], "scenarios_pt": [("Sim", 28), ("Não", 72)]},
    {"slug_key": "north-korea-icbm-2026", "title": "Will North Korea test an ICBM in 2026?", "title_pt": "A Coreia do Norte vai testar um ICBM em 2026?", "description": "North Korea has been developing its missile program. Will it test an ICBM?", "description_pt": "A Coreia do Norte tem desenvolvido seu programa de mísseis.", "category": "geopolitics", "scenarios": [("Yes", 58), ("No", 42)], "scenarios_pt": [("Sim", 58), ("Não", 42)]},
    {"slug_key": "india-pakistan-conflict-2026", "title": "Will there be a military clash between India and Pakistan in 2026?", "title_pt": "Haverá um conflito militar entre Índia e Paquistão em 2026?", "description": "Tensions between India and Pakistan remain elevated.", "description_pt": "As tensões entre Índia e Paquistão permanecem elevadas.", "category": "geopolitics", "scenarios": [("Yes", 21), ("No", 79)], "scenarios_pt": [("Sim", 21), ("Não", 79)]},
    {"slug_key": "eu-ai-act-enforcement-2026", "title": "Will the EU begin enforcing its AI Act in 2026?", "title_pt": "A UE vai começar a aplicar sua Lei de IA em 2026?", "description": "The EU AI Act is being implemented. Will enforcement actions begin this year?", "description_pt": "A Lei de IA da UE está sendo implementada.", "category": "technology", "scenarios": [("Yes", 67), ("No", 33)], "scenarios_pt": [("Sim", 67), ("Não", 33)]},

    # ── Multi-option: who leads by category ───────────────────────────────────
    {
        "slug_key": "oil-price-range-q3-2026",
        "title": "Where will Brent crude oil price be in Q3 2026?",
        "title_pt": "Onde vai estar o preço do Brent no T3 2026?",
        "description": "Pick the price range you think Brent crude will be trading in during Q3 2026.",
        "description_pt": "Escolha a faixa de preço em que você acha que o Brent vai estar no T3 2026.",
        "category": "economy",
        "scenarios": [("Below $60", 9), ("$60 – $75", 24), ("$75 – $90", 38), ("$90 – $110", 21), ("Above $110", 8)],
        "scenarios_pt": [("Abaixo de $60", 9), ("$60 – $75", 24), ("$75 – $90", 38), ("$90 – $110", 21), ("Acima de $110", 8)],
    },
    {
        "slug_key": "next-country-join-brics-2026",
        "title": "Which country will be next to join BRICS in 2026?",
        "title_pt": "Qual país vai ser o próximo a entrar no BRICS em 2026?",
        "description": "Several countries have applied to join BRICS. Which will be admitted next?",
        "description_pt": "Vários países solicitaram a adesão ao BRICS. Qual será admitido a seguir?",
        "category": "geopolitics",
        "scenarios": [("Turkey", 24), ("Nigeria", 18), ("Indonesia", 21), ("Venezuela", 12), ("None in 2026", 25)],
        "scenarios_pt": [("Turquia", 24), ("Nigéria", 18), ("Indonésia", 21), ("Venezuela", 12), ("Nenhum em 2026", 25)],
    },
    {
        "slug_key": "top-crypto-end-2026",
        "title": "Which crypto will have the highest % gain in 2026?",
        "title_pt": "Qual cripto terá o maior % de ganho em 2026?",
        "description": "Pick the cryptocurrency you think will outperform all others by end of 2026.",
        "description_pt": "Escolha a criptomoeda que você acha que vai superar todas as outras até o fim de 2026.",
        "category": "crypto",
        "scenarios": [("Bitcoin (BTC)", 22), ("Solana (SOL)", 28), ("XRP", 18), ("Ethereum (ETH)", 16), ("Other", 16)],
        "scenarios_pt": [("Bitcoin (BTC)", 22), ("Solana (SOL)", 28), ("XRP", 18), ("Ethereum (ETH)", 16), ("Outro", 16)],
    },
]

CATEGORY_ICONS = {
    "politics":      "🏛",
    "economy":       "📈",
    "sports":        "⚽",
    "technology":    "💻",
    "geopolitics":   "🌍",
    "crypto":        "₿",
    "entertainment": "🎬",
    "music":         "🎵",
    "tv":            "📺",
    "science":       "🔬",
    "weather":       "🌦",
}


def _log_snapshot(db: Session, scenario: Scenario, source: str = "5min") -> None:
    db.add(ScenarioProbabilityHistory(
        scenario_id=scenario.id,
        event_id=scenario.event_id,
        probability=scenario.probability,
        source=source,
        recorded_at=datetime.utcnow(),
    ))


def _seed_history(db: Session, scenario: Scenario, points: int = 96) -> None:
    """Seed a new scenario with volatile history so charts look alive from day 1."""
    prob = scenario.probability
    trend = random.choice([-1, 1])
    trend_strength = random.uniform(1.0, 3.0)
    for i in range(points, 0, -1):
        if random.random() < 0.08:
            trend *= -1
            trend_strength = random.uniform(1.0, 3.5)
        if random.random() < 0.15:
            nudge = random.uniform(12, 25) * trend * trend_strength
        elif random.random() < 0.35:
            nudge = random.uniform(5, 12) * trend * trend_strength
        else:
            nudge = random.gauss(0, 4.5)
        prob = max(5.0, min(95.0, prob - nudge))
        db.add(ScenarioProbabilityHistory(
            scenario_id=scenario.id,
            event_id=scenario.event_id,
            probability=round(prob, 1),
            source="seed",
            recorded_at=datetime.utcnow() - timedelta(minutes=i * 5),
        ))


def _insert_event(event_data: dict, db: Session) -> bool:
    slug = event_data["slug"]
    if db.query(Event).filter(Event.slug == slug).first():
        return False

    closes_at = datetime.utcnow() + timedelta(hours=event_data.get("closes_hours", 24))

    event = Event(
        slug=slug,
        title=event_data["title"],
        title_pt=event_data.get("title_pt"),
        description=event_data.get("description"),
        description_pt=event_data.get("description_pt"),
        category=event_data.get("category", "general"),
        source=event_data.get("source", "Scenara"),
        status="open",
        is_featured=event_data.get("is_featured", False),
        closes_at=closes_at,
    )
    db.add(event)
    db.flush()

    scenarios_pt = event_data.get("scenarios_pt", event_data["scenarios"])
    for idx, ((title_en, prob), (title_pt, _)) in enumerate(
        zip(event_data["scenarios"], scenarios_pt)
    ):
        scenario = Scenario(
            event_id=event.id,
            title=title_en,
            title_pt=title_pt if hasattr(Scenario, "title_pt") else title_en,
            probability=float(prob),
            sort_order=idx,
            status="active",
        )
        db.add(scenario)
        db.flush()
        # Seed 8 hours of volatile history so charts look alive immediately
        _seed_history(db, scenario, points=96)
        _log_snapshot(db, scenario, source="created")

    return True


def _generate_crypto_events(prices: dict[str, float], db: Session) -> int:
    """Insert crypto price events from live CoinGecko data."""
    inserted = 0

    for coin_id, symbol in COINS.items():
        price = prices.get(coin_id)
        if price is None:
            continue

        # Event 1: above current price
        slug1 = _make_slug(f"{symbol}-above-{int(price)}-1h")
        e1 = {
            "slug": slug1,
            "title": f"Will {symbol} be above ${price:,.0f} in 1 hour?",
            "title_pt": f"O {symbol} vai ficar acima de ${price:,.0f} em 1 hora?",
            "description": f"{symbol} is trading at ${price:,.2f}. Will it close above this in the next hour?",
            "description_pt": f"{symbol} está negociando a ${price:,.2f}. Vai fechar acima disso na próxima hora?",
            "category": "crypto",
            "source": "CoinGecko",
            "is_featured": symbol == "BTC",
            "closes_hours": 1,
            "scenarios": [("Yes", 52), ("No", 48)],
            "scenarios_pt": [("Sim", 52), ("Não", 48)],
        }
        if _insert_event(e1, db):
            inserted += 1

        # Event 2: price range
        lower = round(price * 0.98, 0)
        upper = round(price * 1.02, 0)
        slug2 = _make_slug(f"{symbol}-range-{int(lower)}-{int(upper)}-1h")
        e2 = {
            "slug": slug2,
            "title": f"Will {symbol} stay between ${lower:,.0f}–${upper:,.0f} in 1 hour?",
            "title_pt": f"O {symbol} vai ficar entre ${lower:,.0f}–${upper:,.0f} em 1 hora?",
            "description": f"{symbol} is at ${price:,.2f}. Will it remain within ±2% over the next hour?",
            "description_pt": f"{symbol} está em ${price:,.2f}. Vai permanecer dentro de ±2% na próxima hora?",
            "category": "crypto",
            "source": "CoinGecko",
            "is_featured": False,
            "closes_hours": 1,
            "scenarios": [("Yes", 65), ("No", 35)],
            "scenarios_pt": [("Sim", 65), ("Não", 35)],
        }
        if _insert_event(e2, db):
            inserted += 1

    return inserted


def _snapshot_open_events(db: Session) -> int:
    """Nudge probabilities with crypto-chart-like volatility."""
    open_events = db.query(Event).filter(Event.status == "open").all()
    snapped = 0

    # Persistent trend state per event
    if not hasattr(_snapshot_open_events, "_trends"):
        _snapshot_open_events._trends = {}

    for event in open_events:
        scenarios = db.query(Scenario).filter(
            Scenario.event_id == event.id,
            Scenario.status == "active",
        ).all()
        if not scenarios:
            continue

        # Get or init trend for this event
        trend = _snapshot_open_events._trends.get(event.id, random.choice([-1, 1]))
        # Occasionally reverse trend
        if random.random() < 0.10:
            trend *= -1
        _snapshot_open_events._trends[event.id] = trend

        if len(scenarios) == 2:
            # Spike: 15% chance of big move
            if random.random() < 0.15:
                nudge = random.uniform(12, 24) * trend
            elif random.random() < 0.35:
                nudge = random.uniform(5, 11) * trend
            else:
                nudge = random.gauss(0, 4.5)

            s0, s1 = scenarios[0], scenarios[1]
            new_p0 = max(5.0, min(95.0, s0.probability + nudge))
            new_p1 = max(5.0, min(95.0, 100.0 - new_p0))
            s0.probability = round(new_p0, 1)
            s1.probability = round(new_p1, 1)
            _log_snapshot(db, s0, source="5min")
            _log_snapshot(db, s1, source="5min")
            snapped += 2
        else:
            for scenario in scenarios:
                if random.random() < 0.15:
                    nudge = random.uniform(8, 18) * trend
                elif random.random() < 0.35:
                    nudge = random.uniform(3, 8) * trend
                else:
                    nudge = random.gauss(0, 4.0)
                new_prob = max(3.0, min(97.0, scenario.probability + nudge))
                scenario.probability = round(new_prob, 1)
                _log_snapshot(db, scenario, source="5min")
                snapped += 1

    db.commit()
    return snapped


async def fetch_prices() -> dict[str, float]:
    import time
    global _eg_price_cache, _eg_price_cache_time
    now = time.time()
    if _eg_price_cache and (now - _eg_price_cache_time) < EG_PRICE_CACHE_TTL:
        return _eg_price_cache
    params = {"ids": ",".join(COINS.keys()), "vs_currencies": CURRENCY}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(COINGECKO_URL, params=params)
        response.raise_for_status()
        data = response.json()
    prices = {
        coin_id: float(data[coin_id][CURRENCY])
        for coin_id in COINS
        if coin_id in data and CURRENCY in data[coin_id]
    }
    _eg_price_cache = prices
    _eg_price_cache_time = time.time()
    return prices


async def run_snapshot() -> None:
    logger.info("[Snapshot] Running 5-min probability snapshot...")
    db: Session = SessionLocal()
    try:
        snapped = _snapshot_open_events(db)
        logger.info(f"[Snapshot] Logged {snapped} snapshots.")
    except Exception as e:
        logger.error(f"[Snapshot] Error: {e}")
        db.rollback()
    finally:
        db.close()


MAX_OPEN_EVENTS = 80       # hard cap on open markets at any time
MAX_STATIC_PER_RUN = 20   # add up to 20 new static events per hour
MIN_OPEN_EVENTS = 30      # if below this, fill aggressively


def _make_slug(key: str) -> str:
    """Slug includes a week number so same event can repeat weekly."""
    import hashlib
    from datetime import datetime
    week = datetime.utcnow().strftime("%Y-W%W")
    short_hash = hashlib.md5(f"{key}{week}".encode()).hexdigest()[:6]
    return f"{key[:80]}-{short_hash}"


def _expire_old_events(db: Session) -> int:
    """Mark expired events as void — don't resolve predictions, just close the market."""
    from datetime import datetime
    now = datetime.utcnow()
    expired = db.query(Event).filter(
        Event.status == "open",
        Event.closes_at < now,
    ).all()
    count = 0
    for event in expired:
        if event.source == "CoinGecko":
            continue  # auto_resolver handles crypto
        event.status = "resolved"
        event.resolution_note = "Mercado encerrado · Market closed"
        # Void all pending predictions — refund players
        try:
            predictions = db.query(Prediction).filter(
                Prediction.event_id == event.id,
                Prediction.status == "pending",
            ).all()
            for p in predictions:
                p.status = "void"
                p.pnl = 0.0
                account = db.query(Account).filter(Account.user_id == p.user_id).first()
                if account:
                    account.balance += p.simulated_amount
        except Exception:
            pass
        count += 1
    if count:
        db.commit()
    return count


async def run_event_generator() -> None:
    logger.info("[EventGenerator] Creating new events...")
    db: Session = SessionLocal()
    try:
        # Expire old events first
        expired = _expire_old_events(db)
        if expired:
            logger.info(f"[EventGenerator] Expired {expired} old events.")

        # Count current open non-crypto events
        open_count = db.query(Event).filter(
            Event.status == "open",
            Event.source != "CoinGecko",
        ).count()
        logger.info(f"[EventGenerator] {open_count} open static events (max {MAX_OPEN_EVENTS}).")

        slots_available = MAX_OPEN_EVENTS - open_count
        if slots_available > 0:
            # Emergency fill if critically low — use all available slots
            is_critical = open_count < 10
            to_add = slots_available if (open_count < MIN_OPEN_EVENTS or is_critical) else min(slots_available, MAX_STATIC_PER_RUN)
            selected = list(STATIC_EVENTS)
            random.shuffle(selected)
            static_count = 0
            for template in selected:
                if static_count >= to_add:
                    break
                event_data = {
                    "slug": _make_slug(template["slug_key"]),
                    "title": template["title"],
                    "title_pt": template.get("title_pt"),
                    "description": template.get("description"),
                    "description_pt": template.get("description_pt"),
                    "category": template["category"],
                    "source": "Scenara",
                    "is_featured": False,
                    "closes_hours": random.choice([72, 96, 120, 168]),  # 3-7 days
                    "scenarios": template["scenarios"],
                    "scenarios_pt": template.get("scenarios_pt", template["scenarios"]),
                }
                if _insert_event(event_data, db):
                    static_count += 1
            db.commit()
            logger.info(f"[EventGenerator] Inserted {static_count} static events.")
        else:
            logger.info(f"[EventGenerator] At capacity. Skipping.")

        # Always refresh crypto events
        try:
            prices = await fetch_prices()
            crypto_count = _generate_crypto_events(prices, db)
            db.commit()
            logger.info(f"[EventGenerator] Inserted {crypto_count} crypto events.")
        except Exception as e:
            logger.warning(f"[EventGenerator] Crypto fetch failed: {e}")

    except Exception as e:
        logger.error(f"[EventGenerator] Error: {e}")
        db.rollback()
    finally:
        db.close()


async def start_scheduler() -> None:
    """Snapshot every 5 min, create new events every 60 min.
    Also runs event generation immediately on startup."""
    # Run immediately on startup to fill markets
    logger.info("[Scheduler] Running initial event generation on startup...")
    await run_event_generator()

    snapshot_count = 0
    while True:
        await run_snapshot()
        snapshot_count += 1
        if snapshot_count % 12 == 0:  # every 12 * 5min = 60min
            await run_event_generator()
        logger.info("[Scheduler] Next snapshot in 5 minutes.")
        await asyncio.sleep(SNAPSHOT_INTERVAL_SECONDS)