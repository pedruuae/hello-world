# Meu Corredor

Aplicativo pessoal de reposição, em português do Brasil, no projeto Lovable conectado a `pedruuae/hello-world`.

## Usar

1. Abra a versão publicada em HTTPS com internet.
2. Aguarde **Pronto para usar offline**. O aviso só aparece depois de o service worker verificar todos os arquivos do build e a página inicial no Cache Storage.
3. No menu do Chrome, escolha **Instalar app** ou **Adicionar à tela inicial**. Se disponível, também há um botão no menu do app.
4. Antes de usar no trabalho, feche o app e teste em modo avião.

Adicione nomes e quantidades em **Minha carga**. “Pra abrir” sempre significa fardos. “Peguei parte” edita o total absoluto coletado. “Não tem / Aguardar restante” move apenas o saldo, em uma única transação. **Finalizar carga** é para depois da reposição: exige confirmação e oferece mover o saldo pendente. Favoritos e nomes ficam em **Meus produtos**.

## Dados e segurança contra perda

- IndexedDB `meu-corredor`, versão 1; store `data`, chave `state`.
- Todas as alterações fazem leitura e escrita em uma única transação. A interface só confirma depois de `transaction.oncomplete`.
- Revisões impedem uma aba de sobrescrever silenciosamente uma edição feita em outra. Formulários antigos exigem reabertura.
- Remoção, coleta, transferências e finalização podem ser desfeitas até a próxima alteração. Desfazer também passa pela transação e pela verificação de revisão.
- Um formulário ainda não salvo exibe confirmação ao voltar e aviso de saída quando o navegador permitir. Digitação ainda não salva não é um registro persistido: use **Salvar produto**.
- Exportação JSON e importação validada estão no menu. A restauração só substitui dados após confirmação e não altera o banco caso falhe.
- `navigator.storage.persist()` é solicitado após a primeira gravação da sessão e pode ser solicitado no menu. A recusa não bloqueia o uso.
- Limpar dados do site, remoção de armazenamento pelo navegador ou perder o aparelho pode apagar listas. Faça backups.
- Não há login, API, Supabase, CDN, fontes externas ou serviços necessários para o fluxo principal.

## PWA e atualizações

`scripts/pwa-plugin.ts` enumera os JS/CSS reais de produção e gera `sw.js`. A instalação só conclui se `cache.addAll` armazenar todos os recursos essenciais e a página inicial. Documento e assets são servidos da mesma versão do cache. Atualizações aguardam o fechamento de todas as abas; não há `skipWaiting`, recarga forçada ou exclusão do IndexedDB. O cache antigo é removido apenas na ativação da nova versão. Se algum recurso faltar, o app não deve afirmar prontidão offline.

O preparo offline é ativado **somente em builds de produção**. O dev server não prova funcionamento offline. HTTPS é obrigatório em produção (localhost é uma exceção para testes).

## Compatibilidade e desempenho

A base existente React/TanStack do Lovable foi mantida, sem novas dependências de produção. O app usa CSS simples com cores sRGB, fontes locais do sistema, ícones SVG, componentes nativos e apenas a área selecionada. A compilação mira Chrome 90. É uma referência mínima de sintaxe, não uma certificação de todos os navegadores ou aparelhos. É necessário JavaScript e IndexedDB; offline também exige service worker, Cache Storage e contexto seguro. O navegador deve ter espaço disponível.

Galaxy J7: versão Android/Chrome e desempenho físico ainda precisam ser conferidos. O teclado real do aparelho e a instalação em Android não são reproduzidos completamente por uma viewport de desktop. Sem garantia para Android/Chrome antigos. O layout funciona em 320 e 360 px; formulários ficam no fluxo normal, sem rodapé fixo cobrindo campos.

## Desenvolvimento e verificação

```sh
npm install
npm run dev
npx tsc --noEmit
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

O projeto também preserva o lockfile Bun original. Não é necessário alterar o backend.

`src/features/corredor/model.test.ts` cobre conservação de quantidades, coleta absoluta, transferência/retorno de saldo, validações e backup. `scripts/browser-test.cjs` testa o build de produção com Playwright instalado separadamente (não entra no bundle do app):

```sh
NODE_PATH=/caminho/para/node_modules node scripts/browser-test.cjs
```

Variáveis opcionais: `APP_URL`, `CHROME_EXECUTABLE`, `CHROME_ARGS` (array JSON), `SCREENSHOT_DIR`. O teste usa um contexto vazio, aguarda o cache, testa operações, desativa a rede de verdade via Playwright, recarrega e fecha/reabre a aba; também exporta/restaura JSON e verifica larguras pequenas. Não aponte os testes para um perfil pessoal: eles criam e removem dados de teste no contexto isolado.

## Verificação desta entrega — 08/10/2026

- Build de produção e TypeScript: passaram.
- Vitest: 8 testes passaram (inclui o roteamento original).
- ESLint: nenhum erro; 6 avisos preexistentes nos componentes UI não utilizados.
- Chromium automatizado, usando o worker e os arquivos compilados de produção: cadastro, edição, remoção/desfazer, duplicatas, coleta parcial/correção, transferência de saldo, retorno de pendências, finalização, pesquisa sem acentos, favoritos e renomeação passaram.
- Rede desativada no navegador: recarga, nova aba e operações locais passaram. Fechar o navegador inteiro e reiniciar com o mesmo perfil offline também preservou o app e os dados. Exportação, rejeição de backup inválido e restauração confirmada também passaram offline.
- Falha de escrita IndexedDB simulada: erro visível, dados anteriores preservados e formulário mantido; nenhum sucesso falso.
- Viewports 320 e 360 px: sem rolagem horizontal. A navegação ocupa uma faixa própria e não cobre a lista. A viewport reduzida para 320 × 310 permitiu rolar até Salvar.
- Não validado: Galaxy J7 físico, versão real do Chrome/Android, teclado virtual real, instalação Android e hospedagem publicada do Lovable. Os testes foram do build de produção servido localmente, não do editor/preview de desenvolvimento.
