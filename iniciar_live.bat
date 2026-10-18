@echo off
title TikTok LIVE - Urna Eletronica 13 vs 22 (Servidor Completo)
echo ========================================================
echo    INICIANDO SERVIDOR TIKTOK LIVE INTERATIVO
echo    Disputa 13 vs 22 - Urna Eletronica 3D + Backend WS
echo ========================================================
echo.
echo  [1] Overlay da Live:  http://localhost:3000/overlay
echo  [2] Painel Admin:     http://localhost:3000/admin
echo  [3] Cockpit de Teste: http://localhost:3000/test
echo.
echo Abrindo Overlay no seu navegador padrao...
echo.

start "" "http://localhost:3000/overlay"

node server.js
pause
