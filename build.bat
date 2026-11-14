@echo off
rem No build step: this site is plain files. This runs the tests that gate every deploy.
cd /d "%~dp0"
node --test
if errorlevel 1 (
  echo TESTS FAILED
  exit /b 1
)
echo Tests passed. Preview: python -m http.server 8766
exit /b 0
