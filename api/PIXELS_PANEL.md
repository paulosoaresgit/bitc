# BITC Mining — painel próprio para múltiplos pixels

Painel: **https://bitcmining.tech/admin/pixels/**, após deploy.
Branch: `fix/btcpay-server-pricing-checkout` (PR #2).

## Funcionalidade incluída

- Vários IDs Meta Pixel, Google Analytics 4 (G-...) e Google Ads (AW-...), com nome interno, ativar/desativar, adicionar e excluir até 50 IDs.
- Configuração guardada em `/opt/bitc/pixels/pixels.json` no VPS, fora do diretório público e dos arquivos GitHub. Persistência entre deploys.
- Login com senha forte e hash scrypt; cookie de sessão de curta duração `HttpOnly`, `Secure`, `SameSite=Strict`, validação de origem e limite de tentativas. **Nunca envie a senha ou o hash a outra pessoa ou ao chat.**
- `GET /api/tracking-config` expõe somente IDs ativados, que são públicos por natureza; não expõe senhas, tokens nem o JSON de administração.
- Script da loja só carrega os SDKs Meta/Google após o cliente escolher **Accept**; **Decline** mantém os SDKs desligados. O cliente pode alterar a preferência em **Cookie choices**.
- Os eventos de navegador são PageView, ViewContent, AddToCart e InitiateCheckout. Para GA4 usam respectivamente `page_view`, `view_item`, `add_to_cart` e `begin_checkout`. Google Ads usa o ID como tag base; é necessário configurar o **conversion label** da ação de conversão ao fazer a integração de Purchase.
- **Purchase não é enviado** por clique, geração de QR Code ou página de sucesso. A integração posterior exige webhook assinado de invoice liquidada e deduplicação por invoice ID e por provedor (Meta CAPI / Google Ads ou GA4 Measurement Protocol).

## Instalar no VPS sem alterar o BTCPay

Atenção: os comandos abaixo mudam **somente** a loja BITC; faça após os testes do GitHub, preservando `pay.bitcmining.tech`.

```bash
cd /opt/bitc/repo
git pull --ff-only origin fix/btcpay-server-pricing-checkout
bash deploy/hostinger/setup-pixel-panel.sh
export BTCPAY_PROXY_NETWORK=generated_default
export LETSENCRYPT_EMAIL="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' bitc-store-storefront-1 | sed -n 's/^LETSENCRYPT_EMAIL=//p')"
bash deploy/hostinger/publish.sh --publish
```

O script `setup-pixel-panel.sh` pergunta a senha duas vezes **sem mostrar o que você digita**, cria hash com salt e guarda apenas esse hash no arquivo privado `/etc/bitc/bitc.env`. Não há senha pré-definida nem API key pública. Para mudar a senha, execute o mesmo script novamente e recrie só a API da BITC.

A instalação do painel não altera as quatro chaves que protegem o pagamento. `salesEnabled` deve continuar `false` até o checkout ser validado e expressamente liberado.

## Testes read-only

```bash
curl -fsS https://bitcmining.tech/api/tracking-config | jq '{consentRequired,purchaseServerSideReady,activeIDs:(.pixels|length)}'
curl -fsS https://bitcmining.tech/api/health | jq '{ok,btcpayConfigured,orderEncryptionConfigured,salesEnabled}'
```

Sem cadastro, `activeIDs` será 0. O acesso `GET /api/admin/pixels` sem sessão autenticada deve retornar HTTP 401, **nunca** a lista privada.

## Limites e pendências

- Não configure IDs do pixel de outra loja: a implementação atual pode haver scripts legados no HTML capturado e requer auditoria de terceiros antes de campanhas.
- A loja ainda precisa publicar políticas reais de privacidade, consentimento/cookies e reembolso antes de campanhas com tracking. Não invente documentos ou empresas.
- Não há painel de vendas nem webhook BTCPay nesta entrega, e **o sistema não afirma registrar Purchase** até a integração de liquidação ser testada em produção.
- Não use Meta Conversion API access token, Google Measurement Protocol API secret ou a chave privada BTCPay em campos do painel. Eles devem ficar somente em variáveis privadas do servidor quando a integração de compras for concluída.
