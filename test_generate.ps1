$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$body = @{
  prompt = "short test"
  music_style = "Lo-Fi"
  output_length = 15
} | ConvertTo-Json
$headers = @{
  Authorization = $key
  'Content-Type' = 'application/json'
}
try {
  $r = Invoke-WebRequest -Uri 'https://api.musicgpt.com/api/public/v1/MusicAI' -Method POST -Headers $headers -Body $body -TimeoutSec 15 -UseBasicParsing
  Write-Output "Status: $($r.StatusCode)"
  Write-Output "Body: $($r.Content)"
} catch {
  Write-Output "Error Status: $($_.Exception.Response.StatusCode)"
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $body = $reader.ReadToEnd()
  Write-Output "Body: $body"
}
