@echo off
chcp 65001 >nul

REM 从 .github\scripts 返回项目根目录
cd /d "%~dp0\..\.."

echo ==============================
echo   Git 指定版本覆盖工具
echo ==============================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Git 仓库
    pause
    exit /b 1
)

set /p HASH=请输入要恢复的 Commit Hash: 

if "%HASH%"=="" (
    echo [错误] Hash 不能为空
    pause
    exit /b 1
)

git cat-file -e "%HASH%^{commit}" >nul 2>&1
if errorlevel 1 (
    echo [错误] 找不到 Commit: %HASH%
    pause
    exit /b 1
)

echo.
echo 正在用版本 %HASH% 覆盖当前工作区...
echo.

git restore --source="%HASH%" --worktree -- .

if errorlevel 1 (
    echo.
    echo [错误] 操作失败
    pause
    exit /b 1
)

echo.
echo ==============================
echo 完成
echo ==============================
echo 当前分支和 HEAD 未改变
echo 未自动提交
echo GitHub Desktop 中会显示为未提交修改
echo.

git status --short

echo.
pause