@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   打包发行版
echo ========================================

echo.
echo 关闭已运行的实例...
taskkill /F /IM 哲元投标工具箱.exe >nul 2>&1
taskkill /F /IM 哲元投标工具箱.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo 清理旧打包产物...
rd /S /Q "d:\develop\OpenBidKit\client\release" >nul 2>&1

echo.
echo 开始打包...
cd /d d:\develop\OpenBidKit\client
call npm run build
if errorlevel 1 (
    echo [错误] 编译失败
    pause
    exit /b 1
)
call node scripts\prepare-openxml-helper.cjs --platform win32 --arch x64
call npx electron-builder --win --publish never
if errorlevel 1 (
    echo.
    echo [错误] 打包失败
    pause
    exit /b 1
)

echo.
echo [完成] 打包成功，产物在 client\release\ 目录
dir /b "d:\develop\OpenBidKit\client\release\*.exe" 2>nul
echo.
pause