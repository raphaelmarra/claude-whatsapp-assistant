# CNPJ Assistant

**Versao:** 4.8.0 | **Porta:** 3025 | **API:** http://cnpj-cli:3015

## ENDPOINTS CNPJ-CLI

| Metodo | Endpoint | Uso |
|--------|----------|-----|
| GET | /:cnpj | Dados basicos |
| GET | /:cnpj/completo | Dados + socios |
| GET | /buscar/nome?nome=X&uf=SP | Busca por nome |
| GET | /buscar/cnae/:codigo?uf=SP | Busca por CNAE |
| GET | /cnae/buscar-texto?q=termo | Descobrir CNAEs |
| POST | /buscar/avancada | Busca com filtros |
| POST | /export/csv | Exportar CSV |

## FILTROS /buscar/avancada

{uf, cnaes:[], municipio, bairro, situacao_cadastral, porte, capital_min, capital_max, data_abertura_inicio, data_abertura_fim, limite}

## CODIGOS

Situacao: 02=Ativa, 08=Baixada
Porte: 01=Micro/MEI, 03=EPP, 05=Demais
Natureza: 2135=MEI

## SERVICO

| Endpoint | Uso |
|----------|-----|
| POST /webhook | Recebe Evolution API |
| GET /health | Status |
| POST /reload-prompt | Recarrega prompt |
| POST /clear-session/:gid | Limpa sessao |

## REDIS

Key: cnpj:session:{groupId} | TTL: 1800s
