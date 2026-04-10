##############################################################################
# transcode.ps1 - ABR Encoding Script (Task 3)
# Chuyen doi video goc thanh 3 renditions: 360p, 720p, 1080p
#
# Usage:
#   .\transcode.ps1 -InputFile "path\to\source.mp4"
#   .\transcode.ps1 -InputFile "path\to\source.mp4" -OutputDir "custom\output"
#
# Yeu cau: FFmpeg >= 6.x da cai va co trong PATH
##############################################################################

param(
    [Parameter(Mandatory = $true, HelpMessage = "Path to source video")]
    [string]$InputFile,

    [Parameter(Mandatory = $false, HelpMessage = "Output directory (default: ./output)")]
    [string]$OutputDir = ".\output"
)

# --- Check FFmpeg ---
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] FFmpeg is not installed or not in PATH."
    Write-Host "   Install: winget install Gyan.FFmpeg"
    exit 1
}

# --- Check input file ---
if (-not (Test-Path $InputFile)) {
    Write-Error "[ERROR] Input file not found: $InputFile"
    exit 1
}

# --- Create output directory ---
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "[DIR] Created: $OutputDir"
}

# --- Get base filename ---
$BaseName = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)

# --- Define renditions ---
$Renditions = @(
    @{
        Name     = "360p"
        Scale    = "640:360"
        VideoBit = "800k"
        MaxRate  = "856k"
        BufSize  = "1200k"
        AudioBit = "96k"
    },
    @{
        Name     = "720p"
        Scale    = "1280:720"
        VideoBit = "2500k"
        MaxRate  = "2675k"
        BufSize  = "3750k"
        AudioBit = "128k"
    },
    @{
        Name     = "1080p"
        Scale    = "1920:1080"
        VideoBit = "5000k"
        MaxRate  = "5350k"
        BufSize  = "7500k"
        AudioBit = "192k"
    }
)

Write-Host ""
Write-Host "================================================================"
Write-Host "       ABR Encoding - Task 3 (NT219)"
Write-Host "       FFmpeg H.264 + AAC Transcoding"
Write-Host "================================================================"
Write-Host ""
Write-Host "[INPUT]  $InputFile"
Write-Host "[OUTPUT] $OutputDir"
Write-Host ""

# --- Show source video info ---
Write-Host "[INFO] Source video details:"
Write-Host "----------------------------------------"
ffmpeg -i $InputFile -hide_banner 2>&1 | Select-String -Pattern "Duration|Video|Audio|Stream"
Write-Host ""

# --- Encode each rendition ---
$TotalStart = Get-Date

foreach ($r in $Renditions) {
    $OutFile = Join-Path $OutputDir "$($BaseName)_$($r.Name).mp4"

    Write-Host "========================================"
    Write-Host "[ENCODING] $($r.Name) ($($r.Scale)) -> $OutFile"
    Write-Host "   Video: H.264 @ $($r.VideoBit) | Audio: AAC @ $($r.AudioBit)"
    Write-Host "========================================"

    $StartTime = Get-Date

    # FFmpeg arguments:
    #   -vf scale=W:H   : resize to target resolution
    #   -c:v libx264    : H.264 video codec
    #   -preset medium  : encoding speed/quality tradeoff
    #   -profile:v main : H.264 Main profile (wide compatibility)
    #   -b:v            : target video bitrate
    #   -maxrate        : maximum video bitrate (VBV buffer)
    #   -bufsize        : VBV buffer size
    #   -g 48           : GOP size (keyframe interval = 2s @ 24fps)
    #   -keyint_min 48  : minimum keyframe interval
    #   -sc_threshold 0 : disable scene change detection (consistent GOPs for ABR)
    #   -c:a aac        : AAC audio codec
    #   -b:a            : audio bitrate
    #   -movflags +faststart : move moov atom to beginning (web streaming)

    $FfmpegArgs = @(
        "-i", $InputFile,
        "-vf", "scale=$($r.Scale)",
        "-c:v", "libx264",
        "-preset", "medium",
        "-profile:v", "main",
        "-b:v", $r.VideoBit,
        "-maxrate", $r.MaxRate,
        "-bufsize", $r.BufSize,
        "-g", "48",
        "-keyint_min", "48",
        "-sc_threshold", "0",
        "-c:a", "aac",
        "-b:a", $r.AudioBit,
        "-ar", "44100",
        "-ac", "2",
        "-movflags", "+faststart",
        "-y",
        $OutFile
    )

    & ffmpeg @FfmpegArgs 2>&1 | Out-Null

    if ($LASTEXITCODE -eq 0 -or (Test-Path $OutFile)) {
        $Duration = (Get-Date) - $StartTime
        $FileSize = (Get-Item $OutFile).Length / 1MB
        Write-Host "[DONE] $($r.Name) completed! (Time: $([math]::Round($Duration.TotalSeconds, 1))s, Size: $([math]::Round($FileSize, 2)) MB)"
    }
    else {
        Write-Host "[FAIL] Error encoding $($r.Name)! Exit code: $LASTEXITCODE"
    }
    Write-Host ""
}

# --- Summary ---
$TotalDuration = (Get-Date) - $TotalStart

Write-Host "================================================================"
Write-Host "                    ENCODING RESULTS"
Write-Host "================================================================"
Write-Host ""
Write-Host "Total time: $([math]::Round($TotalDuration.TotalSeconds, 1))s"
Write-Host ""
Write-Host "Output files:"

foreach ($r in $Renditions) {
    $OutFile = Join-Path $OutputDir "$($BaseName)_$($r.Name).mp4"
    if (Test-Path $OutFile) {
        $Size = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
        Write-Host "  [OK] $($BaseName)_$($r.Name).mp4  ($Size MB)"
    }
    else {
        Write-Host "  [FAIL] $($BaseName)_$($r.Name).mp4"
    }
}

Write-Host ""
Write-Host "================================================================"
Write-Host " Next step: Package & Encrypt (shaka-packager)"
Write-Host "   cd ..\packager\"
Write-Host "   .\package_encrypt.ps1 --input ..\ingest\output\"
Write-Host "================================================================"
