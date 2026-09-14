param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$archivePath = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $archivePath) { throw 'Destination exists; choose a new archive filename.' }
$null = New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($archivePath))
$exclude = @('node_modules','.git','.venv','.next','dist','build','out','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','.wrangler','.vinext','.sites-runtime','data','outputs','work')
function Get-SourceFiles([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
    if ($entry.PSIsContainer) { if ($entry.Name -notin $exclude) { Get-SourceFiles $entry.FullName }; continue }
    if ($entry.Name -like '.env*' -and $entry.Name -ne '.env.example') { continue }
    if ($entry.Extension -in @('.pyc','.log','.zip') -or $entry.Name -like '*.tsbuildinfo') { continue }
    $entry
  }
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = @(Get-SourceFiles $sourceRoot | Sort-Object FullName)
$manifest = @()
$zip = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\','/')
    $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, "handwrite-studio/$relative", [IO.Compression.CompressionLevel]::Optimal)
    $manifest += [ordered]@{ path=$relative; bytes=$file.Length; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  foreach ($directory in @('fonts','backgrounds','projects','exports','sessions')) { $null = $zip.CreateEntry("handwrite-studio/data/$directory/.gitkeep") }
  $entry = $zip.CreateEntry('handwrite-studio/SOURCE-MANIFEST.json')
  $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
  try { $writer.Write((ConvertTo-Json -Depth 5 -InputObject ([ordered]@{ version='3.0.0'; schemaVersion=3; generatedAt=[DateTime]::UtcNow.ToString('o'); files=$manifest }))) } finally { $writer.Dispose() }
} finally { $zip.Dispose() }
$archive = Get-Item -LiteralPath $archivePath
[ordered]@{ path=$archivePath; bytes=$archive.Length; fileCount=$files.Count+6; sha256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash } | ConvertTo-Json
