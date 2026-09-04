# 同步代码到 AtomGit

每次提交代码到 GitHub 后，复制以下命令执行即可同步到 AtomGit：

```powershell
git push atomgit --all --force
git push atomgit --tags --force
```

## 完整流程示例

```powershell
# 1. 提交代码
git add .
git commit -m "你的提交信息"

# 2. 推送到 GitHub
git push origin main

# 3. 同步到 AtomGit
git push atomgit --all --force
git push atomgit --tags --force
```

