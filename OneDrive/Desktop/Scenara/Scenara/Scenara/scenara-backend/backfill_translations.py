import sys
sys.path.insert(0, '.')
from app.db import engine
from sqlalchemy import text

FULL_TITLES = {
    'Will a Brazilian club win the 2026 Copa Libertadores?': 'Um clube brasileiro vai vencer a Copa Libertadores 2026?',
    'Will China conduct military exercises near Taiwan this quarter?': 'A China vai realizar exercícios militares perto de Taiwan neste trimestre?',
    'Will the Ibovespa close above 130,000 points by end of month?': 'O Ibovespa vai fechar acima de 130.000 pontos até o fim do mês?',
    'Will the STF issue a major ruling on social media regulation this week?': 'O STF vai emitir uma decisão importante sobre regulação de redes sociais esta semana?',
    'Will Brazil win the 2026 FIFA World Cup?': 'O Brasil vai vencer a Copa do Mundo FIFA 2026?',
    'Will Lula announce his 2026 re-election bid before June?': 'Lula vai anunciar sua candidatura à reeleição em 2026 antes de junho?',
    "Will Brazil's BACEN cut the Selic rate at the next COPOM meeting?": 'O BACEN vai cortar a Selic na próxima reunião do COPOM?',
    'Will USD/BRL close above R$6.00 this week?': 'O USD/BRL vai fechar acima de R$6,00 esta semana?',
    "Will Brazil's IPCA inflation stay below 5% this year?": 'A inflação IPCA do Brasil vai ficar abaixo de 5% este ano?',
    "Will Brazil's GDP grow more than 2% in 2026?": 'O PIB do Brasil vai crescer mais de 2% em 2026?',
    'Will Verstappen win the next Formula 1 Grand Prix?': 'Verstappen vai vencer o próximo Grande Prêmio de Fórmula 1?',
    'Will Flamengo reach the Copa do Brasil final this year?': 'O Flamengo vai chegar à final da Copa do Brasil este ano?',
    'Will the Lakers make the NBA playoffs this season?': 'O Lakers vai classificar para os playoffs da NBA nesta temporada?',
    'Will OpenAI release GPT-5 before July 2026?': 'A OpenAI vai lançar o GPT-5 antes de julho de 2026?',
    'Will Tesla launch its robotaxi service in a major city by end of 2026?': 'A Tesla vai lançar seu serviço de robotáxi em uma grande cidade até o fim de 2026?',
    "Will Apple's AI features overtake Google Assistant in usage by Q3 2026?": 'Os recursos de IA da Apple vão superar o Google Assistant em uso até o 3T de 2026?',
    'Will 5G cover 80% of Brazilian cities by end of 2026?': 'O 5G vai cobrir 80% das cidades brasileiras até o fim de 2026?',
    'Will there be a formal ceasefire in Ukraine before July 2026?': 'Haverá um cessar-fogo formal na Ucrânia antes de julho de 2026?',
    'Will Trump impose new tariffs on Brazilian exports in 2026?': 'Trump vai impor novas tarifas sobre as exportações brasileiras em 2026?',
    'Will the US Federal Reserve cut rates at the June 2026 meeting?': 'O Federal Reserve dos EUA vai cortar os juros na reunião de junho de 2026?',
    'Will BRICS admit a new member nation in 2026?': 'O BRICS vai admitir um novo país membro em 2026?',
    'Will Bolsonaro remain ineligible for the 2026 election?': 'Bolsonaro vai continuar inelegível para a eleição de 2026?',
    'Will the Brazilian Congress pass a new fiscal PEC this month?': 'O Congresso brasileiro vai aprovar uma nova PEC fiscal este mês?',
    'Will Palmeiras win the 2026 Brasileirão?': 'O Palmeiras vai vencer o Brasileirão 2026?',
    'Will Neymar play in a Brazilian club in 2026?': 'Neymar vai jogar em um clube brasileiro em 2026?',
    'Will Vasco be relegated from Serie A in 2026?': 'O Vasco vai ser rebaixado da Série A em 2026?',
    'Will Brazil top their group at the 2026 World Cup?': 'O Brasil vai terminar em primeiro no grupo na Copa do Mundo 2026?',
    'Will a Brazilian fighter win a UFC title this year?': 'Um lutador brasileiro vai conquistar um cinturão do UFC este ano?',
    'Will Petrobras pay a special dividend in Q2 2026?': 'A Petrobras vai pagar dividendo extraordinário no 2T de 2026?',
    "Will Vale's stock close above R$70 by end of month?": 'As ações da Vale vão fechar acima de R$70 até o fim do mês?',
    "Will Brazil's unemployment fall below 6% in 2026?": 'O desemprego no Brasil vai cair abaixo de 6% em 2026?',
    'Will Nubank reach 120 million customers in 2026?': 'O Nubank vai atingir 120 milhões de clientes em 2026?',
    'Will Meta launch consumer AR glasses in 2026?': 'A Meta vai lançar óculos de realidade aumentada para o consumidor em 2026?',
    'Will Bitcoin reach $100,000 before the end of 2026?': 'O Bitcoin vai chegar a $100.000 antes do fim de 2026?',
    'Will Ethereum ETF inflows exceed $1B in a single week in 2026?': 'Os ETFs de Ethereum vão ter entradas acima de $1 bilhão em uma semana em 2026?',
    'Will Nvidia stock hit a new all-time high in Q2 2026?': 'As ações da Nvidia vão atingir nova máxima histórica no 2T de 2026?',
    'Will X (Twitter) turn profitable in 2026?': 'O X (Twitter) vai se tornar lucrativo em 2026?',
    'Will Iran reach a new nuclear agreement in 2026?': 'O Irã vai alcançar um novo acordo nuclear em 2026?',
    "Will India overtake Japan as the world's 3rd largest economy in 2026?": 'A Índia vai superar o Japão como a 3ª maior economia do mundo em 2026?',
    'Will the EU begin enforcing its AI Act in 2026?': 'A UE vai começar a aplicar sua Lei de IA em 2026?',
    'Will OPEC+ announce a production cut in H1 2026?': 'A OPEP+ vai anunciar um corte de produção no 1S de 2026?',
    'Will Lula reshuffle his cabinet before mid-2026?': 'Lula vai reformar o ministério antes de meados de 2026?',
    'Will Amazon deforestation fall below 5,000 km² in 2026?': 'O desmatamento da Amazônia vai cair abaixo de 5.000 km² em 2026?',
    'Will Brazil launch international Pix transfers in 2026?': 'O Brasil vai lançar transferências internacionais via Pix em 2026?',
    'Will Embraer deliver a record number of aircraft in 2026?': 'A Embraer vai entregar um número recorde de aeronaves em 2026?',
    "Will Brazil's unemployment fall below 6% in 2026?": 'O desemprego no Brasil vai cair abaixo de 6% em 2026?',
}

SCENARIO_MAP = {
    'Yes': 'Sim',
    'No': 'Não',
    'Yes — passes': 'Sim — aprovada',
    'No — delayed': 'Não — adiada',
    'Yes — before June': 'Sim — antes de junho',
    'No — after June': 'Não — depois de junho',
    'Yes — stays ineligible': 'Sim — continua inelegível',
    'No — overturned': 'Não — revertida',
    'Cut — below current': 'Cortar',
    'Hold': 'Manter',
    'Hike': 'Aumentar',
    'Yes — above R$6.00': 'Sim — acima de R$6,00',
    'No — stays below': 'Não — fica abaixo',
    'Yes — under 5%': 'Sim — abaixo de 5%',
    'No — above 5%': 'Não — acima de 5%',
    'Yes — above 2%': 'Sim — acima de 2%',
    'No — 2% or less': 'Não — 2% ou menos',
    'Yes — Verstappen wins': 'Sim — Verstappen vence',
    'No — another driver': 'Não — outro piloto',
    'Yes — playoffs': 'Sim — playoffs',
    'No — miss out': 'Não — eliminado',
    'Yes — Brazil wins': 'Sim — Brasil campeão',
    'No — another country': 'Não — outro país',
    'Yes — Brazilian club': 'Sim — clube brasileiro',
    'No — Argentine/other': 'Não — argentino/outro',
    'Yes — before July': 'Sim — antes de julho',
    'No — July or later': 'Não — julho ou depois',
    'Yes — ceasefire by July': 'Sim — cessar-fogo até julho',
    'No — conflict continues': 'Não — conflito continua',
    'Yes — new tariffs': 'Sim — novas tarifas',
    'No — exempt': 'Não — isento',
    'Yes — cut in June': 'Sim — corte em junho',
    'No — hold or hike': 'Não — manter ou subir',
    'Yes — 80%+': 'Sim — 80%+',
    'No — below 80%': 'Não — abaixo de 80%',
    'Yes — relegated': 'Sim — rebaixado',
    'No — stays up': 'Não — fica na Série A',
    'Yes — above': 'Sim — acima',
    'No — below or equal': 'Não — abaixo',
    'Yes — stays in range': 'Sim — fica na faixa',
    'No — breaks out': 'Não — sai da faixa',
}

with engine.connect() as conn:
    events = conn.execute(text('SELECT id, title FROM events')).fetchall()
    updated_e = 0
    for eid, title in events:
        pt = FULL_TITLES.get(title)
        if pt:
            conn.execute(text('UPDATE events SET title_pt = :pt WHERE id = :id'), {'pt': pt, 'id': eid})
            updated_e += 1

    scenarios = conn.execute(text('SELECT id, title FROM scenarios')).fetchall()
    updated_s = 0
    for sid, title in scenarios:
        pt = SCENARIO_MAP.get(title)
        if pt:
            conn.execute(text('UPDATE scenarios SET title_pt = :pt WHERE id = :id'), {'pt': pt, 'id': sid})
            updated_s += 1

    conn.commit()
    print(f'✓ Updated {updated_e} event titles, {updated_s} scenario titles')