# Navi — como publicar a app (sem Terminal)

A pasta tem tudo o que a Navi precisa para funcionar sozinha, fora do Claude:

| Ficheiro | Para que serve |
|---|---|
| `index.html` | A app (conversa com a Navi, resultados, filtros, calendário, favoritos) |
| `api/precos.js` | Vai buscar os preços à Travelpayouts (Aviasales) com o seu código de afiliado |
| `api/agente.js` | O agente Navi: testa aeroportos vizinhos, datas e bilhetes separados (usa a API da Anthropic) |
| `api/interpretar.js` | Percebe frases como "Cascavel para Lisboa em dezembro, 6 semanas" |
| `api/vizinhos.js` | Sugere aeroportos próximos |
| `manifest.webmanifest`, `sw.js`, `icons/` | Tornam a Navi instalável no telemóvel, com ícone e ecrã inteiro |

As chaves secretas **nunca** ficam no código: são postas no Vercel (passo 3).

---

## 1. Criar as contas (uma vez)

1. **Travelpayouts** (grátis): crie conta em travelpayouts.com e adira ao programa **Aviasales**.
   - Em *Perfil → API token*, copie o **token**.
   - Copie também o seu **marker** (o número de parceiro). É ele que regista as suas comissões.
2. **Anthropic** (paga por utilização): em console.anthropic.com, crie uma **API key** e carregue algum crédito.
   - Defina um limite mensal de gastos na consola, para não ter surpresas.
3. **GitHub** (grátis): já tem (`jonasdasilva281-stack`).
4. **Vercel**: entre em vercel.com com a conta GitHub.
   - Atenção: o plano gratuito (Hobby) é só para uso não comercial. Para vender a Navi, use o plano **Pro**.

## 2. Carregar a pasta no GitHub

1. No GitHub, carregue em **New repository**, dê o nome `navi` e crie.
2. Na página do repositório vazio, carregue em **uploading an existing file**.
3. Descompacte o `navi-app.zip` no Mac, abra a pasta e **arraste todo o conteúdo** (ficheiros e pastas `api` e `icons`) para a página. Use o Chrome para manter as pastas.
4. Carregue em **Commit changes**.

## 3. Publicar no Vercel

1. No Vercel: **Add New → Project** e escolha o repositório `navi`. Carregue em **Import**.
2. Em **Environment Variables**, adicione:

| Nome | Valor |
|---|---|
| `TRAVELPAYOUTS_TOKEN` | o token da Travelpayouts |
| `TRAVELPAYOUTS_MARKER` | o seu marker de parceiro |
| `ANTHROPIC_API_KEY` | a chave da Anthropic |
| `TRAVELPAYOUTS_MARKET` | opcional: `br` para clientes no Brasil, `pt` para Portugal |
| `ANTHROPIC_MODEL` | opcional: modelo do agente (por defeito `claude-sonnet-5-5`) |

3. Carregue em **Deploy**. Ao fim de um minuto fica com um endereço do tipo `navi-xxxx.vercel.app`.

## 4. Domínio próprio (opcional)

Compre o domínio (por exemplo num registador .pt ou .com.br). Depois, no Vercel, vá a **Settings → Domains**, escreva o domínio e siga as instruções para o ligar.

## 5. Instalar no telemóvel

- **iPhone (Safari):** abra o endereço da Navi, toque em **Partilhar** e depois em **Adicionar ao ecrã principal**.
- **Android (Chrome):** abra o endereço da Navi, toque no menu ⋮ e depois em **Instalar app**.

Fica o ícone da Navi no ecrã, e a app abre em ecrã inteiro como uma app normal.

## 6. Atualizar a app no futuro

Substitua o ficheiro no GitHub (botão **Add file → Upload files**) e faça *Commit*. O Vercel publica sozinho a nova versão.

---

## O que é diferente da versão dentro do Claude

- **Origem dos preços:** a Travelpayouts entrega os preços das pesquisas feitas na Aviasales nas **últimas 48 horas**. A app avisa que o preço final se confirma no site de compra.
- **Bagagem:** a API não diz se a mala está incluída. A app mostra "Bagagem: confirme no site".
- **Preço para várias pessoas:** a API dá o preço por adulto. A app multiplica pelo número de passageiros e chama-lhe "total estimado". As crianças podem pagar menos.
- **Escalas:** não se sabe a cidade da escala, só o número de escalas.
- **Alertas por email:** ficam para a fase 2, com Supabase e um serviço de email. Nesta versão estão escondidos. Os favoritos funcionam e ficam guardados no telemóvel do cliente.
- **Bilhetes para mais longe com paragem no destino:** vêm desligados, porque esta fonte não mostra por onde o voo passa.

## Custos aproximados

- **Travelpayouts:** grátis. Ganha uma comissão por cada reserva feita através dos seus links.
- **Anthropic:** paga por utilização. Cada conversa com o agente custa cêntimos. Ponha um limite de gastos na consola.
- **Vercel:** Pro, por utilizador e por mês, para uso comercial (confirme o preço atual em vercel.com/pricing).
- **Domínio:** o preço anual do registador.
