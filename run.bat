@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "NO_OPEN="
set "NO_PAUSE="
set "DRY_RUN="
call :ParseArgs %*

echo ==========================================
echo Starting LaborFlow Services...
echo ==========================================

if exist ".env" (
    echo Loading environment from .env...
    for /f "usebackq tokens=* delims=" %%A in (".env") do (
        set "line=%%A"
        if defined line if not "!line:~0,1!"=="#" (
            for /f "tokens=1,* delims==" %%K in ("!line!") do (
                if not "%%K"=="" set "%%K=%%L"
            )
        )
    )
)

set "WEB_PORT=5580"
set "CORE_PORT=5581"
set "FAST_PORT=5582"
set "DB_PORT=55432"
set "REDIS_PORT=56379"

if not defined LABORFLOW_FAST_BIND_ADDR set "LABORFLOW_FAST_BIND_ADDR=127.0.0.1:%FAST_PORT%"
set "SERVER_PORT=%CORE_PORT%"
if not defined SPRING_DATASOURCE_URL set "SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:%DB_PORT%/laborflow_db"
if not defined SPRING_DATASOURCE_USERNAME set "SPRING_DATASOURCE_USERNAME=admin"
if not defined SPRING_DATASOURCE_PASSWORD set "SPRING_DATASOURCE_PASSWORD=admin"
if not defined SPRING_DATA_REDIS_HOST set "SPRING_DATA_REDIS_HOST=localhost"
if not defined SPRING_DATA_REDIS_PORT set "SPRING_DATA_REDIS_PORT=%REDIS_PORT%"
if not defined SPRING_DATA_REDIS_PASSWORD set "SPRING_DATA_REDIS_PASSWORD=admin"
if not defined VITE_API_BASE_URL set "VITE_API_BASE_URL=http://localhost:%CORE_PORT%"
if not defined VITE_FAST_API_BASE_URL set "VITE_FAST_API_BASE_URL=http://localhost:%FAST_PORT%"
if not defined VITE_REALTIME_WS_URL set "VITE_REALTIME_WS_URL=ws://localhost:%FAST_PORT%/ws"

echo [0/4] Stopping old LaborFlow service windows...
call :KillWindow "LF-Core"
call :KillWindow "LF-Fast"
call :KillWindow "LF-Web"

echo Releasing local service ports...
call :StopPort "Core API" %CORE_PORT%
call :StopPort "Fast API" %FAST_PORT%
call :StopPort "Web App" %WEB_PORT%

if defined DRY_RUN (
    echo.
    echo Dry run completed. No services were started.
    if not defined NO_PAUSE pause
    exit /b 0
)

echo [1/4] Starting PostgreSQL and Redis (Docker)...
docker compose up -d postgres redis
if errorlevel 1 goto :fail

echo Waiting for PostgreSQL to accept connections...
set "DB_READY="
for /L %%I in (1,1,60) do (
    docker exec laborflow_db pg_isready -U admin -d laborflow_db >nul 2>&1
    if not errorlevel 1 (
        set "DB_READY=1"
        goto :db_ready
    )
    ping -n 2 127.0.0.1 >nul
)

:db_ready
if not defined DB_READY (
    echo PostgreSQL did not become ready in time.
    goto :fail
)

echo Waiting for Redis to accept connections...
set "REDIS_READY="
for /L %%I in (1,1,60) do (
    docker exec laborflow_redis redis-cli -a admin ping >nul 2>&1
    if not errorlevel 1 (
        set "REDIS_READY=1"
        goto :redis_ready
    )
    ping -n 2 127.0.0.1 >nul
)

:redis_ready
if not defined REDIS_READY (
    echo Redis did not become ready in time.
    goto :fail
)

echo [2/4] Starting Backend Core (Spring Boot)...
start "LF-Core" cmd /k "cd /d ""%CD%\backend-core"" && .\gradlew.bat bootRun"

echo [3/4] Starting Backend Fast (Rust)...
start "LF-Fast" cmd /k "cd /d ""%CD%\backend-fast"" && cargo run"

echo [4/4] Starting Frontend (Web)...
start "LF-Web" cmd /k "cd /d ""%CD%\web"" && npm run dev -- --host 127.0.0.1 --port %WEB_PORT%"

echo.
echo ==========================================
echo LaborFlow services are starting.
echo Core API: http://localhost:%CORE_PORT%/api/health
echo Fast API: http://localhost:%FAST_PORT%/health
echo Web App:  http://localhost:%WEB_PORT%
echo Database: localhost:%DB_PORT% / laborflow_db / admin
echo Redis:    localhost:%REDIS_PORT% / password admin
echo ==========================================

if not defined NO_OPEN (
    ping -n 4 127.0.0.1 >nul
    start "" "http://localhost:%WEB_PORT%"
)

if not defined NO_PAUSE pause
exit /b 0

:fail
echo.
echo ==========================================
echo Failed to start LaborFlow services.
echo Check Docker Desktop and service windows for details.
echo ==========================================
if not defined NO_PAUSE pause
exit /b 1

:ParseArgs
if "%~1"=="" exit /b 0
if /I "%~1"=="--no-open" set "NO_OPEN=1"
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
if /I "%~1"=="--dry-run" set "DRY_RUN=1"
shift
goto :ParseArgs

:KillWindow
taskkill /FI "WINDOWTITLE eq %~1" /T /F >nul 2>&1
exit /b 0

:StopPort
set "PORT_NAME=%~1"
set "PORT_NUMBER=%~2"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT_NUMBER% .*LISTENING"') do (
    if not "%%P"=="0" (
        echo   Stopping %PORT_NAME% process on port %PORT_NUMBER% ^(PID %%P^)...
        taskkill /PID %%P /T /F >nul 2>&1
    )
)
exit /b 0
