@echo off
title Trust ShiroFPV Code Signing Certificate
echo ==============================================================
echo Installing ShiroFPV Hardware Labs Certificate into Windows Trust Store...
echo ==============================================================
echo.
cd /d "%~dp0"

certutil.exe -addstore -user TrustedPublisher "shirofpv-cert.cer"
certutil.exe -addstore -user Root "shirofpv-cert.cer"

echo.
echo ==============================================================
echo Certificate installation complete!
echo Windows will now verify TenmaScopeStudio as a Trusted Publisher.
echo ==============================================================
pause
