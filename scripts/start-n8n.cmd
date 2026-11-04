@echo off
REM Sobe o n8n sem telemetria e sem as chamadas externas que poluem o log.
REM Use este arquivo no Agendador de Tarefas em vez de chamar o n8n direto.

REM telemetria de uso (RudderStack) - causa o erro ECONNRESET
set N8N_DIAGNOSTICS_ENABLED=false

REM aviso de nova versao - consulta api.n8n.io na inicializacao
set N8N_VERSION_NOTIFICATIONS_ENABLED=false

REM galeria de templates e catalogo de conectores - origem do timeout de 6000ms
set N8N_TEMPLATES_ENABLED=false
set N8N_PERSONALIZATION_ENABLED=false

REM fuso usado pelos agendamentos
set GENERIC_TIMEZONE=America/Sao_Paulo
set TZ=America/Sao_Paulo

echo Iniciando n8n em http://localhost:5678
n8n start
