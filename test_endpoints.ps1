$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = "Bearer $key" }
$endpoints = @(
  'https://api.musicgpt.com/api/public/v1/user',
  'https://api.musicgpt.com/api/public/v1/me',
  'https://api.musicgpt.com/api/public/v1/account',
  'https://api.musicgpt.com/api/public/v1/profile',
  'https://api.musicgpt.com/api/public/v1/credits',
  'https://api.musicgpt.com/api/public/v1/apiUser'
)
foreach ($url in $endpoints) {
  try {
    $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -Method GET -TimeoutSec 5
    Write-Output "URL: $url"
    Write-Output "Status: $($r.StatusCode)"
    Write-Output "Body (first 200 chars): $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
    Write-Output "---"
  } catch {
    Write-Output "URL: $url"
    Write-Output "Error: $($_.Exception.Response.StatusCode)"
    if ($_.Exception.Response) {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
      Write-Output "Body: $body"
    } else {
      Write-Output "No response"
    }
    Write-Output "---"
  }
}
