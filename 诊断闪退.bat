@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   闪退诊断工具
echo ========================================
echo.
echo 请稍等，启动应用并捕获输出...
echo.

set "EXE_PATH="
if exist "d:\develop\OpenBidKit\client\release\win-unpacked\哲元投标工具箱.exe" (
    set "EXE_PATH=d:\develop\OpenBidKit\client\release\win-unpacked\哲元投标工具箱.exe"
) else if exist "D:\Program Files\yibiao-client\哲元投标工具箱.exe" (
    set "EXE_PATH=D:\Program Files\yibiao-client\哲元投标工具箱.exe"
) else if exist "D:\Program Files\yibiao-client\创合投标工具箱.exe" (
    set "EXE_PATH=D:\Program Files\yibiao-client\创合投标工具箱.exe"
)

if "%EXE_PATH%"=="" (
    echo [错误] 找不到可执行文件
    pause
    exit /b 1
)

echo 使用: %EXE_PATH%
echo.

echo === 启动应用（15秒后自动检查）===
start "" "%EXE_PATH%"

echo 等待15秒...
timeout /t 15 /nobreak >nul

echo.
echo === 检查进程是否存活 ===
tasklist /FI "IMAGENAME eq 哲元投标工具箱.exe" 2>nul | find "哲元" >nul
if %errorlevel%==0 (
    echo [结果] 应用仍在运行，未闪退
) else (
    tasklist /FI "IMAGENAME eq 创合投标工具箱.exe" 2>nul | find "创合" >nul
    if %errorlevel%==0 (
        echo [结果] 应用仍在运行，未闪退
    ) else (
        echo [结果] 应用已退出（闪退）
    )
)

echo.
echo === 检查 GPU 状态 ===
if exist "%APPDATA%\yibiao-client\gpu_startup_probe.json" (
    echo GPU probe 文件存在:
    type "%APPDATA%\yibiao-client\gpu_startup_probe.json"
) else (
    echo GPU probe 文件不存在
)

echo.
echo === 检查 user_config.json GPU 设置 ===
if exist "%APPDATA%\yibiao-client\user_config.json" (
    findstr /i "gpu" "%APPDATA%\yibiao-client\user_config.json"
) else (
    echo user_config.json 不存在
)

echo.
echo === 尝试 --disable-gpu 启动 ===
echo 启动应用（禁用GPU）...
start "" "%EXE_PATH%" --disable-gpu --disable-hardware-acceleration
echo 等待10秒...
timeout /t 10 /nobreak >nul

tasklist /FI "IMAGENAME eq 哲元投标工具箱.exe" 2>nul | find "哲元" >nul
if %errorlevel%==0 (
    echo [结果] 禁用GPU后应用正常运行 → 问题是GPU崩溃
    echo 建议: 在 user_config.json 中设置 gpu_hardware_acceleration_enabled=false
) else (
    tasklist /FI "IMAGENAME eq 创合投标工具箱.exe" 2>nul | find "创合" >nul
    if %errorlevel%==0 (
        echo [结果] 禁用GPU后应用正常运行 → 问题是GPU崩溃
    ) else (
        echo [结果] 禁用GPU后仍然闪退 → 问题不是GPU
    )
)

echo.
echo ========================================
echo 诊断完成，请截图发送给开发者
echo ========================================
pause
