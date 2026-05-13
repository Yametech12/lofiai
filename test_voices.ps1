$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = "Bearer $key" }
try {
  $r = Invoke-WebRequest -Uri 'https://api.musicgpt.com/api/public/v1/getAllVoices?limit=1' -Headers $headers -UseBasicParsing -Method GET
  Write-Output "Status: $($r.StatusCode)"
  Write-Output "Content: $($r.Content)"
  Write-Output "Headers:"
  $r.Headers | Format-Table -AutoSize
} catch {
  Write-Output "Error: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Output "Status: $($_.Exception.Response.StatusCode)"
    Write-Output "Body: $body"
  }
}
