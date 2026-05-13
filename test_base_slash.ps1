$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = $key }
$url = 'https://api.musicgpt.com/api/public/v1/'
try {
  $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -Method GET -TimeoutSec 5
  Write-Output "Status: $($r.StatusCode)"
  Write-Output "Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))"
} catch {
  Write-Output "Error: $($_.Exception.Response.StatusCode)"
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $body = $reader.ReadToEnd()
  Write-Output "Body: $body"
}
