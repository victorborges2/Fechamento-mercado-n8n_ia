# Cria uma tarefa no Agendador do Windows que executa o workflow de fechamento
# todo dia util, no horario escolhido.
#
# Nao execute este arquivo direto: use o agendar-fechamento.cmd ao lado, que
# contorna a politica de execucao de scripts do PowerShell.

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '  FECHAMENTO DE MERCADO - agendador' -ForegroundColor Cyan
Write-Host '  ---------------------------------'
Write-Host ''

# ---------- 1. localizar o n8n ----------
$n8n = (Get-Command n8n -ErrorAction SilentlyContinue).Source
if (-not $n8n) { $n8n = Join-Path $env:APPDATA 'npm\n8n.cmd' }
if (-not (Test-Path $n8n)) {
  Write-Host '  n8n nao encontrado.' -ForegroundColor Red
  Write-Host '  Instale antes com:  npm install -g n8n'
  Write-Host '  (use o Prompt de Comando, nao o PowerShell)'
  Read-Host '  Enter para sair'; exit 1
}
Write-Host "  n8n encontrado em: $n8n" -ForegroundColor DarkGray

# ---------- 2. id do workflow ----------
Write-Host ''
Write-Host '  Abra o workflow no n8n. O endereco fica assim:'
Write-Host '    http://localhost:5678/workflow/AbCdEf123456' -ForegroundColor DarkGray
Write-Host '  O trecho final e o ID.'
Write-Host ''
$id = (Read-Host '  ID do workflow').Trim()
if ([string]::IsNullOrWhiteSpace($id)) { Write-Host '  ID vazio. Cancelado.' -ForegroundColor Red; Read-Host; exit 1 }

# ---------- 3. horario ----------
Write-Host ''
Write-Host '  Horario do disparo, formato 24h (ex.: 20:00).'
Write-Host '  Sugestao: 20:00. A B3 encerra entre 16h55 e 18h conforme a epoca'
Write-Host '  do ano, Nova York fecha ate as 19h e os portais ainda levam um'
Write-Host '  tempo para publicar o fechamento. As 20h tudo ja consolidou.' -ForegroundColor DarkGray
Write-Host ''
$hora = (Read-Host '  Horario [20:00]').Trim()
if ([string]::IsNullOrWhiteSpace($hora)) { $hora = '20:00' }
try { $quando = [datetime]::ParseExact($hora, 'HH:mm', $null) }
catch { Write-Host "  Horario invalido: $hora" -ForegroundColor Red; Read-Host; exit 1 }

# ---------- 4. criar a tarefa ----------
$nome = 'Fechamento de Mercado'
$acao = New-ScheduledTaskAction -Execute $n8n -Argument "execute --id $id"
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $quando

# StartWhenAvailable: se o PC estiver desligado na hora, roda assim que ligar.
# E o que resolve o dia em que a maquina nao estava ligada as 20h.
$config = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5)

if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false
  Write-Host ''
  Write-Host '  Tarefa anterior removida.' -ForegroundColor DarkGray
}

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config `
  -Description 'Executa o workflow de fechamento de mercado no n8n e envia o e-mail.' | Out-Null

Write-Host ''
Write-Host "  Pronto. A tarefa '$nome' roda de segunda a sexta as $hora." -ForegroundColor Green
Write-Host ''
Write-Host '  Detalhes:'
Write-Host '   - Se o PC estiver desligado no horario, ela roda assim que voce ligar.'
Write-Host '   - Funciona na bateria e acorda o PC se ele estiver suspenso.'
Write-Host '   - Em caso de falha, tenta mais 2 vezes com 5 minutos de intervalo.'
Write-Host ''
Write-Host '  IMPORTANTE: deixe o workflow DESATIVADO no n8n.' -ForegroundColor Yellow
Write-Host '  Quem dispara agora e esta tarefa. Se o workflow tambem estiver ativo,'
Write-Host '  voce recebe o e-mail duas vezes.'
Write-Host ''
Write-Host '  Para testar agora, sem esperar o horario, rode no Prompt de Comando:'
Write-Host "    schtasks /run /tn `"$nome`"" -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Para remover depois:'
Write-Host "    schtasks /delete /tn `"$nome`" /f" -ForegroundColor DarkGray
Write-Host ''
Read-Host '  Enter para fechar'
