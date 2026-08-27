@echo off
REM ---------------------------------------------------------------
REM  Double-click this to push SEIRS to GitHub.
REM
REM  Claude cannot run `git push` itself: the permission classifier
REM  blocks it outright in auto mode, because a push triggers the
REM  Railway and Vercel production deploys. So this exists to save
REM  opening a terminal.
REM
REM  It shows what is about to go up, asks once, and only then pushes.
REM ---------------------------------------------------------------
cd /d "%~dp0"

echo.
echo   SEIRS push
echo   ==========
echo.
echo   Commits waiting to go up:
echo.
git --no-pager log --oneline origin/main..HEAD
echo.

for /f %%i in ('git rev-list --count origin/main..HEAD') do set AHEAD=%%i
if "%AHEAD%"=="0" (
  echo   Nothing to push. You are up to date.
  echo.
  pause
  exit /b 0
)

echo   Pushing %AHEAD% commit^(s^) to main will deploy to Railway and Vercel.
echo.
set /p CONFIRM="  Type Y to push, anything else to cancel: "

if /i not "%CONFIRM%"=="Y" (
  echo.
  echo   Cancelled. Nothing was pushed.
  echo.
  pause
  exit /b 0
)

echo.
git push origin main
echo.

if errorlevel 1 (
  echo   PUSH FAILED. Read the message above.
) else (
  echo   Pushed. Railway and Vercel will redeploy in a minute or two.
)
echo.
pause
