Write-Host "Applying MOOD database migration..." -ForegroundColor Cyan
npx supabase db push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying send-push Edge Function..." -ForegroundColor Cyan
npx supabase functions deploy send-push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Committing and pushing project..." -ForegroundColor Cyan
git add .
git commit -m "Customer driver autocomplete photos deposit push update"
git push

Write-Host "Done. Wait for Vercel deployment to become Ready." -ForegroundColor Green
