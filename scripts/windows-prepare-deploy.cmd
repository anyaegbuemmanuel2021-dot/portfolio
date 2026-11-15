@echo off
setlocal
pushd "%~dp0.."
echo ================================================
echo Portfolio Platform - Windows deployment checks
echo ================================================
where node >nul 2>nul || (echo ERROR: Node.js is not installed. Install Node.js 22 LTS or newer.& exit /b 1)
where npm >nul 2>nul || (echo ERROR: npm was not found.& exit /b 1)
node -e "const v=Number(process.versions.node.split('.')[0]); if(v<22){console.error('Node.js 22 or newer is required.');process.exit(1)} else console.log('Node.js '+process.version+' detected.')" || exit /b 1
if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example. Keep it private and never commit it.
) else (
  echo Existing .env found; it was not overwritten.
)
echo.
echo Installing project dependencies...
npm install --no-audit --no-fund || exit /b 1
echo.
echo Running automated tests...
npm test || exit /b 1
echo.
echo Auditing production dependencies...
npm run security:audit || (echo ERROR: Dependency audit failed. Review npm audit output before deployment.& exit /b 1)
echo.
echo Generate a strong AUTH_SECRET for Render:
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
echo.
echo NEXT: push this project to a private GitHub repository, create the Render Blueprint,
echo then add the Render deploy hook as GitHub Actions secret RENDER_DEPLOY_HOOK.
echo Do not paste database passwords, Dbrij keys or AUTH_SECRET into chat.
popd
endlocal
