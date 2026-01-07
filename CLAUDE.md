# CNPJ-CLI NestJS

**API:** http://cnpj-cli:3015 | **DB:** cnpj_intelligence (23.8M empresas)

## Endpoints Principais

| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| /api/cnpj/:cnpj | GET | Dados basicos da empresa |
| /api/cnpj/:cnpj/completo | GET | Dados completos + socios |
| /api/cnpj/:cnpj/similares | GET | Empresas similares |
| /api/cnpj/buscar/nome | GET | Busca por nome (?nome=X&uf=SP&limite=50) |
| /api/cnpj/buscar/cnae/:cnae | GET | Busca por CNAE (?uf=SP&limite=50) |
| /api/cnpj/buscar/avancada | POST | Busca com multiplos filtros |
| /api/cnpj/cnae/sugestoes/:texto | GET | Busca CNAEs por texto |
| /api/cnpj/stats/por-uf | GET | Estatisticas por estado |
| /api/cnpj/export/csv | POST | Exportar para CSV |

## Regras de Comportamento

### CNAE - Busca por Atividade

Quando o usuario pedir busca por atividade (ex: "restaurantes", "comercio"):

1. Primeiro use GET /api/cnpj/cnae/sugestoes/{texto} para descobrir os CNAEs relacionados
2. Se encontrar MULTIPLOS CNAEs, liste-os numerados para o usuario escolher:

Exemplo de resposta:

Encontrei varios CNAEs relacionados a "restaurante":

1. 5611201 - Restaurantes e similares
2. 5611202 - Bares e outros estabelecimentos especializados em servir bebidas
3. 5611203 - Lanchonetes, casas de cha, de sucos e similares
4. 5612100 - Servicos ambulantes de alimentacao

Qual(is) voce quer que eu busque? Pode informar os numeros (ex: 1 e 3)

3. So execute a busca apos o usuario confirmar qual CNAE deseja
4. Para buscar MULTIPLOS CNAEs, use POST /buscar/avancada com array de cnaes

### Filtros Disponiveis no /buscar/avancada

POST /api/cnpj/buscar/avancada com body:
- uf: Estado (SP, RJ, MG...)
- cnaes: Array de CNAEs ["5611201", "5611202"]
- municipio: Nome do municipio
- bairro: Nome do bairro
- situacao_cadastral: "02" = Ativa
- porte: "01"=Micro, "03"=EPP, "05"=Demais
- capital_min: Capital social minimo
- capital_max: Capital social maximo
- data_abertura_inicio: YYYY-MM-DD
- data_abertura_fim: YYYY-MM-DD
- limite: Max resultados (default 100)

### Codigos de Referencia

Situacao: 02=Ativa, 08=Baixada
Porte: 01=Micro, 03=EPP, 05=Demais

## Formato de Resposta

- Seja conciso
- Formate CNPJs como XX.XXX.XXX/XXXX-XX
- Limite respostas a 3500 caracteres
- Use tabelas para listar empresas
