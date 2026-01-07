# CNPJ Assistant

**Versao:** 4.9.0 | **Porta:** 3025 | **API:** http://cnpj-cli:3015/api/cnpj

## COMO USAR A API

### BUSCAR EMPRESA ESPECIFICA
GET /:cnpj → dados basicos
GET /:cnpj/completo → dados + socios + regime
GET /:cnpj/socios → apenas socios
GET /:cnpj/filiais → todas as filiais
GET /:cnpj/regime → simples nacional / mei

Exemplo: curl http://cnpj-cli:3015/api/cnpj/00000000000191/completo

### DESCOBRIR CNAE
GET /cnae/buscar-texto?texto=restaurante&limite=20

Exemplo: curl "http://cnpj-cli:3015/api/cnpj/cnae/buscar-texto?texto=comercio+embalagens"

### PROSPECTAR (BUSCA AVANCADA)
POST /buscar/avancada
Body JSON:
{
  "uf": "SP",
  "cnaes": ["4742300"],
  "municipio": "SAO PAULO",
  "situacao_cadastral": "02",
  "natureza_juridica": "2062",
  "porte": "03",
  "capital_min": 10000,
  "data_abertura_inicio": "2024-01-01",
  "limite": 100
}

Campos disponiveis:
- uf: sigla estado (SP, RJ, MG, etc)
- cnaes: array de codigos CNAE (max 10)
- cnae: codigo CNAE unico
- municipio: nome do municipio (MAIUSCULO)
- bairro: nome do bairro
- cep: 8 digitos
- situacao_cadastral: 01=Nula, 02=Ativa, 03=Suspensa, 04=Inapta, 08=Baixada
- porte: 00=Nao informado, 01=Micro, 03=EPP, 05=Demais
- natureza_juridica: 2135=MEI, 2062=LTDA, 2046=SA
- razao_social: busca parcial (ILIKE)
- nome_fantasia: busca parcial (ILIKE)
- capital_min, capital_max: faixa de capital social
- data_abertura_inicio, data_abertura_fim: formato YYYY-MM-DD
- limite: 1-1000 (default 100)
- offset: para paginacao
- ordenar_por: razao_social | capital_social | data_inicio_atividade
- ordem: ASC | DESC

### CONTAR ANTES DE BUSCAR
POST /contar/filtrado
Body: {uf, municipio, cnae, porte, natureza, situacao}

Exemplo: curl -X POST http://cnpj-cli:3015/api/cnpj/contar/filtrado -H "Content-Type: application/json" -d '{"uf":"SP","cnae":"4742300"}'

### EMPRESAS NOVAS
GET /filtrar/novas/:dias?uf=SP&cnae=4742300&limite=100
GET /filtrar/abertas-desde/2024-01-01?uf=SP&limite=100
GET /filtrar/abertas-periodo?inicio=2024-01-01&fim=2024-12-31&uf=SP

### FILTRAR POR REGIME TRIBUTARIO
GET /filtrar/simples-nacional?uf=SP&cnae=4742300&limite=100
GET /filtrar/mei?uf=SP&cnae=4742300&limite=100

### BUSCAR POR NOME/SOCIO
GET /buscar/nome?nome=AYUMI&uf=SP&limite=50
GET /buscar/socio?nome=JOAO SILVA&uf=SP&limite=50

### BUSCAR POR LOCALIZACAO
GET /buscar/cep/:cep?limite=100
GET /buscar/municipio/:codigo_ibge?limite=100
GET /buscar/bairro?bairro=CENTRO&municipio=3550308&limite=100

### BUSCAR POR CLASSIFICACAO
GET /buscar/natureza/:codigo?uf=SP&limite=100
GET /buscar/porte/:porte?uf=SP&limite=100
GET /buscar/situacao/:codigo?uf=SP&limite=100
GET /buscar/cnae/:cnae?uf=SP&limite=100

### ESTATISTICAS
GET /stats/por-uf → distribuicao por estado
GET /stats/por-cnae → distribuicao por atividade
GET /stats/por-porte → distribuicao por tamanho
GET /stats/por-natureza → distribuicao por tipo juridico
GET /stats/por-municipio?uf=SP → por cidade
GET /stats/capital-medio/:cnae?uf=SP → capital medio do setor
GET /stats/crescimento/:cnae → tendencia de aberturas
GET /stats/abertas-por-mes/:ano → aberturas mensais

### SOCIOS E RELACIONAMENTOS
GET /:cnpj/socios → socios de uma empresa
GET /socios/buscar?nome=JOAO&limite=50 → buscar socio por nome
GET /socios/cpf/:cpf → empresas de um CPF
GET /socios/participacoes/:cpf → todas participacoes
GET /socios/rede/:cnpj → rede societaria
GET /socios/empresas-comuns?cnpj1=X&cnpj2=Y → socios em comum
GET /socios/qualificacao/:codigo?uf=SP → por cargo (49=socio-admin)

### EMPRESAS SIMILARES
GET /:cnpj/similares?limite=20 → empresas do mesmo segmento

### VALIDACOES
GET /validar/cnpj/:cnpj → valida formato e digito
GET /validar/cpf/:cpf → valida CPF
GET /validar/email/:email → valida email
GET /validar/telefone/:tel → valida telefone BR
GET /validar/cep/:cep → valida e busca endereco

### GEOLOCALIZACAO (quando relevante)
POST /geo/raio → empresas em raio de lat/lng
POST /geo/bounding-box → empresas em area retangular
GET /geo/coordenadas/:cnpj → lat/lng de empresa
GET /geo/vizinhos/:cnpj → empresas proximas
GET /geo/concorrentes/:cnpj → concorrentes proximos

## EXCLUIR MEI CORRETAMENTE

ERRADO: porte != "01" (exclui ME + MEI junto)
CERTO: natureza_juridica != "2135" (exclui so MEI)

Para buscar apenas LTDA: natureza_juridica = "2062"
Para buscar apenas SA: natureza_juridica = "2046"

## CODIGOS DE REFERENCIA

Situacao cadastral:
- 01 = Nula
- 02 = Ativa
- 03 = Suspensa
- 04 = Inapta
- 08 = Baixada

Porte:
- 00 = Nao informado
- 01 = Micro Empresa (inclui ME e MEI)
- 03 = Empresa de Pequeno Porte (EPP)
- 05 = Demais

Natureza juridica (principais):
- 2135 = Empresario Individual (MEI)
- 2062 = Sociedade Empresaria Limitada (LTDA)
- 2046 = Sociedade Anonima (SA)
- 2054 = Sociedade Simples Limitada

Qualificacao socio:
- 49 = Socio-Administrador
- 22 = Socio
- 05 = Administrador

## SERVICO

POST /webhook → recebe mensagens Evolution API
GET /health → status do servico
POST /reload-prompt → recarrega prompt sem restart
POST /clear-session/:gid → limpa sessao de um grupo

## REDIS

Key: cnpj:session:{groupId} | TTL: 1800s
