@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

echo ==========================================
echo Stopping LaborFlow Services...
echo ==========================================

echo [1/4] Closing service windows...
taskkill /FI "WINDOWTITLE eq LF-Core" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LF-Fast" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LF-Web" /T /F >nul 2>&1

echo [2/4] Releasing local service ports...
echo   Stopping PostgreSQL and Redis containers...
docker compose down >nul 2>&1
if errorlevel 1 (
    echo [WARN] Docker compose shutdown was skipped or failed. Docker Desktop may already be stopped.
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5581 .*LISTENING"') do (
    if not "%%P"=="0" (
        echo   Stopping Core API process on port 5581 ^(PID %%P^)...
        taskkill /PID %%P /T /F >nul 2>&1
    )
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5582 .*LISTENING"') do (
    if not "%%P"=="0" (
        echo   Stopping Fast API process on port 5582 ^(PID %%P^)...
        taskkill /PID %%P /T /F >nul 2>&1
    )
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5580 .*LISTENING"') do (
    if not "%%P"=="0" (
        echo   Stopping Web App process on port 5580 ^(PID %%P^)...
        taskkill /PID %%P /T /F >nul 2>&1
    )
)
echo [3/4] Stopping Gradle daemons...
if exist "backend-core\gradlew.bat" (
    pushd "backend-core" >nul
    call "gradlew.bat" --stop >nul 2>&1
    popd >nul
)
if exist "mobile\gradlew.bat" (
    pushd "mobile" >nul
    call "gradlew.bat" --stop >nul 2>&1
    popd >nul
)

echo [4/4] Docker cleanup completed.

echo.
echo ==========================================
echo LaborFlow services have been stopped.
echo ==========================================
if not defined NO_PAUSE pause
exit /b 0
