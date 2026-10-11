@echo off
rem Compila o bm-loopback.exe (ver process-loopback.cpp) para build\bin.
rem Precisa das Ferramentas de Build do Visual Studio (C++ + Windows SDK).
rem O .exe gerado e versionado: empacotar o launcher nao exige compilador.
setlocal
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
for /f "usebackq delims=" %%i in (`call "%VSWHERE%" -latest -products * -property installationPath`) do set "VS=%%i"
if not defined VS (
  echo Visual Studio Build Tools nao encontrado.
  exit /b 1
)
echo usando %VS%
rem O vcvars procura o vswhere no PATH.
set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set "HERE=%~dp0"
set "OUT=%HERE%..\..\build\bin"
if not exist "%OUT%" mkdir "%OUT%"
cl /nologo /O2 /EHsc /MT /W3 /DUNICODE /D_UNICODE "%HERE%process-loopback.cpp" ^
  /Fo"%TEMP%\bm-loopback.obj" /Fe"%OUT%\bm-loopback.exe" ^
  /link /SUBSYSTEM:CONSOLE mmdevapi.lib ole32.lib || exit /b 1
del "%TEMP%\bm-loopback.obj" 2>nul
echo ok: %OUT%\bm-loopback.exe
