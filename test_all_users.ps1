$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = $key }
$paths = @(
  'user',
  'me',
  'account',
  'profile',
  'credits',
  'balance',
  'subscription',
  'apiUser',
  'userinfo',
  'account_info',
  'billing',
  'plans',
  'usage'
)
foreach ($path in $paths) {
  $url = "https://api.musicgpt.com/api/public/v1/$path"
  try {
    $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -Method GET -TimeoutSec 5
    Write-Output "$url`: $($r.StatusCode)"
    if ($r.StatusCode -eq 200) {
      Write-Output "BODY: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
    }
  } catch {
    Write-Output "$url`: $($_.Exception.Response.StatusCode)"
  }
}
