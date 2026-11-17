# BandGo · publicar la última versión en Cloudflare con un doble clic (Windows). Igual que el de FoodPOS.
# Baja (o actualiza) el proyecto desde GitHub, crea la base D1 y el bucket R2 la primera vez, prueba, migra y publica.
# No borra nada de su computadora ni de la base de datos.
param([switch]$YaActualizado)

$ErrorActionPreference = 'Continue'
$Repo     = 'https://github.com/gocabletech-dotcom/bandgo'
$Carpeta  = Join-Path $HOME 'BandGo'
$Base     = 'bandgo-db'
$Bucket   = 'bandgo-archivos'

function Paso($n, $t) { Write-Host ""; Write-Host "[$n/8] $t" -ForegroundColor Magenta }
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Falla($t) { Write-Host ""; Write-Host "    ERROR: $t" -ForegroundColor Red; Write-Host ""; Read-Host "Presione Enter para cerrar"; exit 1 }
function Tiene($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Recargar-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Reintentar($titulo, $bloque, $intentos = 3) {
  for ($i = 1; $i -le $intentos; $i++) {
    & $bloque
    if ($LASTEXITCODE -eq 0) { return }
    if ($i -lt $intentos) { Write-Host "    $titulo no terminó (intento $i de $intentos). Reintentando en 5 s..." -ForegroundColor Cyan; Start-Sleep -Seconds 5 }
  }
  Falla "$titulo falló después de $intentos intentos. Revise su internet y vuelva a correr este programa."
}

Write-Host "==============================================" -ForegroundColor DarkMagenta
Write-Host "   BandGo · publicar la última versión" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor DarkMagenta

Paso 1 'Revisando Git y Node.js'
if (-not (Tiene git)) { winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements | Out-Null; Recargar-Path; if (-not (Tiene git)) { Falla 'No se pudo instalar Git. Instálelo desde https://git-scm.com' } }
Ok ("Git " + (git --version))
if (-not (Tiene node)) { winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Null; Recargar-Path; if (-not (Tiene node)) { Falla 'No se pudo instalar Node.js. Instálelo desde https://nodejs.org' } }
Ok ("Node " + (node --version))

Paso 2 "Bajando la última versión desde GitHub a $Carpeta"
if (Test-Path (Join-Path $Carpeta '.git')) {
  Set-Location $Carpeta
  git fetch origin main; if ($LASTEXITCODE -ne 0) { Falla 'No se pudo conectar con GitHub.' }
  git reset --hard origin/main | Out-Null
} else {
  if (Test-Path $Carpeta) { Falla "Ya existe la carpeta $Carpeta pero no viene de GitHub. Cámbiele el nombre y vuelva a correr este programa." }
  Write-Host '    La primera vez GitHub puede abrir el navegador para entrar con la cuenta gocabletech-dotcom.'
  git clone $Repo $Carpeta; if ($LASTEXITCODE -ne 0) { Falla 'No se pudo bajar el proyecto de GitHub.' }
  Set-Location $Carpeta
}
$Commit  = (git rev-parse --short HEAD)
$Version = (git log -1 --format='%s (%cd)' --date=short)
Ok ("Versión: " + $Version)
$Nuevo = Join-Path $Carpeta 'tools\publicar-bandgo.ps1'
if (-not $YaActualizado -and (Test-Path $Nuevo) -and ($PSCommandPath -ne $Nuevo) -and ((Get-FileHash $Nuevo).Hash -ne (Get-FileHash $PSCommandPath).Hash)) {
  Write-Host '    Hay un instalador más nuevo: se continúa con ese.' -ForegroundColor Cyan
  Copy-Item $Nuevo $PSCommandPath -Force -ErrorAction SilentlyContinue
  & powershell -NoProfile -ExecutionPolicy Bypass -File $Nuevo -YaActualizado
  exit $LASTEXITCODE
}

Paso 3 'Instalando dependencias (npm install)'
Reintentar 'npm install' { npm install --no-audit --no-fund }
Ok 'Dependencias instaladas'

Paso 4 'Corriendo las pruebas automáticas (1 a 3 minutos)'
Copy-Item (Join-Path $Carpeta 'wrangler.ejemplo.jsonc') (Join-Path $Carpeta 'wrangler.jsonc') -Force   # las pruebas usan la base local
node tools/pruebas.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "    Alguna prueba falló (arriba dice cuál, en rojo). NO se publicó nada. Mande una foto de esta pantalla." -ForegroundColor Red
  $forzar = Read-Host "    Solo en una emergencia: escriba PUBLICAR para publicar de todas formas, o Enter para salir"
  if ($forzar -ne 'PUBLICAR') { exit 1 }
} else { Ok 'Todas las pruebas pasaron' }

Paso 5 'Revisando la sesión de Cloudflare'
$quien = (npx wrangler whoami 2>&1) | Out-String
if ($quien -match 'not authenticated|You are not logged in') {
  Write-Host '    Se abrirá el navegador: entre con su cuenta de Cloudflare y toque Allow.'
  npx wrangler login
  $quien = (npx wrangler whoami 2>&1) | Out-String
  if ($quien -match 'not authenticated|You are not logged in') { Falla 'No se completó el inicio de sesión en Cloudflare.' }
}
Ok 'Sesión de Cloudflare activa'

Paso 6 'Base de datos D1 y archivos R2 (se crean solo la primera vez; plan gratis)'
$lista = (npx wrangler d1 list --json 2>$null) | Out-String
$DbId = $null
try { $DbId = (($lista | ConvertFrom-Json) | Where-Object { $_.name -eq $Base } | Select-Object -First 1).uuid } catch {}
if (-not $DbId) {
  Write-Host "    Creando la base $Base ..."
  $sal = (npx wrangler d1 create $Base 2>&1) | Out-String
  if ($sal -match '"database_id":\s*"([0-9a-f-]{36})"' -or $sal -match 'database_id\s*=\s*"([0-9a-f-]{36})"') { $DbId = $Matches[1] }
  if (-not $DbId) { Falla "No se pudo crear la base D1.`n$sal" }
}
Ok "Base D1: $DbId"
$r2 = (npx wrangler r2 bucket list 2>&1) | Out-String
if ($r2 -notmatch [regex]::Escape($Bucket)) {
  Write-Host "    Creando el bucket privado $Bucket ..."
  npx wrangler r2 bucket create $Bucket
  if ($LASTEXITCODE -ne 0) { Falla 'No se pudo crear el bucket R2. Revise que R2 esté activado en su cuenta de Cloudflare.' }
}
Ok "Archivos R2: $Bucket (privado)"
$cfg = @"
{
  "name": "bandgo",
  "main": "src/worker.js",
  "compatibility_date": "2026-11-01",
  "assets": { "directory": "./public", "binding": "ASSETS", "not_found_handling": "none", "run_worker_first": true },
  "d1_databases": [ { "binding": "DB", "database_name": "$Base", "database_id": "$DbId", "migrations_dir": "migrations" } ],
  "r2_buckets": [ { "binding": "ARCHIVOS", "bucket_name": "$Bucket" } ],
  "vars": { "BANDGO_VERSION": "$Commit" },
  "triggers": { "crons": ["7 * * * *"] },
  "observability": { "enabled": true }
}
"@
[IO.File]::WriteAllText((Join-Path $Carpeta 'wrangler.jsonc'), $cfg, (New-Object Text.UTF8Encoding $false))
Ok 'wrangler.jsonc listo'

Paso 7 'Respaldo, migraciones y publicación'
$Respaldos = Join-Path $HOME 'BandGo-respaldos'
New-Item -ItemType Directory -Force -Path $Respaldos | Out-Null
$archivo = Join-Path $Respaldos ('bandgo-' + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.sql')
npx wrangler d1 export $Base --remote --output "$archivo" 2>$null
if ($LASTEXITCODE -eq 0 -and (Test-Path $archivo)) { Ok 'Respaldo guardado'; Get-ChildItem $Respaldos -Filter 'bandgo-*.sql' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 | Remove-Item -Force -ErrorAction SilentlyContinue }
else { Write-Host '    (Sin respaldo esta vez: la base es nueva o no respondió. Se sigue.)' -ForegroundColor DarkYellow }
Write-Host '    Si Wrangler pregunta "Ok to proceed?", escriba y + Enter.' -ForegroundColor Cyan
Reintentar 'Las migraciones' { npx wrangler d1 migrations apply $Base --remote }
Ok 'Base de datos al día'
$salida = ''
for ($i = 1; $i -le 3; $i++) { $salida = (npx wrangler deploy 2>&1) | Out-String; $codigo = $LASTEXITCODE; Write-Host $salida; if ($codigo -eq 0) { break }; Start-Sleep 5 }
if ($codigo -ne 0) { Falla 'La publicación falló.' }
Ok 'Publicado en Cloudflare'

Paso 8 'Llave maestra de cifrado (pasaportes, cuentas bancarias, claves)'
$sec = (npx wrangler secret list 2>&1) | Out-String
if ($LASTEXITCODE -ne 0) { Write-Host '    Aviso: no se pudo revisar la llave; se revisa en la próxima publicación.' -ForegroundColor DarkYellow }
elseif ($sec -match 'BANDGO_LLAVE') { Ok 'Llave maestra ya existe (NUNCA se cambia)' }
else {
  $bytes = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes) | npx wrangler secret put BANDGO_LLAVE
  if ($LASTEXITCODE -eq 0) { Ok 'Llave maestra creada' } else { Write-Host '    Aviso: no se pudo crear la llave; vuelva a correr este programa.' -ForegroundColor DarkYellow }
}

$Url = $null
if ($salida -match '(https://[a-z0-9.-]+\.workers\.dev)') { $Url = $Matches[1] }
$live = ''
if ($Url) { for ($i = 1; $i -le 6; $i++) { Start-Sleep -Seconds 3; try { $live = (Invoke-RestMethod -Uri "$Url/api/version" -TimeoutSec 20).version } catch { $live = '' }; if ($live -eq $Commit) { break } } }
Write-Host "==============================================" -ForegroundColor Green
if ($live -eq $Commit) { Write-Host "   LISTO · BandGo publicado y confirmado ($Commit)" -ForegroundColor Green } else { Write-Host "   BandGo se publicó. Versión esperada: $Commit" -ForegroundColor Yellow }
if ($Url) { Write-Host "   Dirección: $Url/app/" -ForegroundColor Green }
Write-Host "==============================================" -ForegroundColor Green
Write-Host "La primera vez, la página le pide crear el usuario de la plataforma (superadministrador)."
if ($Url) { try { Start-Process "$Url/app/" } catch {} }
Read-Host "Presione Enter para cerrar"
