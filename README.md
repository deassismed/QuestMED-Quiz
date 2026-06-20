# QuestMED Quiz

Quiz medico em Next.js com salas do professor, entrada individual de alunos, escolha/criacao de UBS e placar em tempo real por aluno e por equipe.

## Stack

- Next.js App Router
- Supabase para persistencia e realtime
- Vercel para deploy

## Setup local

1. Crie um projeto no Supabase.
2. Execute `supabase/schema.sql` no SQL Editor do Supabase.
3. Copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PROFESSOR_PASSWORD`
4. Rode `npm install`.
5. Rode `npm run dev`.

## Deploy online na Vercel

1. Suba este projeto para um repositorio GitHub.
2. Na Vercel, importe o repositorio como projeto Next.js.
3. Em Environment Variables, configure:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PROFESSOR_PASSWORD`
4. No Supabase, execute todo o arquivo `supabase/schema.sql`.
5. Faca o deploy na Vercel.
6. Use as rotas:
   - Aluno: `https://seu-projeto.vercel.app/`
   - Professor: `https://seu-projeto.vercel.app/professor`
   - Placar: `https://seu-projeto.vercel.app/status/CODIGO`

Importante: `SUPABASE_SERVICE_ROLE_KEY` deve ficar somente nas variaveis da Vercel e no `.env.local`. Nao coloque essa chave no frontend, no GitHub ou em textos compartilhados.

## Fluxo

- Aluno: acessa `/`, informa codigo da sala, nickname e UBS.
- Professor: acessa `/professor`, informa a senha, cria uma sala e abre o painel administrativo.
- Placar publico: `/status/[codigo-da-sala]`.

## Pontuacao

- Cada questao tem 90 segundos.
- Resposta correta pode valer ate 10 pontos.
- A pontuacao diminui conforme o tempo passa.
- Resposta incorreta: 0 ponto.
- Tempo esgotado: 0 ponto.
- Pontuacao da UBS: media da pontuacao total dos alunos integrantes.
