$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = "Bearer $key" }
$endpoints = @(
  'https://api.musicgpt.com/api/public/v1/user/info',
  'https://api.musicgpt.com/api/public/v1/account/balance',
  'https://api.musicgpt.com/api/public/v1/balance',
  'https://api.musicgpt.com/api/public/v1/subscription',
  'https://api.musicgpt.com/api/public/v1/plans',
  'https://api.musicgpt.com/api/public/v1/usage',
  'https://api.musicgpt.com/api/public/v1/user/credits'
)
foreach ($url in $endpoints) {
  try {
    $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -Method GET -TimeoutSec 5
    Write-Output "URL: $url"
    Write-Output "Status: $($r.StatusCode)"
    Write-Output "Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))"
  } catch {
    Write-Output "URL: $url"
    Write-Output "Error: $($_.Exception.Response.StatusCode)"
    if ($_.Exception.Response) {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
      Write-Output "Body: $body"
    }
  }
  Write-Output "---"
}
