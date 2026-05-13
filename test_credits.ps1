$key = 'Ezrd4qVAZX8BpwHmhS9ILQexZ7sN7ESvbtCjynYBqik'
$headers = @{ Authorization = "Bearer $key" }
try {
  $r = Invoke-WebRequest -Uri 'https://api.musicgpt.com/api/public/v1/getAllVoices' -Headers $headers -UseBasicParsing -Method GET
  Write-Output "Status: $($r.StatusCode)"
  Write-Output "Body: $($r.Content.Substring(0, [Math]::Min(500, $r.Content.Length)))"
} catch {
  Write-Output "Error: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    Write-Output "Status: $($_.Exception.Response.StatusCode)"
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Output "Body: $body"
  }
}
