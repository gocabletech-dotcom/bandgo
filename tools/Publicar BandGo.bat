@echo off
rem BandGo: doble clic para publicar la ultima version (baja de GitHub, prueba, migra y publica en Cloudflare)
title Publicar BandGo
set "PS1=%~dp0publicar-bandgo.ps1"
if not exist "%PS1%" set "PS1=%~dp0tools\publicar-bandgo.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
