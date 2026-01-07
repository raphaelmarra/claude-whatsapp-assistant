# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.7.0] - 2026-01-07

### Fixed
- Reply detection corrigido para Evolution API v2.3+ (LID FIX)
- Deduplicacao movida para DEPOIS de shouldProcessMessage() (ordem correta)
- contextInfo extraido de data.contextInfo (path correto Evolution v2)
- Comparacao LID usa match exato (seguro)

### Changed
- Rollback do modelo Sonnet para default (compatibilidade CLI)

## [4.6.0] - 2026-01-06

### Added
- Deduplicacao por messageId (fix resposta duplicada)

## [4.5.0] - 2026-01-05

### Added
- Reply detection para Evolution API v2.3+ usando LID

## [4.3.0] - 2026-01-03

### Fixed
- Session locks para evitar race condition
- UUID validation para session IDs
- Timeout handling com SIGKILL fallback

### Added
- Timeout 180s + rate limit 5 req/min (Tier 2)

## [4.0.0] - 2026-01-02

### Added
- Claude CLI com memoria via Redis --resume
- Auto-detect and send CSV files via WhatsApp
- Documentacao completa para replicacao

---

**Gerado automaticamente por /release**
