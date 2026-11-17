$certPath = Join-Path $PSScriptRoot "shirofpv-codesign.pfx"
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath, "ShiroFPV2026!", [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)

$targets = @(
    (Join-Path $PSScriptRoot "dist\TenmaScopeStudio-Setup-1.0.0.exe"),
    (Join-Path $PSScriptRoot "dist\win-unpacked\TenmaScopeStudio.exe")
)

foreach ($target in $targets) {
    if (Test-Path $target) {
        Write-Host "Signing $target with ShiroFPV Hardware Labs Certificate..."
        $sig = Set-AuthenticodeSignature -FilePath $target -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
        Write-Host "File:" (Split-Path $target -Leaf)
        Write-Host "Status:" $sig.Status
        Write-Host "Signer:" $sig.SignerCertificate.Subject
        Write-Host "TimeStamper:" $sig.TimeStamperCertificate.Subject
        Write-Host "----------------------------------------------------"
    } else {
        Write-Host "File not found: $target"
    }
}
