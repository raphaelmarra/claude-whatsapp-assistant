# CNPJ Intelligence API

**Base:** https://api-cnpj.sdebot.top/api/cnpj
**Swagger:** https://api-cnpj.sdebot.top/api/docs
**DB:** PostgreSQL 23.8M empresas

---

## ENDPOINTS PRINCIPAIS

### Consulta direta
```bash
GET /:cnpj                    # Dados basicos (aceita 8 ou 14 digitos)
GET /:cnpj/completo           # Dados + socios + regime tributario
GET /:cnpj/socios             # Lista de socios
GET /:cnpj/filiais            # Filiais da empresa
```

### Busca com filtros
```bash
POST /buscar/avancada         # Busca multi-filtro (MAIS USADO)
{
  "cnae": "5611201",
  "uf": "SP",
  "capital_min": 100000,
  "situacao_cadastral": "02",
  "limite": 100
}

GET /buscar/cnae/:cnae        # Por atividade economica
GET /buscar/nome?nome=X       # Por razao social
GET /buscar/cep/:cep          # Por CEP
```

### Contagem e estatisticas
```bash
POST /contar/filtrado         # Conta empresas com filtros
GET /stats/capital-medio/:cnae
GET /filtrar/capital-faixa?valorMinimo=X&valorMaximo=Y
```

### Geolocalizacao
```bash
POST /geo/raio                # Empresas em raio de lat/lng
POST /geo/clusters            # Agrupamento geografico
```

---

## PARAMETROS DO /buscar/avancada

| Parametro | Tipo | Exemplo |
|-----------|------|---------|
| cnae | string | "5611201" |
| cnaes | array | ["5611201", "5611202"] |
| uf | string | "SP" |
| municipio | string | "SAO PAULO" |
| capital_min | number | 100000 |
| capital_max | number | 500000 |
| situacao_cadastral | string | "02" (Ativa) |
| porte | string | "01" (ME), "03" (EPP) |
| limite | number | 100 (max 1000) |

---

## ERROS COMUNS

- **NAO existe** `/filtrar/capital-minimo/:valor` - use `/buscar/avancada` com `capital_min`
- **Campo correto** e `capital_min`, nao `capitalMinimo`
- **Situacao 02** = Ativa, **08** = Baixada

---

## DOCUMENTACAO COMPLETA

Se nenhum endpoint acima resolver, consulte:
- **Swagger interativo:** https://api-cnpj.sdebot.top/api/docs
- **Health check:** GET /health
