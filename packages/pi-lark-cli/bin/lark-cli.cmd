@ECHO OFF
node "%~dp0main.cjs" %*
EXIT /B %ERRORLEVEL%
