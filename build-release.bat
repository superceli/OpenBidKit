﻿@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

REM ============================================================
REM  哲元绿证报告工具箱 · Windows 一键打包
REM  用法：双击运行，或 CMD 里执行 build-release.bat
REM  依赖：client/scripts/license-private-key.json 必须存在
REM ============================================================

echo [1/8] 清理旧进程...
taskkill /F /IM electron.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/8] 清理旧产物...
if exist release rmdir /S /Q release
if exist dist rmdir /S /Q dist

echo [3/8] 进入 client 目录...
cd /d "%~dp0client"
if errorlevel 1 (
  echo [错误] 找不到 client 目录
  pause
  exit /b 1
)

echo [4/8] 检查私钥文件...
if not exist scripts\license-private-key.json (
  echo [错误] 缺少 client\scripts\license-private-key.json
  echo        请先运行 generate-offline-license.cjs 的密钥生成命令
  pause
  exit /b 1
)

echo [5/8] 签名 build-attestation (本地私钥)...
call node -e "process.env.YIBIAO_LICENSE_PRIVATE_KEY_JWK=require('fs').readFileSync('scripts/license-private-key.json','utf-8');process.env.YIBIAO_LICENSE_KEY_ID='official-build-key-2026-09';require('./scripts/generate-build-attestation.cjs')"
if errorlevel 1 (
  echo [错误] build-attestation 签名失败
  pause
  exit /b 1
)

echo [6/8] 类型检查 + Vite 构建...
call npx tsc --noEmit
if errorlevel 1 (
  echo [错误] TypeScript 类型检查失败
  pause
  exit /b 1
)
call npx vite build
if errorlevel 1 (
  echo [错误] Vite 构建失败
  pause
  exit /b 1
)

echo [7/8] Electron Builder 打包 Windows (NSIS + zip)...
call npx electron-builder --win --x64 --publish never
if errorlevel 1 (
  echo [错误] 打包失败
  pause
  exit /b 1
)

echo [8/8] 完成！产物在 client\release\
echo.
dir /B release\
echo.
pause

