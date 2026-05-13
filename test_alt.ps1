$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = $key }
$urls = @(
  'https://api.musicgpt.com/api/v1/user',
  'https://api.musicgpt.com/api/v1/me',
  'https://api.musicgpt.com/api/v1/account',
  'https://api.musicgpt.com/api/v1/balance'
)
foreach ($url in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -Method GET -TimeoutSec 5
    Write-Output "$url`: $($r.StatusCode) - $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
  } catch {
    Write-Output "$url`: $($_.Exception.Response.StatusCode)"
  }
}
