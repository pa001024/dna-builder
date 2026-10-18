# DNA Builder installer
# Usage: irm api.dna-builder.cn | iex
$ErrorActionPreference = "Stop"

# --- ANSI colors ---
$C_RESET  = [char]27 + "[0m"
$C_GREEN  = [char]27 + "[1;32m"
$C_CYAN   = [char]27 + "[1;36m"
$C_RED    = [char]27 + "[1;31m"
$C_YELLOW = [char]27 + "[1;33m"

function Write-Info($msg) { Write-Output "${C_CYAN}$msg${C_RESET}" }
function Write-Ok($msg)   { Write-Output "${C_GREEN}$msg${C_RESET}" }
function Write-Warn($msg) { Write-Output "${C_YELLOW}$msg${C_RESET}" }
function Write-Err($msg)  { Write-Output "${C_RED}$msg${C_RESET}" }

# --- prerequisites ---
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Err "PowerShell 5.1 or newer is required."
    exit 1
}

if (-not [Environment]::OSVersion.Platform.Equals([System.PlatformID]::Win32NT)) {
    Write-Err "DNA Builder is only available on Windows."
    exit 1
}

# --- self-elevate if not running as administrator ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Info "Requesting administrator privileges..."
    # prefer pwsh; fall back to Windows PowerShell 5.1 when it is not installed
    $shell = "powershell"
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        $shell = "pwsh"
    } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) {
        $shell = "pwsh"
    }
    Start-Process $shell -Verb RunAs -ArgumentList "-NoProfile", "-Command", "irm 'api.dna-builder.cn' | iex"
    exit 0
}

# --- sources in priority order: primary first, secondary only on failure ---
$sources = @("cdn.dna-builder.cn", "cdn.dobapp.cc")

function Resolve-InstallerUrl($src) {
    try {
        $raw = curl.exe -sSfL "https://$src/latest.json"
        if ($LASTEXITCODE -ne 0) { return $null }
        $data = $raw | ConvertFrom-Json
        $url = $null
        if ($data.platforms) {
            foreach ($key in @('windows-x86_64', 'windows-x86_64-msi')) {
                if ($data.platforms.$key -and $data.platforms.$key.url) { $url = $data.platforms.$key.url; break }
            }
            if (-not $url) {
                foreach ($p in $data.platforms.PSObject.Properties) {
                    if ($p.Value.url -match '\.(msi|exe)$') { $url = $p.Value.url; break }
                }
            }
        }
        return $url
    } catch { return $null }
}

# --- try each source in priority order; stop at the first one that works ---

function Get-RemoteSize($url) {
    $enc = $url.Replace(' ', '%20')
    try {
        $hdr = curl.exe -sS -I -L "$enc"
        if ($LASTEXITCODE -eq 0) {
            foreach ($line in ($hdr -split "`n")) {
                if ($line -match '^[Cc]ontent-[Ll]ength:\s*(\d+)') { return [long]$Matches[1] }
            }
        }
    } catch { }
    return $null
}

function Get-LocalSize($path) {
    try { if (Test-Path $path) { return (Get-Item $path).Length } } catch { }
    return $null
}

# MSI/EXE file signature check.
function Test-ValidInstaller($path) {
    try {
        $fs = [System.IO.File]::OpenRead($path)
        $head = New-Object byte[] 8
        $n = $fs.Read($head, 0, 8)
        $fs.Close()
        if ($n -lt 8) { return $false }
        $msi = @(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
        $isMsi = $true
        for ($i = 0; $i -lt 8; $i++) { if ($head[$i] -ne $msi[$i]) { $isMsi = $false; break } }
        if ($isMsi) { return $true }
        if ($head[0] -eq 0x4D -and $head[1] -eq 0x5A) { return $true }
        return $false
    } catch { return $false }
}

# cache validity
function Test-CacheValid($url) {
    $size = Get-LocalSize $tempFile
    if ($size -eq $null -or $size -eq 0) { return $false }
    $expected = Get-RemoteSize $url
    if ($expected -ne $null -and $size -eq $expected) { return $true }
    if ($expected -eq $null) { return (Test-ValidInstaller $tempFile) }
    return $false
}

$downloaded = $false
foreach ($src in $sources) {
    Write-Info "Resolving latest version from $src ..."
    $url = Resolve-InstallerUrl $src
    if (-not $url) {
        Write-Warn "Could not resolve an installer from $src, trying next source..."
        continue
    }
    Write-Ok "Found installer on ${src}: $url"

    $tempFile = Join-Path $env:TEMP $url.Split('/')[-1]
    if (Test-CacheValid $url) {
        Write-Info "Using cached installer ($(Get-LocalSize $tempFile) bytes): $tempFile"
        $downloaded = $true
        break
    }
    # discard partial file, retry next source
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    $prevProgress = $global:ProgressPreference
    $global:ProgressPreference = 'SilentlyContinue'
    try {
        $enc = $url.Replace(' ', '%20')
        $expected = Get-RemoteSize $url
        Write-Info "Downloading installer from $url"
        curl.exe -sSfL -o "$tempFile" "$enc"
        $size = Get-LocalSize $tempFile
        $sizeOk = ($size -ne $null -and $size -gt 0 -and ($expected -eq $null -or $size -eq $expected))
        if ($LASTEXITCODE -eq 0 -and $sizeOk -and (Test-ValidInstaller $tempFile)) {
            Write-Ok "Download complete ($size bytes)."
            $downloaded = $true
            break
        }
        Write-Warn "Download incomplete, size mismatch, or corrupt file; trying next source..."
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Warn "Download failed: $_"
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    } finally {
        $global:ProgressPreference = $prevProgress
    }
}

if (-not $downloaded) {
    Write-Err "Failed to download a complete installer from all sources."
    exit 1
}

# --- silent install ---
Write-Info "Installing DNA Builder..."
& msiexec.exe /i "$tempFile" /quiet /norestart
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0 -or $exitCode -eq 3010) {
    Write-Ok "DNA Builder was installed successfully!"
} else {
    Write-Err "Installation failed with exit code $exitCode"
    exit $exitCode
}
