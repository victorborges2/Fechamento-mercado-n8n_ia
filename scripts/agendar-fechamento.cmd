@echo off
REM Clique duas vezes neste arquivo para criar a tarefa agendada.
REM Ele apenas chama o script PowerShell ao lado, contornando a politica
REM de execucao que bloqueia .ps1 por padrao no Windows.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agendar-fechamento.ps1"
