$src = Join-Path $env:TEMP "fotolism_print_1793448078291.jpg"
$dest = "C:\Users\ADMIN\.gemini\antigravity\brain\b2b8665b-ac83-4256-ac38-a098a30c7e1a\current_print_test.jpg"
Copy-Item -Path $src -Destination $dest -Force
Write-Host "Copied successfully to" $dest

