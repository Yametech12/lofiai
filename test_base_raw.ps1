$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = $key }  # No Bearer
try {
  $r = Invoke-WebRequest -Uri 'https://api.musicgpt.com/api/public/v1' -Headers $headers -UseBasicParsing -Method GET -TimeoutSec 10
  Write-Output "Status: $($r.StatusCode)"
  Write-Output "Body: $($r.Content.Substring(0, [Math]::Min(500, $r.Content.Length)))"
} catch {
  Write-Output "Error Status: $($_.Exception.Response.StatusCode)"
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $body = $reader.ReadToEnd()
  Write-Output "Body: $body"
}
