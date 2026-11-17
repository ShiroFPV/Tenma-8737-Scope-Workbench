# Generate Code Signing Certificate for ShiroFPV Hardware Labs
$password = ConvertTo-SecureString -String "ShiroFPV2026!" -Force -AsPlainText

$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=ShiroFPV Hardware Labs, O=ShiroFPV, C=CH" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyExportPolicy Exportable `
    -KeySpec Signature `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddYears(5)

Write-Host "Created certificate with thumbprint:" $cert.Thumbprint

$pfxPath = Join-Path $PSScriptRoot "shirofpv-codesign.pfx"
$cerPath = Join-Path $PSScriptRoot "shirofpv-cert.cer"

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host "Exported PFX to $pfxPath"
Write-Host "Exported CER to $cerPath"

# Automatically trust this certificate on the current Windows machine:
# Add to CurrentUser\Root (Trusted Root Certification Authorities)
# Add to CurrentUser\TrustedPublisher (Trusted Publishers)
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store "Root", "CurrentUser"
$rootStore.Open("ReadWrite")
$rootStore.Add($cert)
$rootStore.Close()

$pubStore = New-Object System.Security.Cryptography.X509Certificates.X509Store "TrustedPublisher", "CurrentUser"
$pubStore.Open("ReadWrite")
$pubStore.Add($cert)
$pubStore.Close()

Write-Host "Installed and trusted certificate in CurrentUser\Root and CurrentUser\TrustedPublisher stores."
